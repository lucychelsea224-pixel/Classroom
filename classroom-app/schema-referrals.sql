-- =================================================================
-- Migration: referral system.
-- Every student gets a personal referral code. When someone signs up
-- using it and later goes Premium on any class level, the referrer
-- gets credit. Every 4 credited referrals earns the referrer 2 free
-- "topic credits" — each one unlocks ONE specific premium note/topic
-- of their choosing, in any subject. This is deliberately a small
-- taste, not a giveaway: unlocking a whole subject or class still
-- requires paying or a full activation code — referrals just let a
-- student sample a couple of individual premium topics, which is
-- what actually drives people to pay for the rest once they see it's
-- worth it.
-- =================================================================

alter table profiles add column if not exists referral_code text unique;
alter table profiles add column if not exists free_topic_credits int not null default 0;

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references auth.users(id) on delete cascade,
  referred_id uuid references auth.users(id) on delete cascade unique, -- one referrer per new user
  credited boolean not null default false, -- true once the referred user has gone Premium at least once
  created_at timestamptz not null default now()
);

alter table referrals enable row level security;

drop policy if exists "Users can view own referrals" on referrals;
create policy "Users can view own referrals" on referrals for select using (auth.uid() = referrer_id);

-- Per-note (per-topic) unlock, independent of the all-subjects Premium
-- flag on user_enrollments. A note is visible to a student if EITHER
-- their class-level is_premium is true (paid/activation code — every
-- subject) OR there's a matching row here (referral reward — just
-- that one topic).
create table if not exists note_unlocks (
  user_id uuid references auth.users(id) on delete cascade,
  note_id uuid references notes(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, note_id)
);

alter table note_unlocks enable row level security;

drop policy if exists "Users can view own note unlocks" on note_unlocks;
create policy "Users can view own note unlocks" on note_unlocks for select using (auth.uid() = user_id);

-- Generates this user's referral code if they don't already have one,
-- and returns it. Call once from the dashboard/menu when showing the
-- "invite a friend" screen.
create or replace function get_or_create_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  existing text;
  new_code text;
begin
  select referral_code into existing from profiles where id = auth.uid();
  if existing is not null then
    return existing;
  end if;

  -- 6 chars, uppercase letters + digits, retried on the rare collision.
  loop
    new_code := upper(substr(md5(random()::text || auth.uid()::text), 1, 6));
    begin
      update profiles set referral_code = new_code where id = auth.uid();
      return new_code;
    exception when unique_violation then
      -- collision — loop and try another code
    end;
  end loop;
end;
$$;

grant execute on function get_or_create_referral_code() to authenticated;

-- Called once, right after a new account's first sign-in, with the
-- code they entered at signup (if any). Records the referral; does
-- NOT credit it yet — that happens when the referred user goes
-- Premium (see credit_referral() below), so referrals can't be gamed
-- by just creating free accounts.
create or replace function record_referral(referral_code_input text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  referrer uuid;
begin
  if referral_code_input is null or referral_code_input = '' then
    return;
  end if;

  select id into referrer from profiles where referral_code = upper(referral_code_input);
  if referrer is null or referrer = auth.uid() then
    return; -- unknown code, or someone tried to refer themselves
  end if;

  insert into referrals (referrer_id, referred_id)
  values (referrer, auth.uid())
  on conflict (referred_id) do nothing;
end;
$$;

grant execute on function record_referral(text) to authenticated;

-- Called from the same place premium status gets set (verify-payment
-- edge function, and the redeem_code function) right after a user's
-- FIRST successful unlock on any class level. Credits their referral
-- (if any, and if not already credited) and, every 4 credited
-- referrals, adds 2 free_topic_credits to the referrer — NOT a full
-- activation code. The referrer picks exactly which topic (in any
-- subject) to spend each credit on, from the Refer a Friend page.
create or replace function credit_referral(new_premium_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ref_row referrals;
  credited_count int;
begin
  select * into ref_row from referrals where referred_id = new_premium_user_id and credited = false;
  if ref_row is null then
    return; -- this user wasn't referred, or was already credited
  end if;

  update referrals set credited = true where id = ref_row.id;

  select count(*) into credited_count from referrals where referrer_id = ref_row.referrer_id and credited = true;

  if credited_count > 0 and credited_count % 4 = 0 then
    update profiles set free_topic_credits = free_topic_credits + 2 where id = ref_row.referrer_id;
  end if;
end;
$$;

grant execute on function credit_referral(uuid) to authenticated;

-- Spends one free_topic_credit to unlock one specific note/topic.
-- Called from the Refer a Friend page once the student has picked
-- exactly which topic they want (any subject, any class level they're
-- enrolled in).
create or replace function redeem_topic_credit(target_note_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_credits int;
begin
  select free_topic_credits into current_credits from profiles where id = auth.uid();
  if coalesce(current_credits, 0) < 1 then
    return jsonb_build_object('success', false, 'message', 'No free topic credits available.');
  end if;

  if not exists (select 1 from notes where id = target_note_id) then
    return jsonb_build_object('success', false, 'message', 'That topic could not be found.');
  end if;

  insert into note_unlocks (user_id, note_id)
  values (auth.uid(), target_note_id)
  on conflict (user_id, note_id) do nothing;

  update profiles set free_topic_credits = free_topic_credits - 1 where id = auth.uid();

  return jsonb_build_object('success', true, 'message', 'Topic unlocked!');
end;
$$;

grant execute on function redeem_topic_credit(uuid) to authenticated;

-- Patches redeem_code() (from schema-class-levels.sql) to also credit
-- the referral system — identical to the original except for the one
-- new line calling credit_referral(). Safe to run even if you run
-- schema-class-levels.sql again later; create-or-replace just points
-- redeem_code at whichever version ran most recently.
create or replace function redeem_code(code_input text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  found_code activation_codes%rowtype;
begin
  select * into found_code from activation_codes where code = upper(trim(code_input));

  if not found then
    return json_build_object('success', false, 'message', 'That code isn''t valid.');
  end if;

  if found_code.is_used then
    return json_build_object('success', false, 'message', 'That code has already been used.');
  end if;

  update activation_codes
    set is_used = true, used_by = auth.uid(), used_at = now()
    where code = found_code.code;

  insert into user_enrollments (user_id, class_level_id, is_premium, premium_unlocked_at)
  values (auth.uid(), found_code.class_level, true, now())
  on conflict (user_id, class_level_id)
    do update set is_premium = true, premium_unlocked_at = now();

  perform credit_referral(auth.uid());

  return json_build_object('success', true, 'message', 'Unlocked! All premium topics for this class are now available.');
end;
$$;


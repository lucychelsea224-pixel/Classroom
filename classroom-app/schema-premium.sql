-- =================================================================
-- Migration: premium content locking + Paystack payments +
-- activation codes. Run in Supabase -> SQL Editor, after your
-- earlier schema files.
-- =================================================================

-- Which notes are locked behind the paywall
alter table notes add column if not exists is_locked boolean not null default false;

-- Tracks whether a user has unlocked all premium content
alter table profiles add column if not exists is_premium boolean not null default false;
alter table profiles add column if not exists premium_unlocked_at timestamptz;

-- A record of every verified Paystack payment (for your own records /
-- support lookups — the actual unlock decision is made server-side,
-- never trusted from the browser)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  reference text unique not null,
  amount int not null,          -- amount in the smallest currency unit (e.g. kobo for NGN)
  currency text not null,
  status text not null default 'pending', -- 'pending' | 'success' | 'failed'
  created_at timestamptz default now()
);

-- Activation codes you can generate and sell manually (e.g. bank
-- transfer, in person) as an alternative to card payment.
create table if not exists activation_codes (
  code text primary key,
  is_used boolean not null default false,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz default now(),
  note text  -- optional: who this batch of codes was generated for
);

-- =================================================================
-- Row Level Security
-- =================================================================
alter table payments enable row level security;
alter table activation_codes enable row level security;

-- Users can see their own payment history
create policy "Users can view own payments"
  on payments for select using (auth.uid() = user_id);

-- Only the admin can create/view activation codes directly.
-- (Redeeming a code happens through the redeem_code() function below,
-- which runs with elevated privileges, so students never need direct
-- table access to activation_codes.)
create policy "Admin can manage activation codes"
  on activation_codes for all using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

-- =================================================================
-- Auto-create a profiles row for every new signup.
-- Without this, isPremiumUser() and redeem_code() would silently
-- do nothing for any user who doesn't already have a profiles row —
-- worth running even if you think you don't need it yet.
-- =================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create profiles rows for any existing users (including
-- your admin account) who signed up before this trigger existed.
insert into profiles (id, email)
select id, email from auth.users
where id not in (select id from profiles);

-- =================================================================
-- redeem_code(): lets a logged-in student redeem a code themselves.
-- Runs as SECURITY DEFINER so it can update activation_codes and
-- profiles even though the student has no direct write access to
-- either — but it still only ever acts on the calling user's own
-- account (auth.uid()), so it can't be used to unlock someone else's.
-- =================================================================
create or replace function redeem_code(code_input text)
returns json
language plpgsql
security definer
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

  update profiles
    set is_premium = true, premium_unlocked_at = now()
    where id = auth.uid();

  return json_build_object('success', true, 'message', 'Unlocked! All premium topics are now available.');
end;
$$;

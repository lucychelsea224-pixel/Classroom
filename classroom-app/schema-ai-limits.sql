-- =================================================================
-- Migration: daily point limit for the AI study assistant.
-- Each student gets 500 points/day, refilled automatically 24 hours
-- after their last reset. Dictionary lookups (in ai-tutor.html) are
-- free and never touch this — only real AI questions cost points,
-- currently 10 points each (≈ 50 questions/day). Change the cost
-- inside consume_ai_points() below if you want a different balance.
-- Run in Supabase -> SQL Editor.
-- =================================================================

alter table profiles add column if not exists ai_points_remaining int not null default 500;
alter table profiles add column if not exists ai_points_reset_at timestamptz not null default now();

-- Called by the ask-ai Edge Function before every AI question.
-- Runs as SECURITY DEFINER so it can update points even though
-- students have no direct write access to profiles.ai_points_*,
-- but it only ever acts on the calling user's own account.
create or replace function consume_ai_points(cost int default 10)
returns json
language plpgsql
security definer
as $$
declare
  prof profiles%rowtype;
begin
  select * into prof from profiles where id = auth.uid();

  if not found then
    return json_build_object('allowed', false, 'message', 'Profile not found.');
  end if;

  -- Refill once 24 hours have passed since the last reset
  if prof.ai_points_reset_at < now() - interval '24 hours' then
    update profiles set ai_points_remaining = 500, ai_points_reset_at = now()
      where id = auth.uid();
    prof.ai_points_remaining := 500;
  end if;

  if prof.ai_points_remaining < cost then
    return json_build_object(
      'allowed', false,
      'remaining', prof.ai_points_remaining,
      'message', 'You''ve used up today''s study assistant questions. More will be available in a few hours!'
    );
  end if;

  update profiles set ai_points_remaining = ai_points_remaining - cost
    where id = auth.uid()
    returning ai_points_remaining into prof.ai_points_remaining;

  return json_build_object('allowed', true, 'remaining', prof.ai_points_remaining);
end;
$$;

-- Called by ai-tutor.html just to display the current balance,
-- without spending any points. Also handles the same 24-hour
-- refill, so the number shown is never stale.
create or replace function get_ai_points()
returns json
language plpgsql
security definer
as $$
declare
  prof profiles%rowtype;
begin
  select * into prof from profiles where id = auth.uid();
  if not found then
    return json_build_object('remaining', 0);
  end if;

  if prof.ai_points_reset_at < now() - interval '24 hours' then
    update profiles set ai_points_remaining = 500, ai_points_reset_at = now()
      where id = auth.uid();
    return json_build_object('remaining', 500);
  end if;

  return json_build_object('remaining', prof.ai_points_remaining);
end;
$$;

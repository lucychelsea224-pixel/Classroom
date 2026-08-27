-- =================================================================
-- Migration: study streaks.
-- Tracks consecutive days a student has done something (opened a
-- note, taken a test) and shows it on the dashboard. Deliberately
-- does NOT include push notifications/reminders — that needs real
-- infrastructure (a service worker push subscription per device, a
-- backend cron job, and Anthropic... err, web-push credentials) well
-- beyond a single migration. This is the achievable half: the streak
-- itself, visible whenever the student opens the app.
-- =================================================================

create table if not exists study_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active_date date,
  updated_at timestamptz not null default now()
);

alter table study_streaks enable row level security;

drop policy if exists "Users can view own streak" on study_streaks;
create policy "Users can view own streak" on study_streaks for select using (auth.uid() = user_id);

drop policy if exists "Users can update own streak" on study_streaks;
create policy "Users can update own streak" on study_streaks for all using (auth.uid() = user_id);

-- Call this once per session (e.g. when the dashboard loads) — it's
-- idempotent for a given day, so calling it multiple times in the
-- same day is harmless and won't inflate the streak.
create or replace function bump_study_streak()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := current_date;
  row_data study_streaks;
  new_current int;
  new_longest int;
begin
  select * into row_data from study_streaks where user_id = auth.uid();

  if row_data is null then
    insert into study_streaks (user_id, current_streak, longest_streak, last_active_date)
    values (auth.uid(), 1, 1, today)
    returning * into row_data;
    return jsonb_build_object('current_streak', 1, 'longest_streak', 1);
  end if;

  if row_data.last_active_date = today then
    return jsonb_build_object('current_streak', row_data.current_streak, 'longest_streak', row_data.longest_streak);
  elsif row_data.last_active_date = today - 1 then
    new_current := row_data.current_streak + 1;
  else
    new_current := 1; -- streak broken — more than a day was missed
  end if;

  new_longest := greatest(row_data.longest_streak, new_current);

  update study_streaks
    set current_streak = new_current, longest_streak = new_longest, last_active_date = today, updated_at = now()
    where user_id = auth.uid();

  return jsonb_build_object('current_streak', new_current, 'longest_streak', new_longest);
end;
$$;

grant execute on function bump_study_streak() to authenticated;

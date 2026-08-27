-- =================================================================
-- Migration: admin analytics.
-- Adds one function, get_admin_analytics(), that the Admin panel's
-- new Analytics tab calls to get everything it needs in a single
-- request — enrolled/premium counts per class level, content counts,
-- which subjects actually get used, revenue, and a 30-day signup trend.
--
-- Deliberately NOT implemented as plain views: a view's default
-- permissions would run as the view owner and could leak revenue and
-- per-user data to any logged-in student, bypassing the RLS policies
-- on payments/user_enrollments/quiz_attempts. This function checks
-- admin status explicitly, on every call, before returning anything —
-- a non-admin calling it gets an empty result, never an error that
-- reveals whether they're close, and never real data.
-- =================================================================

create or replace function get_admin_analytics()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  is_caller_admin boolean;
  result jsonb;
begin
  select is_admin into is_caller_admin from profiles where id = auth.uid();
  if not coalesce(is_caller_admin, false) then
    return '{}'::jsonb;
  end if;

  select jsonb_build_object(
    'class_levels', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select
          cl.id as class_level_id,
          cl.name as class_level_name,
          cl.display_order,
          count(distinct ue.user_id) as enrolled_count,
          count(distinct ue.user_id) filter (where ue.is_premium) as premium_count,
          (select count(*) from notes n where n.class_level = cl.id) as note_count,
          (select count(*) from questions q where q.class_level = cl.id) as question_count
        from class_levels cl
        left join user_enrollments ue on ue.class_level_id = cl.id
        group by cl.id, cl.name, cl.display_order
        order by cl.display_order
      ) t
    ),
    'subject_activity', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select
          qa.class_level,
          qa.subject_id,
          count(*) as attempt_count,
          count(distinct qa.user_id) as active_students
        from quiz_attempts qa
        group by qa.class_level, qa.subject_id
        order by count(*) desc
        limit 15
      ) t
    ),
    'revenue', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select
          p.class_level,
          p.currency,
          count(*) as payment_count,
          sum(p.amount) as total_amount
        from payments p
        where p.status = 'success'
        group by p.class_level, p.currency
      ) t
    ),
    'signups_30d', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select
          date_trunc('day', created_at)::date as signup_date,
          count(*) as signup_count
        from profiles
        where created_at >= now() - interval '30 days'
        group by 1
        order by 1
      ) t
    ),
    'total_users', (select count(*) from profiles),
    'total_premium', (select count(*) from user_enrollments where is_premium)
  ) into result;

  return result;
end;
$$;

-- Any logged-in user can call this function (that's fine — the admin
-- check happens inside it, on every call, and a non-admin always gets
-- back an empty object).
grant execute on function get_admin_analytics() to authenticated;

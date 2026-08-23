-- =================================================================
-- Migration: dynamic pricing, editable from the admin panel instead
-- of hardcoded in a file. Publicly readable (Paystack's compliance
-- review requires pricing to be visible on the site without login),
-- admin-only to change.
-- Run in Supabase -> SQL Editor.
-- =================================================================

create table if not exists pricing_settings (
  currency text primary key,
  amount numeric not null,
  symbol text not null,
  updated_at timestamptz default now()
);

insert into pricing_settings (currency, amount, symbol) values
  ('NGN', 2000, '₦'),
  ('USD', 3, '$'),
  ('GHS', 25, '₵'),
  ('ZAR', 45, 'R'),
  ('KES', 350, 'KSh')
on conflict (currency) do nothing;

alter table pricing_settings enable row level security;

drop policy if exists "Anyone can view pricing" on pricing_settings;
create policy "Anyone can view pricing"
  on pricing_settings for select using (true);

drop policy if exists "Admin can update pricing" on pricing_settings;
create policy "Admin can update pricing"
  on pricing_settings for update using (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

drop policy if exists "Admin can insert pricing" on pricing_settings;
create policy "Admin can insert pricing"
  on pricing_settings for insert with check (
    exists (select 1 from profiles where id = auth.uid() and is_admin = true)
  );

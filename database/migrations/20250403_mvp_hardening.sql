create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create schema if not exists app;

create or replace function app.current_facility_id()
returns uuid
language sql
stable
as $$
    select nullif(
        coalesce(
            nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'facility_id',
            nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'app_metadata' ->> 'facility_id',
            nullif(current_setting('request.jwt.claims', true), '')::jsonb -> 'user_metadata' ->> 'facility_id'
        ),
        ''
    )::uuid
$$;

alter table shifts
    add constraint shifts_unique_window unique (facility_id, staff_id, start_time, end_time);

alter table shifts
    add constraint shifts_no_overlap exclude using gist (
        facility_id with =,
        staff_id with =,
        tsrange(start_time, end_time, '[)') with &&
    );

alter table daily_compliance
    add column if not exists actual_permanent_minutes integer not null default 0 check (actual_permanent_minutes >= 0);

alter table alerts
    alter column suggested_staff_ids type jsonb using
        case
            when suggested_staff_ids is null or suggested_staff_ids = '' then '[]'::jsonb
            else suggested_staff_ids::jsonb
        end,
    alter column suggested_staff_ids set default '[]'::jsonb;

create table if not exists compliance_targets (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null references facilities(id) on delete cascade,
    effective_date date not null,
    daily_total_target integer not null check (daily_total_target >= 0),
    rn_daily_minimum integer not null check (rn_daily_minimum >= 0),
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    unique (facility_id, effective_date)
);

create table if not exists facility_resident_counts (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null references facilities(id) on delete cascade,
    effective_date date not null,
    resident_count integer not null check (resident_count >= 0),
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    unique (facility_id, effective_date)
);

create index if not exists idx_compliance_targets_facility_id on compliance_targets(facility_id);
create index if not exists idx_compliance_targets_effective_date on compliance_targets(effective_date);
create index if not exists idx_facility_resident_counts_facility_id on facility_resident_counts(facility_id);
create index if not exists idx_facility_resident_counts_effective_date on facility_resident_counts(effective_date);

insert into compliance_targets (
    facility_id,
    effective_date,
    daily_total_target,
    rn_daily_minimum
)
select
    facilities.id,
    current_date,
    facilities.care_minutes_target,
    facilities.rn_minutes_target
from facilities
where not exists (
    select 1
    from compliance_targets
    where compliance_targets.facility_id = facilities.id
);

insert into facility_resident_counts (
    facility_id,
    effective_date,
    resident_count
)
select
    facilities.id,
    current_date,
    facilities.resident_count
from facilities
where not exists (
    select 1
    from facility_resident_counts
    where facility_resident_counts.facility_id = facilities.id
);

alter table facilities enable row level security;
alter table compliance_targets enable row level security;
alter table facility_resident_counts enable row level security;
alter table app_users enable row level security;
alter table staff enable row level security;
alter table shifts enable row level security;
alter table daily_compliance enable row level security;
alter table quarterly_forecasts enable row level security;
alter table alerts enable row level security;
alter table reports enable row level security;

drop policy if exists facilities_select_own on facilities;
create policy facilities_select_own on facilities
    for select using (id = app.current_facility_id());

drop policy if exists facilities_update_own on facilities;
create policy facilities_update_own on facilities
    for update using (id = app.current_facility_id())
    with check (id = app.current_facility_id());

drop policy if exists compliance_targets_own on compliance_targets;
create policy compliance_targets_own on compliance_targets
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists facility_resident_counts_own on facility_resident_counts;
create policy facility_resident_counts_own on facility_resident_counts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists app_users_own on app_users;
create policy app_users_own on app_users
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists staff_own on staff;
create policy staff_own on staff
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists shifts_own on shifts;
create policy shifts_own on shifts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists daily_compliance_own on daily_compliance;
create policy daily_compliance_own on daily_compliance
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists quarterly_forecasts_own on quarterly_forecasts;
create policy quarterly_forecasts_own on quarterly_forecasts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists alerts_own on alerts;
create policy alerts_own on alerts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

drop policy if exists reports_own on reports;
create policy reports_own on reports
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

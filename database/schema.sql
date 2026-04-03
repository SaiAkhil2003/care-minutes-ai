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

create table facilities (
    id uuid primary key default gen_random_uuid(),
    name varchar(255) not null,
    email varchar(255) unique not null,
    phone varchar(20),
    address text,
    resident_count integer not null check (resident_count >= 0),
    care_minutes_target integer not null default 215 check (care_minutes_target >= 0),
    rn_minutes_target integer not null default 44 check (rn_minutes_target >= 0),
    timezone varchar(100) not null default 'Australia/Sydney',
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
);

create table compliance_targets (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null references facilities(id) on delete cascade,
    effective_date date not null,
    daily_total_target integer not null check (daily_total_target >= 0),
    rn_daily_minimum integer not null check (rn_daily_minimum >= 0),
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    unique (facility_id, effective_date)
);

create table facility_resident_counts (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null references facilities(id) on delete cascade,
    effective_date date not null,
    resident_count integer not null check (resident_count >= 0),
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    unique (facility_id, effective_date)
);

create table app_users (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null,
    full_name varchar(255) not null,
    email varchar(255) unique not null,
    password_hash text,
    role varchar(50) not null check (role in ('admin', 'manager', 'don')),
    is_active boolean default true,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    foreign key (facility_id) references facilities(id) on delete cascade
);

create table staff (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null,
    full_name varchar(255) not null,
    email varchar(255),
    phone varchar(20),
    staff_type varchar(20) not null check (staff_type in ('rn', 'en', 'pcw')),
    employment_type varchar(20) not null check (employment_type in ('permanent', 'part_time', 'casual', 'agency')),
    is_active boolean default true,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    foreign key (facility_id) references facilities(id) on delete cascade
);

create table shifts (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null,
    staff_id uuid not null,
    shift_date date not null,
    start_time timestamp not null,
    end_time timestamp not null,
    duration_minutes integer not null check (duration_minutes >= 0),
    staff_type_snapshot varchar(20) not null check (staff_type_snapshot in ('rn', 'en', 'pcw')),
    employment_type_snapshot varchar(20) not null check (employment_type_snapshot in ('permanent', 'part_time', 'casual', 'agency')),
    notes text,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    foreign key (facility_id) references facilities(id) on delete cascade,
    foreign key (staff_id) references staff(id) on delete cascade,
    unique (facility_id, staff_id, start_time, end_time),
    exclude using gist (
        facility_id with =,
        staff_id with =,
        tsrange(start_time, end_time, '[)') with &&
    )
);

create table daily_compliance (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null,
    compliance_date date not null,
    resident_count integer not null check (resident_count >= 0),
    required_total_minutes integer not null check (required_total_minutes >= 0),
    required_rn_minutes integer not null check (required_rn_minutes >= 0),
    actual_total_minutes integer not null default 0 check (actual_total_minutes >= 0),
    actual_rn_minutes integer not null default 0 check (actual_rn_minutes >= 0),
    actual_en_minutes integer not null default 0 check (actual_en_minutes >= 0),
    actual_pcw_minutes integer not null default 0 check (actual_pcw_minutes >= 0),
    actual_agency_minutes integer not null default 0 check (actual_agency_minutes >= 0),
    actual_permanent_minutes integer not null default 0 check (actual_permanent_minutes >= 0),
    compliance_percent numeric(5,2) not null default 0.00,
    rn_compliance_percent numeric(5,2) not null default 0.00,
    status varchar(10) not null check (status in ('red', 'amber', 'green')),
    is_total_target_met boolean default false,
    is_rn_target_met boolean default false,
    penalty_amount numeric(10,2) default 0.00,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    unique (facility_id, compliance_date),
    foreign key (facility_id) references facilities(id) on delete cascade
);

create table quarterly_forecasts (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null,
    quarter_start_date date not null,
    quarter_end_date date not null,
    days_elapsed integer not null default 0 check (days_elapsed >= 0),
    days_remaining integer not null default 0 check (days_remaining >= 0),
    actual_minutes_so_far integer not null default 0 check (actual_minutes_so_far >= 0),
    required_minutes_so_far integer not null default 0 check (required_minutes_so_far >= 0),
    projected_total_minutes integer not null default 0 check (projected_total_minutes >= 0),
    projected_compliance_percent numeric(5,2) not null default 0.00,
    minutes_needed_per_day_to_recover numeric(10,2) not null default 0.00,
    estimated_penalty_risk numeric(12,2) not null default 0.00,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp,
    foreign key (facility_id) references facilities(id) on delete cascade
);

create table alerts (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null,
    alert_date date not null,
    alert_type varchar(20) not null check (alert_type in ('info', 'warning', 'critical')),
    status varchar(20) not null check (status in ('sent', 'pending', 'failed')),
    title varchar(255) not null,
    message text not null,
    recommended_action text,
    suggested_staff_ids jsonb default '[]'::jsonb,
    delivery_channel varchar(20) not null check (delivery_channel in ('email', 'in_app', 'sms')),
    is_read boolean default false,
    created_at timestamp default current_timestamp,
    foreign key (facility_id) references facilities(id) on delete cascade
);

create table reports (
    id uuid primary key default gen_random_uuid(),
    facility_id uuid not null,
    report_type varchar(50) not null check (report_type in ('audit_pdf', 'quarterly_summary')),
    start_date date not null,
    end_date date not null,
    file_name varchar(255) not null,
    file_url text,
    generated_by uuid,
    generated_at timestamp default current_timestamp,
    foreign key (facility_id) references facilities(id) on delete cascade,
    foreign key (generated_by) references app_users(id) on delete set null
);

create index idx_users_facility_id on app_users(facility_id);
create index idx_compliance_targets_facility_id on compliance_targets(facility_id);
create index idx_compliance_targets_effective_date on compliance_targets(effective_date);
create index idx_facility_resident_counts_facility_id on facility_resident_counts(facility_id);
create index idx_facility_resident_counts_effective_date on facility_resident_counts(effective_date);
create index idx_staff_facility_id on staff(facility_id);
create index idx_shifts_facility_id on shifts(facility_id);
create index idx_shifts_staff_id on shifts(staff_id);
create index idx_shifts_shift_date on shifts(shift_date);
create index idx_daily_compliance_facility_id on daily_compliance(facility_id);
create index idx_daily_compliance_date on daily_compliance(compliance_date);
create index idx_quarterly_forecasts_facility_id on quarterly_forecasts(facility_id);
create index idx_alerts_facility_id on alerts(facility_id);
create index idx_reports_facility_id on reports(facility_id);

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

create policy facilities_select_own on facilities
    for select using (id = app.current_facility_id());

create policy facilities_update_own on facilities
    for update using (id = app.current_facility_id())
    with check (id = app.current_facility_id());

create policy compliance_targets_own on compliance_targets
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy facility_resident_counts_own on facility_resident_counts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy app_users_own on app_users
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy staff_own on staff
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy shifts_own on shifts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy daily_compliance_own on daily_compliance
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy quarterly_forecasts_own on quarterly_forecasts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy alerts_own on alerts
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

create policy reports_own on reports
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

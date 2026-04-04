create table if not exists facility_settings (
    facility_id uuid primary key references facilities(id) on delete cascade,
    manager_full_name varchar(255),
    manager_role varchar(120),
    manager_email varchar(255),
    manager_phone varchar(20),
    alert_send_time time not null default '07:00',
    alert_in_app_enabled boolean not null default true,
    alert_email_enabled boolean not null default false,
    alert_escalate_rn_gap boolean not null default true,
    alert_include_weekly_digest boolean not null default false,
    subsidy_model varchar(100) not null default 'AN-ACC',
    protected_revenue_buffer numeric(8,2) not null default 2.00 check (protected_revenue_buffer >= 0),
    language varchar(100) not null default 'English',
    locale varchar(20) not null default 'en-AU',
    week_starts_on varchar(20) not null default 'Monday',
    alert_recipients jsonb not null default '[]'::jsonb,
    created_at timestamp default current_timestamp,
    updated_at timestamp default current_timestamp
);

alter table facility_settings enable row level security;

drop policy if exists facility_settings_own on facility_settings;
create policy facility_settings_own on facility_settings
    for all using (facility_id = app.current_facility_id())
    with check (facility_id = app.current_facility_id());

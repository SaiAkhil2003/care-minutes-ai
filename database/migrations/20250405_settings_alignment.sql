alter table facilities
    add column if not exists abn varchar(11),
    add column if not exists state varchar(10),
    add column if not exists street_address text,
    add column if not exists postcode varchar(4);

alter table facility_settings
    add column if not exists manager_name varchar(255),
    add column if not exists alert_sms_enabled boolean not null default false,
    add column if not exists anacc_rate_per_resident numeric(10,2) not null default 31.64,
    add column if not exists date_format varchar(20) not null default 'DD/MM/YYYY',
    add column if not exists currency_display varchar(10) not null default 'AUD',
    add column if not exists show_cents boolean not null default false;

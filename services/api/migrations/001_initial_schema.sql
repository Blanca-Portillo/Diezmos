-- Diezmos initial schema. This migration intentionally contains no seed data.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE church_profile (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    timezone text NOT NULL DEFAULT 'America/El_Salvador',
    currency char(3) NOT NULL DEFAULT 'USD',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name varchar(180) NOT NULL,
    phone varchar(40),
    email varchar(254),
    status varchar(24) NOT NULL DEFAULT 'Activo' CHECK (status IN ('Activo', 'Inactivo', 'Visitante')),
    joined_on date,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_members_status ON members(status);
CREATE INDEX ix_members_name ON members(full_name);

CREATE TABLE groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(160) NOT NULL,
    description varchar(1000),
    leader_name varchar(180),
    meeting_schedule varchar(180),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
    id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, member_id)
);

CREATE TABLE services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(180) NOT NULL,
    starts_at timestamptz NOT NULL,
    location varchar(180),
    notes varchar(2000),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_services_starts_at ON services(starts_at);

CREATE TABLE attendance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    attended_on date NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('Presente', 'Ausente')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (service_id, member_id)
);
CREATE INDEX ix_attendance_date ON attendance(attended_on);

CREATE TABLE resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title varchar(240) NOT NULL,
    description varchar(2000),
    speaker varchar(180),
    preached_on date,
    blob_name varchar(300),
    file_name varchar(180),
    content_type varchar(160),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_resources_preached_on ON resources(preached_on);

CREATE TABLE treasury_movements (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direction varchar(12) NOT NULL CHECK (direction IN ('Ingreso', 'Egreso')),
    category varchar(80) NOT NULL,
    amount numeric(14,2) NOT NULL CHECK (amount > 0),
    occurred_on date NOT NULL,
    description varchar(500),
    member_id uuid REFERENCES members(id) ON DELETE SET NULL,
    member_name varchar(180),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_treasury_occurred_on ON treasury_movements(occurred_on);
CREATE INDEX ix_treasury_category ON treasury_movements(category, direction);

CREATE TABLE pastoral_followups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subject varchar(180) NOT NULL,
    follow_up_on date NOT NULL,
    assigned_to varchar(180) NOT NULL,
    status varchar(24) NOT NULL DEFAULT 'Pendiente' CHECK (status IN ('Pendiente', 'En seguimiento', 'Cerrado')),
    notes text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_pastoral_followups_date ON pastoral_followups(follow_up_on);

CREATE TABLE audit_log (
    id bigserial PRIMARY KEY,
    actor varchar(254) NOT NULL,
    operation varchar(16) NOT NULL,
    entity_name varchar(80) NOT NULL,
    entity_id uuid,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_log(entity_name, occurred_at DESC);
CREATE INDEX ix_audit_actor ON audit_log(actor, occurred_at DESC);

COMMIT;

-- ==============================================================================
-- Schema: 001_initial_schema.sql
-- Description: Unified production schema for Multi-Factor Hostel Curfew & Presence
--              Verification System (PostgreSQL 14+).
-- ==============================================================================

-- 1. Enable Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom Role & Status Enums
CREATE TYPE user_role AS ENUM ('RESIDENT', 'WARDEN', 'ADMIN', 'SUPER_ADMIN');
CREATE TYPE user_status AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');
CREATE TYPE device_status AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REVOKED');
CREATE TYPE network_provider_type AS ENUM ('SUBNET_CIDR', 'GATEWAY_IP', 'MOCK_DEV', 'API_CONTROLLER');
CREATE TYPE verification_status AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'FAILED', 'REJECTED');
CREATE TYPE presence_event_type AS ENUM ('ENTRY', 'EXIT');
CREATE TYPE presence_event_status AS ENUM ('VERIFIED_INSIDE', 'VERIFIED_OUTSIDE', 'FLAGGED');
CREATE TYPE presence_source AS ENUM ('VERIFICATION_SESSION', 'WARDEN_MANUAL', 'ADMIN_OVERRIDE');
CREATE TYPE leave_type AS ENUM ('OUTPASS', 'NIGHT_OUT', 'EMERGENCY', 'HOME_VISIT');
CREATE TYPE leave_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE notification_type AS ENUM ('CURFEW_ALERT', 'VERIFICATION_REQUEST', 'LEAVE_UPDATE', 'SYSTEM_NOTICE');
CREATE TYPE admin_action_type AS ENUM ('CURFEW_RULE_CHANGE', 'BULK_STATUS_OVERRIDE', 'DEVICE_FORCE_REASSIGN', 'ACCOUNT_LIFECYCLE', 'SYSTEM_CONFIG');

-- 3. Core Tables
CREATE TABLE IF NOT EXISTS hostels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(20) NOT NULL UNIQUE,
    address TEXT,
    total_capacity INT NOT NULL CHECK (total_capacity > 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id UUID NOT NULL REFERENCES hostels(id) ON DELETE RESTRICT,
    room_number VARCHAR(20) NOT NULL,
    floor INT NOT NULL CHECK (floor >= 0),
    capacity INT NOT NULL CHECK (capacity > 0),
    current_occupancy INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_hostel_room UNIQUE (hostel_id, room_number),
    CONSTRAINT chk_room_occupancy CHECK (current_occupancy >= 0 AND current_occupancy <= capacity)
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role user_role NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status user_status NOT NULL DEFAULT 'PENDING_ACTIVATION',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_user_email_format CHECK (email LIKE '%@%.%')
);

CREATE TABLE IF NOT EXISTS residents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    roll_number VARCHAR(50) NOT NULL UNIQUE,
    hostel_id UUID NOT NULL REFERENCES hostels(id) ON DELETE RESTRICT,
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
    emergency_contact_name VARCHAR(100) NOT NULL,
    emergency_contact_phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    device_identifier VARCHAR(255) NOT NULL UNIQUE,
    device_model VARCHAR(100) NOT NULL,
    os_name VARCHAR(50) NOT NULL CHECK (os_name IN ('ANDROID', 'IOS', 'TEST_OS')),
    os_version VARCHAR(50) NOT NULL,
    status device_status NOT NULL DEFAULT 'PENDING_APPROVAL',
    registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_device_revocation CHECK (
        (status = 'REVOKED' AND revoked_at IS NOT NULL) OR
        (status != 'REVOKED')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resident_active_device 
ON devices (resident_id) 
WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS network_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id UUID NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    policy_name VARCHAR(100) NOT NULL,
    provider_type network_provider_type NOT NULL,
    network_identifier VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_hostel_network_policy UNIQUE (hostel_id, policy_name)
);

CREATE TABLE IF NOT EXISTS verification_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,
    session_nonce_hash VARCHAR(64) NOT NULL UNIQUE,
    challenge_issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    challenge_expires_at TIMESTAMPTZ NOT NULL,
    biometric_verified BOOLEAN NOT NULL DEFAULT FALSE,
    network_verified BOOLEAN NOT NULL DEFAULT FALSE,
    status verification_status NOT NULL DEFAULT 'PENDING',
    failure_reason VARCHAR(255),
    consumed_at TIMESTAMPTZ,
    client_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_challenge_expiry CHECK (challenge_expires_at > challenge_issued_at),
    CONSTRAINT chk_consumption_time CHECK (consumed_at IS NULL OR consumed_at >= challenge_issued_at)
);

CREATE TABLE IF NOT EXISTS presence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE RESTRICT,
    event_type presence_event_type NOT NULL,
    source presence_source NOT NULL DEFAULT 'VERIFICATION_SESSION',
    verification_attempt_id UUID REFERENCES verification_attempts(id) ON DELETE SET NULL,
    event_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    curfew_date DATE NOT NULL,
    status presence_event_status NOT NULL,
    network_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS curfew_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id UUID NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
    curfew_time TIME NOT NULL,
    grace_period_minutes INT NOT NULL DEFAULT 15 CHECK (grace_period_minutes >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    leave_type leave_type NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    reason TEXT NOT NULL,
    status leave_status NOT NULL DEFAULT 'PENDING',
    approver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    decision_reason TEXT,
    decision_timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_leave_duration CHECK (end_time > start_time),
    CONSTRAINT chk_leave_decision CHECK (
        (status IN ('APPROVED', 'REJECTED') AND approver_id IS NOT NULL AND decision_timestamp IS NOT NULL) OR
        (status IN ('PENDING', 'CANCELLED'))
    )
);

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    type notification_type NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_entity VARCHAR(100) NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    reason TEXT NOT NULL,
    ip_address VARCHAR(45),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_audit_reason_not_empty CHECK (reason <> '')
);

CREATE TABLE IF NOT EXISTS admin_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action_type admin_action_type NOT NULL,
    target_id VARCHAR(255) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    justification TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_admin_justification_not_empty CHECK (justification <> '')
);

-- 4. Performance & Composite Indexes
CREATE INDEX IF NOT EXISTS idx_residents_hostel_id ON residents (hostel_id);
CREATE INDEX IF NOT EXISTS idx_residents_room_id ON residents (room_id);
CREATE INDEX IF NOT EXISTS idx_devices_resident_id ON devices (resident_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);

CREATE INDEX IF NOT EXISTS idx_presence_events_resident_id ON presence_events (resident_id);
CREATE INDEX IF NOT EXISTS idx_presence_events_curfew_date ON presence_events (curfew_date);
CREATE INDEX IF NOT EXISTS idx_presence_events_status ON presence_events (status);
CREATE INDEX IF NOT EXISTS idx_presence_events_server_timestamp ON presence_events (server_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_presence_events_lookup ON presence_events (resident_id, curfew_date, status);

CREATE INDEX IF NOT EXISTS idx_verification_attempts_resident_id ON verification_attempts (resident_id);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_device_id ON verification_attempts (device_id);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_nonce ON verification_attempts (session_nonce_hash);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_status ON verification_attempts (status);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_expiry ON verification_attempts (challenge_expires_at);

CREATE INDEX IF NOT EXISTS idx_leave_requests_resident_id ON leave_requests (resident_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_window ON leave_requests (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_leave_requests_active_window ON leave_requests (resident_id, status, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_curfew_rules_hostel_active ON curfew_rules (hostel_id, is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_policies_hostel ON network_policies (hostel_id, is_active);

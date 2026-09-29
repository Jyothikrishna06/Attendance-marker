-- ==============================================================================
-- Migration: 004_create_devices_and_network_policies.sql
-- Description: Device registration/binding lifecycle and institutional network policies.
-- ==============================================================================

-- 1. Devices Table
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

    -- Constraints
    CONSTRAINT chk_device_revocation CHECK (
        (status = 'REVOKED' AND revoked_at IS NOT NULL) OR
        (status != 'REVOKED')
    )
);

-- Ensure a resident can have only ONE active device registered at a given time
CREATE UNIQUE INDEX IF NOT EXISTS uq_resident_active_device 
ON devices (resident_id) 
WHERE status = 'ACTIVE';

-- 2. Network Policies Table (Institutional network criteria per hostel)
CREATE TABLE IF NOT EXISTS network_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id UUID NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    policy_name VARCHAR(100) NOT NULL,
    provider_type network_provider_type NOT NULL,
    network_identifier VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT uq_hostel_network_policy UNIQUE (hostel_id, policy_name)
);

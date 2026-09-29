-- ==============================================================================
-- Migration: 005_create_verification_and_presence.sql
-- Description: Verification sessions, short-lived anti-replay nonces, and presence events.
-- ==============================================================================

-- 1. Verification Attempts (Session challenges, anti-replay nonces, and multi-factor results)
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

    -- Constraints
    CONSTRAINT chk_challenge_expiry CHECK (challenge_expires_at > challenge_issued_at),
    CONSTRAINT chk_consumption_time CHECK (consumed_at IS NULL OR consumed_at >= challenge_issued_at)
);

-- 2. Presence Events (Authoritative, server-timestamped entry/exit logs)
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

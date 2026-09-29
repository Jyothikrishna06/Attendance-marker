-- ==============================================================================
-- Migration: 006_create_curfew_and_leave.sql
-- Description: Curfew scheduling rules and resident leave/outpass management.
-- ==============================================================================

-- 1. Curfew Rules Table
CREATE TABLE IF NOT EXISTS curfew_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hostel_id UUID NOT NULL REFERENCES hostels(id) ON DELETE CASCADE,
    day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 6=Sat, NULL=All Days
    curfew_time TIME NOT NULL,
    grace_period_minutes INT NOT NULL DEFAULT 15 CHECK (grace_period_minutes >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT chk_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- 2. Leave Requests Table
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

    -- Constraints
    CONSTRAINT chk_leave_duration CHECK (end_time > start_time),
    CONSTRAINT chk_leave_decision CHECK (
        (status IN ('APPROVED', 'REJECTED') AND approver_id IS NOT NULL AND decision_timestamp IS NOT NULL) OR
        (status IN ('PENDING', 'CANCELLED'))
    )
);

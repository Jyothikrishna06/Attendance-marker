-- ==============================================================================
-- Migration: 009_enforce_audit_immutability.sql
-- Description: Enforce database-level immutability constraints on audit_logs and
--              admin_actions using PostgreSQL trigger functions and role permissions.
-- ==============================================================================

-- 1. Immutability Trigger Function
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Policy Violation: % records are immutable and append-only. UPDATE and DELETE operations are strictly forbidden.', TG_TABLE_NAME
        USING ERRCODE = '55000'; -- Object not in prerequisite state / policy violation
END;
$$ LANGUAGE plpgsql;

-- 2. Attach BEFORE UPDATE OR DELETE triggers to audit_logs
DROP TRIGGER IF EXISTS trg_audit_logs_immutability ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutability
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();

-- 3. Attach BEFORE UPDATE OR DELETE triggers to admin_actions
DROP TRIGGER IF EXISTS trg_admin_actions_immutability ON admin_actions;
CREATE TRIGGER trg_admin_actions_immutability
BEFORE UPDATE OR DELETE ON admin_actions
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();

-- 4. Role Permissions: Revoke UPDATE and DELETE privileges from all standard application roles
DO $$
BEGIN
    -- Revoke from PUBLIC
    REVOKE UPDATE, DELETE ON audit_logs FROM PUBLIC;
    REVOKE UPDATE, DELETE ON admin_actions FROM PUBLIC;

    -- Revoke from application roles if they exist
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        REVOKE UPDATE, DELETE ON audit_logs FROM app_user;
        REVOKE UPDATE, DELETE ON admin_actions FROM app_user;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resident_role') THEN
        REVOKE UPDATE, DELETE ON audit_logs FROM resident_role;
        REVOKE UPDATE, DELETE ON admin_actions FROM resident_role;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warden_role') THEN
        REVOKE UPDATE, DELETE ON audit_logs FROM warden_role;
        REVOKE UPDATE, DELETE ON admin_actions FROM warden_role;
    END IF;
END $$;

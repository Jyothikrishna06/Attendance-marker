-- ==============================================================================
-- Migration: 001_init_extensions_and_enums.sql
-- Description: Initialize PostgreSQL extensions and custom ENUM types for the
--              Multi-Factor Hostel Curfew & Presence Verification System.
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Custom Role & Status Enums
CREATE TYPE user_role AS ENUM (
    'RESIDENT',
    'WARDEN',
    'ADMIN',
    'SUPER_ADMIN'
);

CREATE TYPE user_status AS ENUM (
    'PENDING_ACTIVATION',
    'ACTIVE',
    'SUSPENDED',
    'DEACTIVATED'
);

CREATE TYPE device_status AS ENUM (
    'PENDING_APPROVAL',
    'ACTIVE',
    'REVOKED'
);

CREATE TYPE network_provider_type AS ENUM (
    'SUBNET_CIDR',
    'GATEWAY_IP',
    'MOCK_DEV',
    'API_CONTROLLER'
);

CREATE TYPE verification_status AS ENUM (
    'PENDING',
    'VERIFIED',
    'EXPIRED',
    'FAILED',
    'REJECTED'
);

CREATE TYPE presence_event_type AS ENUM (
    'ENTRY',
    'EXIT'
);

CREATE TYPE presence_event_status AS ENUM (
    'VERIFIED_INSIDE',
    'VERIFIED_OUTSIDE',
    'FLAGGED'
);

CREATE TYPE presence_source AS ENUM (
    'VERIFICATION_SESSION',
    'WARDEN_MANUAL',
    'ADMIN_OVERRIDE'
);

CREATE TYPE leave_type AS ENUM (
    'OUTPASS',
    'NIGHT_OUT',
    'EMERGENCY',
    'HOME_VISIT'
);

CREATE TYPE leave_status AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);

CREATE TYPE notification_type AS ENUM (
    'CURFEW_ALERT',
    'VERIFICATION_REQUEST',
    'LEAVE_UPDATE',
    'SYSTEM_NOTICE'
);

CREATE TYPE admin_action_type AS ENUM (
    'CURFEW_RULE_CHANGE',
    'BULK_STATUS_OVERRIDE',
    'DEVICE_FORCE_REASSIGN',
    'ACCOUNT_LIFECYCLE',
    'SYSTEM_CONFIG'
);

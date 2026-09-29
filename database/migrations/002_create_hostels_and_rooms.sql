-- ==============================================================================
-- Migration: 002_create_hostels_and_rooms.sql
-- Description: Physical accommodation hierarchy (Hostels and Rooms).
-- ==============================================================================

-- 1. Hostels Table
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

-- 2. Rooms Table
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

    -- Constraints
    CONSTRAINT uq_hostel_room UNIQUE (hostel_id, room_number),
    CONSTRAINT chk_room_occupancy CHECK (current_occupancy >= 0 AND current_occupancy <= capacity)
);

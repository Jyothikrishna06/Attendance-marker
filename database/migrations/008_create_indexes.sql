-- ==============================================================================
-- Migration: 008_create_indexes.sql
-- Description: B-Tree, partial, and composite performance indexes on frequently
--              queried fields: resident_id, timestamp, status, curfew_date.
-- ==============================================================================

-- 1. Residents & Device Indexes
CREATE INDEX IF NOT EXISTS idx_residents_hostel_id ON residents (hostel_id);
CREATE INDEX IF NOT EXISTS idx_residents_room_id ON residents (room_id);
CREATE INDEX IF NOT EXISTS idx_devices_resident_id ON devices (resident_id);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices (status);

-- 2. Presence Events Indexes (Critical for curfew determination queries)
CREATE INDEX IF NOT EXISTS idx_presence_events_resident_id ON presence_events (resident_id);
CREATE INDEX IF NOT EXISTS idx_presence_events_curfew_date ON presence_events (curfew_date);
CREATE INDEX IF NOT EXISTS idx_presence_events_status ON presence_events (status);
CREATE INDEX IF NOT EXISTS idx_presence_events_server_timestamp ON presence_events (server_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_presence_events_lookup ON presence_events (resident_id, curfew_date, status);

-- 3. Verification Attempts Indexes (Challenge lookup & TTL expiration checks)
CREATE INDEX IF NOT EXISTS idx_verification_attempts_resident_id ON verification_attempts (resident_id);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_device_id ON verification_attempts (device_id);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_nonce ON verification_attempts (session_nonce_hash);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_status ON verification_attempts (status);
CREATE INDEX IF NOT EXISTS idx_verification_attempts_expiry ON verification_attempts (challenge_expires_at);

-- 4. Leave Requests Indexes
CREATE INDEX IF NOT EXISTS idx_leave_requests_resident_id ON leave_requests (resident_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests (status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_window ON leave_requests (start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_leave_requests_active_window ON leave_requests (resident_id, status, start_time, end_time);

-- 5. Curfew Rules Indexes
CREATE INDEX IF NOT EXISTS idx_curfew_rules_hostel_active ON curfew_rules (hostel_id, is_active);

-- 6. Notifications Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications (created_at DESC);

-- 7. Audit & Admin Action Indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_entity, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_network_policies_hostel ON network_policies (hostel_id, is_active);

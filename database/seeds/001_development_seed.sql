-- ==============================================================================
-- Seed: 001_development_seed.sql
-- Description: Deterministic development seed data for Multi-Factor Hostel Curfew
--              Verification System (Hostels, Rooms, Admin, Warden, Residents,
--              Devices, Network Policies, and Curfew Rules).
-- ==============================================================================

-- 1. Insert Hostels
INSERT INTO hostels (id, name, code, address, total_capacity, is_active)
VALUES 
    ('a0000000-0000-0000-0000-000000000001', 'Aryabhata Hall of Residence', 'HOSTEL-A', 'North Campus, Engineering Block A', 250, TRUE),
    ('a0000000-0000-0000-0000-000000000002', 'Kalpana Chawla Hall of Residence', 'HOSTEL-K', 'South Campus, Science Block B', 200, TRUE)
ON CONFLICT (code) DO NOTHING;

-- 2. Insert Rooms for Aryabhata Hall
INSERT INTO rooms (id, hostel_id, room_number, floor, capacity, current_occupancy, is_active)
VALUES
    ('b0000000-0000-0000-0000-000000000101', 'a0000000-0000-0000-0000-000000000001', '101', 1, 2, 2, TRUE),
    ('b0000000-0000-0000-0000-000000000102', 'a0000000-0000-0000-0000-000000000001', '102', 1, 2, 1, TRUE),
    ('b0000000-0000-0000-0000-000000000201', 'a0000000-0000-0000-0000-000000000001', '201', 2, 3, 0, TRUE)
ON CONFLICT (hostel_id, room_number) DO NOTHING;

-- 3. Insert Administrative and Staff Users
-- Password hash placeholder (Argon2id / bcrypt test hash): '$2b$12$e8Yh7W...test_hash'
INSERT INTO users (id, name, email, role, password_hash, status)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'Dr. Alok Verma', 'admin@campus.edu', 'SUPER_ADMIN', '$2b$12$mock_password_hash_for_testing_purposes_only_admin', 'ACTIVE'),
    ('c0000000-0000-0000-0000-000000000002', 'Rajesh Sharma', 'warden.sharma@hostel.edu', 'WARDEN', '$2b$12$mock_password_hash_for_testing_purposes_only_warden', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- 4. Insert Resident Users
INSERT INTO users (id, name, email, role, password_hash, status)
VALUES
    ('c0000000-0000-0000-0000-000000000003', 'Aarav Patel', 'aarav.patel@student.edu', 'RESIDENT', '$2a$10$D9FhgfkANAKu4LLNwqyZoettvARLyWWg7QmEc5SUoNEOfaAbu4k7.', 'ACTIVE'),
    ('c0000000-0000-0000-0000-000000000004', 'Diya Sharma', 'diya.sharma@student.edu', 'RESIDENT', '$2a$10$qnfTXTVSA0SRE6tvWPSOoeV/p.9T315WXdNE5sGGcW6Fmiq0ZZVu2', 'ACTIVE'),
    ('c0000000-0000-0000-0000-000000000005', 'Rohan Verma', 'rohan.verma@student.edu', 'RESIDENT', '$2b$12$mock_password_hash_for_testing_purposes_only_rohan', 'PENDING_ACTIVATION'),
    ('c0000000-0000-0000-0000-000000000006', 'Jyothi', '24cs471jyot@ug.cusat.ac.in', 'RESIDENT', '$2a$10$OiPXc9b/5LwHhC4D6Q2Up.vXJdPdlBTnzGAg0a14ZgJ7yMXcXyK7i', 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- 5. Insert Resident Profiles
INSERT INTO residents (id, user_id, roll_number, hostel_id, room_id, emergency_contact_name, emergency_contact_phone)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'CS2026-001', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000101', 'Suresh Patel', '+919876543210'),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'CS2026-002', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000101', 'Sunita Sharma', '+919876543211'),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000005', 'CS2026-003', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000102', 'Manoj Verma', '+919876543212'),
    ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', '24CS471', 'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000101', 'Parent / Guardian', '+919876543219')
ON CONFLICT (roll_number) DO NOTHING;

-- 6. Insert Devices (Demonstrating ACTIVE, REVOKED, and PENDING_APPROVAL states)
INSERT INTO devices (id, resident_id, device_identifier, device_model, os_name, os_version, status, approved_by, registered_at, revoked_at, revocation_reason)
VALUES
    -- Aarav: Active Android Device
    ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'DEV-FINGERPRINT-AARAV-PIXEL8', 'Google Pixel 8', 'ANDROID', '14.0', 'ACTIVE', 'c0000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP - INTERVAL '10 days', NULL, NULL),
    -- Aarav: Historical Revoked Device (Lost phone scenario)
    ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'DEV-FINGERPRINT-AARAV-OLD-PIXEL6', 'Google Pixel 6', 'ANDROID', '13.0', 'REVOKED', 'c0000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP - INTERVAL '60 days', CURRENT_TIMESTAMP - INTERVAL '11 days', 'Resident reported device lost/replaced with Pixel 8'),
    -- Diya: Active iOS Device
    ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', 'DEV-FINGERPRINT-DIYA-IPHONE15', 'Apple iPhone 15', 'IOS', '17.5', 'ACTIVE', 'c0000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP - INTERVAL '5 days', NULL, NULL),
    -- Rohan: Pending Device Registration
    ('e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000003', 'DEV-FINGERPRINT-ROHAN-SAMSUNG23', 'Samsung Galaxy S23', 'ANDROID', '14.0', 'PENDING_APPROVAL', NULL, CURRENT_TIMESTAMP - INTERVAL '1 hour', NULL, NULL),
    -- Jyothi: Active CUSAT Station
    ('e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000006', 'DEV-FINGERPRINT-CUSAT-24CS471', 'CUSAT Resident Station', 'ANDROID', '14.0', 'ACTIVE', 'c0000000-0000-0000-0000-000000000001', CURRENT_TIMESTAMP - INTERVAL '1 day', NULL, NULL)
ON CONFLICT (device_identifier) DO NOTHING;

-- 7. Insert Network Policies for Aryabhata Hall
INSERT INTO network_policies (id, hostel_id, policy_name, provider_type, network_identifier, is_active)
VALUES
    ('f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Aryabhata Internal Wi-Fi CIDR', 'SUBNET_CIDR', '10.42.0.0/16', TRUE),
    ('f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Aryabhata Gateway Controller Mock', 'MOCK_DEV', 'GATEWAY-MOCK-HOSTEL-A-01', TRUE),
    ('f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'CUSAT Campus Wi-Fi CIDR', 'SUBNET_CIDR', '172.29.247.0/24', TRUE)
ON CONFLICT (hostel_id, policy_name) DO NOTHING;

-- 8. Insert Curfew Rules
INSERT INTO curfew_rules (id, hostel_id, day_of_week, curfew_time, grace_period_minutes, is_active, effective_from)
VALUES
    -- Weekdays (Mon-Fri default rule, day_of_week NULL covers default daily)
    ('70000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', NULL, '21:30:00', 15, TRUE, CURRENT_DATE),
    -- Saturday extended curfew (day 6 = Saturday)
    ('70000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 6, '22:30:00', 30, TRUE, CURRENT_DATE);

-- 9. Insert Sample Approved Leave Request
INSERT INTO leave_requests (id, resident_id, leave_type, start_time, end_time, reason, status, approver_id, decision_reason, decision_timestamp)
VALUES
    ('80000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'OUTPASS', CURRENT_TIMESTAMP - INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '6 hours', 'Attending National Robotics Conference Hackathon', 'APPROVED', 'c0000000-0000-0000-0000-000000000002', 'Verified conference pass and parent consent letter', CURRENT_TIMESTAMP - INTERVAL '3 hours');

-- 10. Insert Mandatory Audit Log and Admin Action
INSERT INTO audit_logs (id, actor_id, actor_role, action, target_entity, target_id, previous_state, new_state, reason, ip_address)
VALUES
    ('90000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'DEVICE_REVOCATION', 'devices', 'e0000000-0000-0000-0000-000000000002', '{"status": "ACTIVE"}'::jsonb, '{"status": "REVOKED"}'::jsonb, 'Resident reported lost device; registered replacement Pixel 8', '127.0.0.1');

INSERT INTO admin_actions (id, admin_id, action_type, target_id, details, justification)
VALUES
    ('90000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'CURFEW_RULE_CHANGE', '70000000-0000-0000-0000-000000000001', '{"curfew_time": "21:30:00", "grace_period": 15}'::jsonb, 'Established baseline semester curfew policy per Warden Council resolution');

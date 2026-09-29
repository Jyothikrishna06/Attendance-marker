/**
 * ==============================================================================
 * Test Suite: schema-constraints.test.js
 * Description: Automated test harness for PostgreSQL relational constraints,
 *              uniqueness, foreign key integrity, and partial indexing in the
 *              Hostel Curfew & Multi-Factor Presence Verification System.
 * ==============================================================================
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { newDb } = require('pg-mem');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createTestDatabase() {
  const db = newDb();

  // Register native functions and extension mocks for pg-mem
  db.public.registerFunction({
    name: 'gen_random_uuid',
    implementation: () => crypto.randomUUID(),
  });
  db.public.registerFunction({
    name: 'uuid_generate_v4',
    implementation: () => crypto.randomUUID(),
  });

  db.registerExtension('pgcrypto', () => {});
  db.registerExtension('uuid-ossp', () => {});

  // Apply unified schema
  const schemaSql = fs.readFileSync(path.join(__dirname, '../migrations/001_initial_schema.sql'), 'utf8');
  db.public.none(schemaSql);

  // Apply development seeds
  const seedSql = fs.readFileSync(path.join(__dirname, '../seeds/001_development_seed.sql'), 'utf8');
  db.public.none(seedSql);

  return db;
}

describe('PostgreSQL Relational Schema & Constraint Integrity Tests', () => {
  let db;

  beforeEach(() => {
    db = createTestDatabase();
  });

  // ----------------------------------------------------------------------------
  // 1. Foreign Key Integrity Tests
  // ----------------------------------------------------------------------------
  describe('Foreign Key Integrity', () => {
    it('should reject creating a resident with a non-existent user_id', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO residents (user_id, roll_number, hostel_id, room_id, emergency_contact_name, emergency_contact_phone)
          VALUES (
            'ffffffff-ffff-ffff-ffff-ffffffffffff',
            'CS2026-999',
            'a0000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-000000000101',
            'Guardian Name',
            '+919999999999'
          );
        `);
      }, /foreign key|does not exist|violat/i);
    });

    it('should reject creating a resident with a non-existent hostel_id', () => {
      // First create a valid user
      const user = db.public.one(`
        INSERT INTO users (name, email, role, password_hash, status)
        VALUES ('Test User', 'test.orphan@student.edu', 'RESIDENT', 'dummy_hash', 'ACTIVE')
        RETURNING id;
      `);

      assert.throws(() => {
        db.public.none(`
          INSERT INTO residents (user_id, roll_number, hostel_id, room_id, emergency_contact_name, emergency_contact_phone)
          VALUES (
            '${user.id}',
            'CS2026-998',
            'ffffffff-ffff-ffff-ffff-ffffffffffff',
            'b0000000-0000-0000-0000-000000000101',
            'Guardian Name',
            '+919999999999'
          );
        `);
      }, /foreign key|does not exist|violat/i);
    });

    it('should prevent deleting a hostel that has active rooms (ON DELETE RESTRICT)', () => {
      assert.throws(() => {
        db.public.none(`
          DELETE FROM hostels WHERE id = 'a0000000-0000-0000-0000-000000000001';
        `);
      }, /foreign key|violat|restrict/i);
    });

    it('should cascade delete resident profile when the user is deleted (ON DELETE CASCADE)', () => {
      const residentUser = db.public.one(`
        SELECT u.id as user_id, r.id as resident_id
        FROM users u
        JOIN residents r ON r.user_id = u.id
        WHERE u.email = 'aarav.patel@student.edu';
      `);

      assert.ok(residentUser, 'Seeded resident must exist before cascade test');

      // Delete the user
      db.public.none(`DELETE FROM users WHERE id = '${residentUser.user_id}';`);

      // Verify resident profile was deleted
      const checkResident = db.public.many(`
        SELECT id FROM residents WHERE id = '${residentUser.resident_id}';
      `);
      assert.equal(checkResident.length, 0, 'Resident profile must be cascaded on user deletion');
    });
  });

  // ----------------------------------------------------------------------------
  // 2. Uniqueness Constraint Tests
  // ----------------------------------------------------------------------------
  describe('Uniqueness Constraints', () => {
    it('should reject duplicate user email', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO users (name, email, role, password_hash, status)
          VALUES ('Duplicate User', 'aarav.patel@student.edu', 'RESIDENT', 'hash123', 'ACTIVE');
        `);
      }, /unique|duplicate/i);
    });

    it('should reject duplicate resident roll number', () => {
      const newUser = db.public.one(`
        INSERT INTO users (name, email, role, password_hash, status)
        VALUES ('Another Student', 'another.student@student.edu', 'RESIDENT', 'hash123', 'ACTIVE')
        RETURNING id;
      `);

      assert.throws(() => {
        db.public.none(`
          INSERT INTO residents (user_id, roll_number, hostel_id, room_id, emergency_contact_name, emergency_contact_phone)
          VALUES (
            '${newUser.id}',
            'CS2026-001',
            'a0000000-0000-0000-0000-000000000001',
            'b0000000-0000-0000-0000-000000000101',
            'Guardian',
            '+919999999999'
          );
        `);
      }, /unique|duplicate/i);
    });

    it('should reject duplicate room in the same hostel', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO rooms (hostel_id, room_number, floor, capacity, current_occupancy)
          VALUES ('a0000000-0000-0000-0000-000000000001', '101', 1, 2, 0);
        `);
      }, /unique|duplicate/i);
    });

    it('should reject duplicate device_identifier across different residents', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO devices (resident_id, device_identifier, device_model, os_name, os_version, status)
          VALUES (
            'd0000000-0000-0000-0000-000000000002',
            'DEV-FINGERPRINT-AARAV-PIXEL8',
            'Cloned Device',
            'ANDROID',
            '14.0',
            'ACTIVE'
          );
        `);
      }, /unique|duplicate/i);
    });

    it('should reject duplicate verification session nonces (anti-replay collision)', () => {
      db.public.none(`
        INSERT INTO verification_attempts (
          resident_id, device_id, session_nonce_hash, challenge_issued_at, challenge_expires_at, status
        ) VALUES (
          'd0000000-0000-0000-0000-000000000001',
          'e0000000-0000-0000-0000-000000000001',
          'nonce_hash_fixed_1234567890abcdef',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP + INTERVAL '60 seconds',
          'PENDING'
        );
      `);

      assert.throws(() => {
        db.public.none(`
          INSERT INTO verification_attempts (
            resident_id, device_id, session_nonce_hash, challenge_issued_at, challenge_expires_at, status
          ) VALUES (
            'd0000000-0000-0000-0000-000000000002',
            'e0000000-0000-0000-0000-000000000003',
            'nonce_hash_fixed_1234567890abcdef',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP + INTERVAL '60 seconds',
            'PENDING'
          );
        `);
      }, /unique|duplicate/i);
    });
  });

  // ----------------------------------------------------------------------------
  // 3. Partial Unique Index & Device Lifecycle Tests
  // ----------------------------------------------------------------------------
  describe('Single Active Device Policy (Partial Unique Index)', () => {
    it('should reject registering a SECOND ACTIVE device for the same resident', () => {
      // Aarav (d0000000-0000-0000-0000-000000000001) already has an ACTIVE device (e0000000-0000-0000-0000-000000000001)
      assert.throws(() => {
        db.public.none(`
          INSERT INTO devices (resident_id, device_identifier, device_model, os_name, os_version, status)
          VALUES (
            'd0000000-0000-0000-0000-000000000001',
            'DEV-FINGERPRINT-AARAV-SECOND-DEVICE',
            'OnePlus 12',
            'ANDROID',
            '14.0',
            'ACTIVE'
          );
        `);
      }, /unique|duplicate/i);
    });

    it('should allow multiple historical REVOKED devices for the same resident', () => {
      assert.doesNotThrow(() => {
        db.public.none(`
          INSERT INTO devices (resident_id, device_identifier, device_model, os_name, os_version, status, revoked_at, revocation_reason)
          VALUES (
            'd0000000-0000-0000-0000-000000000001',
            'DEV-FINGERPRINT-AARAV-OLD-DEVICE-2',
            'Samsung Galaxy S10',
            'ANDROID',
            '11.0',
            'REVOKED',
            CURRENT_TIMESTAMP - INTERVAL '120 days',
            'Decommissioned old phone'
          );
        `);
      });
    });
  });

  // ----------------------------------------------------------------------------
  // 4. Check Constraint Integrity Tests
  // ----------------------------------------------------------------------------
  describe('Check Constraint Integrity', () => {
    it('should reject invalid user email without domain or @ symbol', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO users (name, email, role, password_hash, status)
          VALUES ('Bad Email User', 'plainaddress', 'RESIDENT', 'hash', 'ACTIVE');
        `);
      }, /check|violat/i);
    });

    it('should reject room occupancy greater than room capacity', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO rooms (hostel_id, room_number, floor, capacity, current_occupancy)
          VALUES ('a0000000-0000-0000-0000-000000000001', '301', 3, 2, 3);
        `);
      }, /check|violat/i);
    });

    it('should reject challenge where expiration is earlier than issued time', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO verification_attempts (
            resident_id, device_id, session_nonce_hash, challenge_issued_at, challenge_expires_at, status
          ) VALUES (
            'd0000000-0000-0000-0000-000000000001',
            'e0000000-0000-0000-0000-000000000001',
            'nonce_bad_expiry_1',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP - INTERVAL '10 seconds',
            'PENDING'
          );
        `);
      }, /check|violat/i);
    });

    it('should reject leave request where end_time is earlier than start_time', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO leave_requests (resident_id, leave_type, start_time, end_time, reason, status)
          VALUES (
            'd0000000-0000-0000-0000-000000000001',
            'OUTPASS',
            CURRENT_TIMESTAMP + INTERVAL '4 hours',
            CURRENT_TIMESTAMP + INTERVAL '2 hours',
            'Invalid time window',
            'PENDING'
          );
        `);
      }, /check|violat/i);
    });

    it('should reject audit log with empty reason string', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO audit_logs (actor_id, actor_role, action, target_entity, target_id, reason)
          VALUES (
            'c0000000-0000-0000-0000-000000000001',
            'SUPER_ADMIN',
            'TEST_ACTION',
            'users',
            'c0000000-0000-0000-0000-000000000002',
            ''
          );
        `);
      }, /check|violat/i);
    });

    it('should reject admin action with empty justification string', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO admin_actions (admin_id, action_type, target_id, justification)
          VALUES (
            'c0000000-0000-0000-0000-000000000001',
            'CURFEW_RULE_CHANGE',
            '70000000-0000-0000-0000-000000000001',
            ''
          );
        `);
      }, /check|violat/i);
    });

    it('should reject REVOKED device status if revoked_at is NULL', () => {
      assert.throws(() => {
        db.public.none(`
          INSERT INTO devices (resident_id, device_identifier, device_model, os_name, os_version, status, revoked_at)
          VALUES (
            'd0000000-0000-0000-0000-000000000003',
            'DEV-FINGERPRINT-INVALID-REVOKED',
            'Motorola Edge',
            'ANDROID',
            '13.0',
            'REVOKED',
            NULL
          );
        `);
      }, /check|violat/i);
    });
  });

  // ----------------------------------------------------------------------------
  // 5. Seed Data Verification
  // ----------------------------------------------------------------------------
  describe('Seed Data Integrity', () => {
    it('should have seeded 2 hostels, rooms, 5 users, 3 residents, and 4 devices', () => {
      const hostelCount = db.public.one('SELECT count(*) as c FROM hostels');
      assert.equal(Number(hostelCount.c), 2);

      const userCount = db.public.one('SELECT count(*) as c FROM users');
      assert.equal(Number(userCount.c), 5);

      const residentCount = db.public.one('SELECT count(*) as c FROM residents');
      assert.equal(Number(residentCount.c), 3);

      const deviceCount = db.public.one('SELECT count(*) as c FROM devices');
      assert.equal(Number(deviceCount.c), 4);

      const activeRules = db.public.many('SELECT * FROM curfew_rules WHERE is_active = TRUE');
      assert.equal(activeRules.length, 2);

      const auditEntries = db.public.many('SELECT * FROM audit_logs');
      assert.equal(auditEntries.length, 1);
    });

    it('should successfully execute all 8 sequential migration files in order', () => {
      const seqDb = newDb();
      seqDb.public.registerFunction({
        name: 'gen_random_uuid',
        implementation: () => crypto.randomUUID(),
      });
      seqDb.registerExtension('pgcrypto', () => {});
      seqDb.registerExtension('uuid-ossp', () => {});

      const migrationFiles = [
        '001_init_extensions_and_enums.sql',
        '002_create_hostels_and_rooms.sql',
        '003_create_users_and_residents.sql',
        '004_create_devices_and_network_policies.sql',
        '005_create_verification_and_presence.sql',
        '006_create_curfew_and_leave.sql',
        '007_create_notifications_and_audit.sql',
        '008_create_indexes.sql'
      ];

      for (const file of migrationFiles) {
        const sql = fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8');
        seqDb.public.none(sql);
      }

      // Check table count matches
      const tables = seqDb.public.many(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
      `);
      assert.equal(tables.length, 13, 'Must create all 13 core tables via sequential migrations');
    });
  });
});

# Smart Hostel Curfew & Multi-Factor Presence Verification System

An adaptive, security-oriented institutional presence verification platform that orchestrates multiple independent signals—account authentication, hardware device binding, institution-controlled network evidence, device-native biometric confirmation, and short-lived randomized cryptographic challenges—for transparent, auditable hostel curfew verification.

---

## 1. Repository Structure

```plaintext
attendance-marker/
├── apps/
│   ├── admin/      # React 18 + Vite + Tailwind Dashboard (Roster, Leave, Corrections, Audits)
│   └── mobile/     # Flutter Resident App (Secure Storage, Typed Client, Native Biometrics)
├── services/
│   └── api/        # Node.js + TypeScript Backend (Clean Architecture, Zod, JWT, RBAC)
├── database/       # PostgreSQL Migrations (13 Tables, Indexes, Triggers, Immutability)
└── docs/           # Architecture, Threat Model, API Specification, Database ERD, Test Matrix
```

---

## 2. Core Subsystems

### 2.1 Resident Mobile Application (`apps/mobile`)
- **Technology**: Flutter / Dart cross-platform mobile client.
- **Hardware Device Binding**: Automatically extracts device hardware fingerprints and binds a single active device per resident.
- **Native Biometrics**: Integrates with Android Jetpack `BiometricPrompt` and iOS `LocalAuthentication` with **zero raw biometric storage** or template transmission (BIPA/GDPR compliant).
- **Session Lifecycle**: Secure key-value storage (`flutter_secure_storage`) with automatic Bearer token injection and transparent 401 token refresh interception.
- **Offline & Error Resilience**: Graceful state transitions, network timeout detection, and server-authoritative error handling.

### 2.2 Warden & Administrative Web Dashboard (`apps/admin`)
- **Technology**: React 18, TypeScript, Vite, Tailwind CSS.
- **Live Curfew Tracking**: Real-time curfew deadlines, grace period counters, and curfew rule amendments with mandatory justification strings.
- **Multi-Dimensional Roster**: Filter residents by hostel, block/floor, room, status (`VERIFIED_INSIDE`, `VERIFIED_OUTSIDE`, `PENDING_VERIFICATION`, `APPROVED_LEAVE`, `NOT_VERIFIED`, `VERIFICATION_FAILED`), or search query.
- **Transactional Attendance Corrections**: Wardens can correct presence status (e.g. following physical room inspection) with mandatory rationale; commits concurrently to the immutable audit ledger.
- **Leave Adjudication Queue**: Streamlined queue for approving or rejecting outpass and emergency leave applications.
- **Verification Failure Alerts**: High-visibility operational banner highlighting network rejections, biometric cancellations, or expired nonces.
- **Immutable Audit Ledger**: Inspection console displaying actor, target, timestamp, action, and JSON state diffs.

### 2.3 Backend API Service (`services/api`)
- **Technology**: Node.js, Express, TypeScript, Zod.
- **Dual-Token Authentication**: 15-minute access tokens and 7-day refresh tokens signed with distinct secrets (`HS256`), constant-time dummy bcrypt anti-enumeration defense, and SHA-256 refresh token rotation.
- **Pluggable Network Verification**: `INetworkEvidenceProvider` interface supporting bitwise subnet CIDR matching (`MockNetworkProvider`) and reverse-proxy HMAC gateway validation (`GatewayNetworkProvider`).
- **Anti-Replay Nonce Engine**: 32-byte cryptographic random nonces with server-authoritative 60-second TTL, single-use atomic consumption, and cross-user challenge mismatch defense (`403 WRONG_USER_CHALLENGE`).
- **Deterministic Curfew Evaluation Service**: Background and on-demand evaluation engine resolving leave windows, grace periods, and late returns.
- **Audit & Executive Reporting**: Immutable audit events, daily summary metrics, late return logs, and downloadable CSV report exports (`/admin/reports/*`).
- **Rate Limiting & Reverse Proxy Support**: In-memory sliding-window limiters on login, activation, and challenge endpoints, with `trust proxy: 1` support.

### 2.4 Relational Database & Constraints (`database`)
- **Technology**: PostgreSQL 16 (13 tables, 9 sequential migrations).
- **Relational Integrity**: Strict foreign keys with cascading deletions on resident profiles and restricted deletions on hostels/rooms.
- **Anti-Fraud Constraints**:
  - Single active device partial unique index (`uq_resident_active_device`).
  - Check constraints for RFC-compliant emails, occupancy bounds, non-negative grace periods, and non-empty justification strings.
  - Database trigger prohibiting `UPDATE` or `DELETE` on `audit_logs` (`009_enforce_audit_immutability.sql`).

---

## 3. Test Suites & Verification Baseline

The repository enforces automated testing across all layers (171 tests, 0 failures):

```bash
# Run all test suites (Database + API + Admin)
npm test

# Run PostgreSQL schema & constraint integrity test harness (20 tests)
npm run test:db

# Run Backend API unit & integration test suites (141 tests, 59 suites)
npm run test:api

# Run Admin dashboard unit & E2E logic test suite (10 tests)
npm run test:admin

# Run TypeScript static typechecker (0 errors)
npm run typecheck
```

---

## 4. Documentation Index

- [Architecture & System Design](docs/architecture.md): Pluggable network verification, presence state machine, and curfew evaluation engine.
- [Threat Model & Security Hardening Report](docs/threat-model.md): STRIDE threat matrix, OWASP Top 10 (2021) compliance, and vulnerability assessment report.
- [API Specification & RBAC Matrix](docs/api-specification.md): Endpoints, request/response schemas, error dictionaries, and RBAC guards.
- [Database Schema & ERD](docs/database.md): Relational ER diagram, table schemas, index design, and audit immutability triggers.
- [Admin Dashboard Guide](apps/admin/README.md): React dashboard architecture, components, and workflow instructions.
- [Resident Mobile App Guide](apps/mobile/README.md): Flutter architecture, biometric privacy compliance, and test documentation.

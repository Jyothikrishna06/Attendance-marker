# Smart Hostel Curfew & Multi-Factor Presence Verification System

An adaptive, security-oriented academic prototype that orchestrates multiple independent presence signals—account authentication, hardware device binding, institution-controlled network evidence, device-native biometric confirmation, and short-lived randomized challenges—for transparent and auditable hostel curfew verification.

---

## 1. Architectural Highlights

- **Anti-Replay Verification**: Cryptographic nonces generated server-side with short TTLs ($\le 60\text{s}$) that are consumed atomically to prevent screenshot reuse or replayed submissions.
- **Single Active Device Policy**: Enforced via PostgreSQL partial unique indexes to mitigate proxy attendance and account sharing.
- **Pluggable Network Evidence Provider**: Abstracts network validation (`INetworkEvidenceProvider`) so tests and deployments can evaluate mock gateways vs institutional subnet CIDRs without assuming an untrusted phone can self-attest network truth.
- **Zero Raw Biometric Storage**: Delegates biometric authentication entirely to the device OS security subsystem (`Android BiometricPrompt` / `iOS LocalAuthentication`).
- **Deterministic Curfew State Machine**: Distinguishes `VERIFIED_INSIDE`, `APPROVED_LEAVE`, `PENDING_VERIFICATION`, `VERIFICATION_FAILED`, and `NOT_VERIFIED`.
- **Immutable Audit Trail**: Administrative overrides and corrections require mandatory, non-empty justification strings and append-only audit logging.

---

## 2. Monorepo Structure

```plaintext
attendance-marker/
├── apps/
│   ├── admin/                    # React 18 + TypeScript Warden/Admin Dashboard (Vite)
│   └── mobile/                   # Flutter / Dart Resident Mobile Application
├── services/
│   └── api/                      # Node.js + TypeScript Express Backend Service
│       ├── src/
│       │   ├── common/           # Auth, RBAC, Rate Limiting, Error Handling Middleware
│       │   ├── config/           # Environment validation (Zod)
│       │   ├── core/             # Cryptographic hashing (bcrypt), JWT, and tokens
│       │   └── modules/
│       │       └── auth/         # Login, Refresh, Logout, Activation, Device Binding
│       └── tests/                # Unit & Integration security test harness
├── database/
│   ├── migrations/               # Sequential (001-008) and Unified PostgreSQL DDL
│   ├── seeds/                    # Development seed fixtures
│   └── tests/                    # Database constraint & foreign key integrity test suite
├── docs/
│   ├── database.md               # Data dictionary, ERD, and constraint specifications
│   └── api-specification.md      # API endpoints, request/response contracts, and RBAC matrix
├── .env.example                  # Environment configuration template
└── package.json                  # Root monorepo scripts
```

---

## 3. Running Automated Tests

Run all test suites (Database constraints + API authentication & RBAC guards) with:

```bash
npm test
```

### Dedicated Test Suites

1. **Database Constraint & Schema Tests**:
   ```bash
   npm run test:db
   ```
2. **API Authentication, Rate Limiting & RBAC Role Escalation Tests**:
   ```bash
   npm run test:api
   ```

---

## 4. Documentation Index

- [Database Schema & ERD](docs/database.md)
- [API Specification & RBAC Matrix](docs/api-specification.md)

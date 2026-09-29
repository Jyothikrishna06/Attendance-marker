# Warden & Administrative Operations Dashboard (`apps/admin`)

The **Warden Web Dashboard** is a high-contrast, modern React + TypeScript single-page application built for hostel wardens, security supervisors, and campus administrators. It interfaces directly with the `@hostel-curfew/api` backend service to provide real-time curfew monitoring, outpass adjudication, transactional presence corrections, and immutable audit inspection.

---

## 1. Key Capabilities

1. **Active Curfew Policy & Live Deadline Management**:
   - Displays today's active curfew deadline and grace expiration computed authoritatively by the backend.
   - Allows authorized wardens/admins to amend curfew deadlines with mandatory justification reasons.
2. **Real-Time Presence Roster & Summary KPIs**:
   - Summary statistics: Total Tracked, Verified Inside, Verified Outside, Approved Leave, Pending Verification, and Failed Checks.
   - Comprehensive multi-dimensional filtering by Hostel (`HOSTEL-A`, `HOSTEL-K`), Floor/Block, Room Number, Presence Status, and Student Name/Roll.
3. **Verification Failure Alerts**:
   - High-visibility operational alert banner highlighting failed verification attempts (e.g. unauthorized subnet, biometric cancellation, expired nonces) with 1-click investigation.
4. **Transactional Record Correction with Mandatory Rationale**:
   - Allows wardens to correct attendance status (e.g., student asleep in room during physical inspection).
   - Enforces non-empty justification string (`reason`).
   - Concurrently commits an append-only, immutable record to `audit_logs`.
5. **Leave Request Adjudication**:
   - Dedicated queue for reviewing student outpass, emergency, and night-out leave applications.
   - Approvals and rejections strictly enforce non-empty staff rationale strings.
6. **Immutable Audit Ledger**:
   - Staff inspection console showing historical record changes with JSON previous-vs-new state diffs.

---

## 2. Project Structure

```
apps/admin/
├── index.html                    # Root HTML template
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript compiler configuration
├── vite.config.ts                # Vite dev server & proxy settings
├── test/
│   └── dashboard.test.ts         # Automated unit & E2E logic tests
└── src/
    ├── main.tsx                  # React DOM bootstrapping
    ├── App.tsx                   # Main dashboard layout & state management
    ├── types/
    │   └── index.ts              # Domain interfaces & TypeScript types
    ├── services/
    │   └── api.ts                # Typed HTTP API client
    ├── styles/
    │   └── dashboard.css         # Dark-slate responsive design system
    └── components/
        ├── Header.tsx            # Staff role badge & demo switcher
        ├── CurfewStatusCard.tsx  # Today's curfew deadline & amendment modal
        ├── CurfewSummaryCards.tsx# Real-time operational KPI counters
        ├── FilterBar.tsx         # Hostel, Floor, Room & Status filters
        ├── VerificationFailureAlerts.tsx # Alert banner for verification failures
        ├── CurfewRosterTable.tsx # Resident presence roster & actions
        ├── RecordCorrectionModal.tsx # Transactional correction modal
        ├── LeaveApprovalQueue.tsx# Outpass review & adjudication queue
        └── AuditLogViewer.tsx    # Immutable audit ledger & diff view
```

---

## 3. Running & Testing

### Development Mode
```bash
cd apps/admin
npm run dev
```

### Production Build
```bash
cd apps/admin
npm run build
```

### Running Automated Tests
```bash
cd apps/admin
npm test
```
Or from the root directory:
```bash
npm run test:admin
```

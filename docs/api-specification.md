# API Specification & Authentication Architecture

## 1. Authentication Architecture & Security Model

The **Hostel Curfew & Multi-Factor Presence Verification System** implements an enterprise-grade, role-based token authentication mechanism designed to resist credential stuffing, session hijacking, replay attacks, and proxy attendance manipulation.

```mermaid
sequenceDiagram
    autonumber
    actor Resident as Resident (Mobile App)
    participant API as Backend Auth Service
    participant Store as Auth Repository (PostgreSQL)

    Note over Resident,Store: Account Activation Workflow
    Resident->>API: POST /auth/activate (email, activationToken, newPassword)
    API->>Store: Validate token & Hash password (bcrypt rounds=12)
    Store-->>API: Account Activated
    API-->>Resident: 200 OK (Account Ready)

    Note over Resident,Store: Login & Device Session Establishment
    Resident->>API: POST /auth/login (email, password)
    API->>Store: Find user & verify password in constant-time
    Store-->>API: User details + Resident Profile + Active Device
    API->>Store: Issue & store hashed Refresh Token (7d TTL)
    API-->>Resident: 200 OK (Access Token [15m], Refresh Token [7d], User Data)

    Note over Resident,Store: Device Registration (If 0 devices registered)
    Resident->>API: POST /auth/device/register (Bearer Token, deviceIdentifier, model, os)
    API->>Store: Enforce Single Active Device Constraint
    Store-->>API: Device Bound & Activated
    API-->>Resident: 201 Created (Device Record)

    Note over Resident,Store: Token Rotation on Expiration
    Resident->>API: POST /auth/refresh (refreshToken)
    API->>Store: Verify token hash & revoke old token atomically
    API->>Store: Issue new rotated Refresh Token & new Access Token
    API-->>Resident: 200 OK (New Token Pair)
```

### Core Security Guardrails
1. **Password Hashing**: Uses `bcrypt` with cost factor 12. Login verification includes dummy hash comparison on non-existent accounts to eliminate timing side-channels and user enumeration.
2. **Access Token Lifespan**: Signed JWT access tokens have a short TTL of **15 minutes** with `HS256`.
3. **Rotating Refresh Tokens**: Stored as SHA-256 digests. Each refresh call revokes the existing refresh token and issues a new pair. If an already-consumed token is re-submitted, the session is invalidated immediately (theft detection).
4. **Hardware Device Binding**: A resident is restricted to **at most one active registered hardware device**. Attempts to register a second active device trigger HTTP `409 Conflict`.
5. **Brute-Force Rate Limiting**: Sensitive endpoints (`/auth/login`, `/auth/activate`) enforce an in-memory sliding window rate limiter (maximum 5 attempts per 15-minute window per IP) returning HTTP `429 Too Many Requests` with standard `Retry-After` headers.
6. **Strict RBAC Enforcement**: Role escalation is blocked server-side through `requireRoles(...)` middleware; UI element visibility is never treated as security.

---

## 2. Role-Based Access Control (RBAC) Matrix

| Endpoint | Permitted Roles | Notes |
| :--- | :--- | :--- |
| `POST /auth/login` | Public | Rate-limited (5 attempts / 15 min window) |
| `POST /auth/refresh` | Public (Requires valid Refresh Token) | Single-use rotation |
| `POST /auth/logout` | Public (Requires Refresh Token) | Revokes active session |
| `POST /auth/activate` | Public (Requires pre-provisioned activation token) | For new student onboarding |
| `POST /auth/device/register`| `RESIDENT` | Binds hardware device to student profile |
| `GET /resident/*` | `RESIDENT` | Resident curfew status & challenges |
| `GET /warden/*` | `WARDEN`, `ADMIN`, `SUPER_ADMIN` | Curfew rosters, alerts, exceptions |
| `GET /admin/*` | `ADMIN`, `SUPER_ADMIN` | Global hostel configs, audit ledgers |

---

## 3. Standard Request & Response Envelopes

### Success Envelope
```json
{
  "data": { ... },
  "message": "Human readable confirmation (optional)"
}
```

### Error Envelope (RFC 7807 Problem Details Pattern)
```json
{
  "error": {
    "code": "ERROR_CODE_STRING",
    "message": "Human readable explanation",
    "details": null
  },
  "timestamp": "2026-09-29T14:30:00.000Z"
}
```

---

## 4. Endpoint Specifications

### 4.1 `POST /auth/login`
Authenticates an active user and issues an access/refresh token pair.

**Request Body:**
```json
{
  "email": "aarav.patel@student.edu",
  "password": "SecureStudentPass!2026"
}
```

**Success Response (200 OK):**
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "expiresIn": "15m",
    "user": {
      "id": "c0000000-0000-0000-0000-000000000003",
      "name": "Aarav Patel",
      "email": "aarav.patel@student.edu",
      "role": "RESIDENT",
      "status": "ACTIVE",
      "residentProfile": {
        "id": "d0000000-0000-0000-0000-000000000001",
        "rollNumber": "CS2026-001",
        "hostelId": "a0000000-0000-0000-0000-000000000001",
        "roomId": "b0000000-0000-0000-0000-000000000101"
      },
      "activeDevice": {
        "id": "e0000000-0000-0000-0000-000000000001",
        "deviceIdentifier": "DEV-FINGERPRINT-AARAV-PIXEL8",
        "deviceModel": "Google Pixel 8",
        "status": "ACTIVE"
      }
    }
  },
  "message": "Authentication successful"
}
```

**Error Responses:**
- `400 VALIDATION_ERROR`: Missing or malformed email / password.
- `401 INVALID_CREDENTIALS`: Password mismatch or user not found.
- `401 ACCOUNT_PENDING_ACTIVATION`: Account must be activated first.
- `403 ACCOUNT_NOT_ACTIVE`: User suspended or deactivated.
- `429 RATE_LIMIT_EXCEEDED`: Exceeded 5 failed attempts in 15 minutes.

---

### 4.2 `POST /auth/refresh`
Rotates the refresh token and issues a new access token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOi..."
}
```

**Success Response (200 OK):**
```json
{
  "data": {
    "accessToken": "eyJhbGciOi...",
    "refreshToken": "eyJhbGciOi...",
    "expiresIn": "15m"
  },
  "message": "Token successfully refreshed"
}
```

**Error Responses:**
- `401 REFRESH_TOKEN_INVALID`: Token revoked, expired, or tampered.

---

### 4.3 `POST /auth/logout`
Explicitly revokes the active refresh token.

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOi..."
}
```

**Success Response (200 OK):**
```json
{
  "data": {
    "message": "Logged out successfully"
  }
}
```

---

### 4.4 `POST /auth/activate`
Enables a pre-provisioned resident account and configures the permanent password.

**Request Body:**
```json
{
  "email": "rohan.verma@student.edu",
  "activationToken": "ACTIVATE_ROHAN_2026_TOKEN",
  "newPassword": "RohanNewStrongPassword!2026"
}
```

**Success Response (200 OK):**
```json
{
  "data": {
    "message": "Account successfully activated. You may now log in with your credentials."
  }
}
```

**Error Responses:**
- `401 INVALID_ACTIVATION_TOKEN`: Provided token does not match.
- `403 FORBIDDEN`: Account already active.
- `404 NOT_FOUND`: Email not found.

---

### 4.5 `POST /auth/device/register`
Binds a physical hardware device to an authenticated resident.

**Headers:**
`Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "deviceIdentifier": "NEW-HARDWARE-FINGERPRINT-12345",
  "deviceModel": "OnePlus 11",
  "osName": "ANDROID",
  "osVersion": "14.0"
}
```

**Success Response (201 Created):**
```json
{
  "data": {
    "device": {
      "id": "a1b2c3d4-0000-0000-0000-000000000001",
      "residentId": "d0000000-0000-0000-0000-000000000001",
      "deviceIdentifier": "NEW-HARDWARE-FINGERPRINT-12345",
      "deviceModel": "OnePlus 11",
      "osName": "ANDROID",
      "osVersion": "14.0",
      "status": "ACTIVE"
    }
  },
  "message": "Device registered successfully"
}
```

**Error Responses:**
- `401 AUTH_HEADER_MISSING`: Bearer token missing.
- `403 ROLE_NOT_AUTHORIZED`: User is not a `RESIDENT`.
- `409 CONFLICT`: Resident already has an active registered device or device identifier is already bound.

# Smart Hostel Curfew & Attendance Marker System

A full-stack web application designed for college hostels to automate curfew tracking and student attendance verification.

Instead of manual physical attendance or paper sign-in registers, attendance is verified automatically using two factors:
1. **Hostel Wi-Fi Connection** (Verifies the student's phone is connected to the hostel network).
2. **Device Biometric Scan** (Verifies the student's fingerprint or face ID on their phone).

The Warden Dashboard updates in real-time as students mark their presence, showing who is inside, who is outside, and who is on approved leave before the **10:30 PM** curfew deadline.

---

## 📁 Project Structure

The project is structured simply into three folders:

```plaintext
attendance-marker/
├── apps/admin/       # Frontend (React 18 + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/    # Reusable UI components (Roster Table, Leave Queue, Curfew Card)
│   │   ├── services/      # api.ts (calls the backend API)
│   │   ├── App.tsx        # Main application page (Login, Warden view, Student view)
│   │   └── main.tsx       # Entry point
│   └── vite.config.ts     # Vite configuration
│
├── services/api/     # Backend (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── config/        # Environment settings (Port, Curfew time, Secret PIN)
│   │   ├── modules/       # Clean feature folders (auth, presence, curfew, admin)
│   │   ├── common/        # Auth middleware & error handlers
│   │   ├── app.ts         # Express routes & middleware setup
│   │   └── server.ts      # Starts the backend server on port 4000
│   └── package.json
│
└── database/         # Database
    └── schema.sql         # PostgreSQL schema (users, rooms, attendance logs, leaves)
```

---

## 🚀 How to Run the Project

### Prerequisites
- Node.js (v18 or higher)
- npm

### Step 1: Start Backend API Server
Open a terminal in the project root:
```bash
npm run dev --prefix services/api
```
The backend API runs on `http://localhost:4000` (and on your local Wi-Fi IP `http://192.168.20.6:4000`).

### Step 2: Start Frontend Web Portal
Open a second terminal in the project root:
```bash
npm run dev --prefix apps/admin
```
The frontend portal runs on:
- **Laptop:** `http://localhost:5173`
- **Phone / Mobile:** `http://192.168.20.6:5173` *(connect phone to the same Wi-Fi)*

---

## 🔑 Login Credentials

### 1. Student / Resident Logins
> **Student Warden PIN:** `486396` (required for student device authentication)

- **Blessy Binu**
  - **Email:** `blessybinu4287@gmail.com`
  - **Password:** `blessybinu@123`
  - **Secret PIN:** `486396`

- **Ahanya M R**
  - **Email:** `ahanya_ec24@ug.cusat.ac.in`
  - **Password:** `ahanya@123`
  - **Secret PIN:** `486396`

- **Jyothikrishna S**
  - **Email:** `24cs471jyot@ug.cusat.ac.in`
  - **Password:** `CusatPass!2026`
  - **Secret PIN:** `486396`

### 2. Staff Logins (No PIN required)
- **Super Admin:**
  - **Email:** `jyothi.jojo6@gmail.com`
  - **Password:** `Jyothi@2006`

- **Hostel Warden:**
  - **Email:** `warden.sharma@hostel.edu`
  - **Password:** `WardenSecurePass!2026`

---

## 💡 Key Features

- **Automated Two-Factor Verification**: Attendance requires both institutional Wi-Fi and device biometric confirmation.
- **Curfew Countdown & Status**: Automatic 10:30 PM curfew evaluation with a 15-minute grace period.
- **Live Warden Roster**: Displays student names, rooms, attendance status, and verification badges in real time.
- **Outpass & Leave Management**: Students can apply for leave; wardens can approve or reject outpass requests directly from the portal.
- **Multi-Device Support**: Optimized for desktop browsers (for Wardens) and mobile screens (for Students).

---

## 🧪 Running Automated Tests

To run the complete test suite:
```bash
npm test
```
All tests verify database integrity, authentication security, presence verification, and frontend UI logic.

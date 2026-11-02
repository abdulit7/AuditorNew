# AuditGrid — Web Management Portal & Standalone APK Split

Refactor **AuditGrid** so the browser application serves exclusively as the **Web Management Portal** for administrators and regional managers, while field auditors sign in exclusively through the standalone **Android APK** connected to this server's API.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and UX decisions were confirmed during clarification and govern this implementation:

- **Confirmed Decision 1 — Web-Only Browser Login & Native APK API**: The browser sign-in page will authenticate exclusively against the Web Portal (`surface: 'web'`), removing the "Web Portal / Mobile Browser" mode toggle. Field auditor accounts (`userType: 'mobile'`) will be blocked from signing in via the web browser and directed to use the Android APK, while all mobile API endpoints (`surface: 'mobile'`, `client: 'native'`) remain active for the APK.
- **Confirmed Decision 2 — Remove In-Browser Auditor Mobile View, Keep Audit Forms Preview**: The standalone "Auditor Mobile View" navigation tab and full-screen web auditor workspace will be removed from the Web Portal shell. The interactive mobile form preview inside the **Audit Forms** page will be retained so managers can preview form field and configuration changes in real time.
- **Confirmed Decision 3 — Strict Web vs. APK User & Role Separation**: Administrators will continue creating and managing **Mobile Users (APK Auditors)** and **Web Users** from the Web Portal's Users & Roles pages, but all cross-surface login toggles ("Also can login from mobile", "Also can sign in on the Web Portal", and "Dual (Web + Mobile)" role surface options) will be removed so Web users are strictly Web Portal accounts and Mobile Auditors are strictly APK accounts.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a dedicated desktop/web command center for managing geography hierarchies (Cities → Territories → Locations → Sub-locations → Shops), distributors, product groups (Group A & B), audit form configurations, audit reports, live GPS maps, analytics, and user/role administration—while acting as the central backend server for the standalone Android APK used by field auditors.
- **Target Audience / Persona**:
  - **Web Portal**: System Administrators and Regional Operations Managers overseeing territories, reviewing submitted audits, configuring forms, and provisioning APK auditor accounts.
  - **Android APK (External Client)**: Field Distributors and Retail Market Auditors conducting GPS-verified audits on phones.
- **Key Value**: Eliminates surface confusion and cross-login complexity by enforcing a clean boundary—management happens on the Web Portal, and field execution happens on the dedicated Android APK.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Web Portal Sign-In**: Managers and administrators open the web app and see a streamlined **Web Portal Sign-In** screen (no surface switcher). Attempting to sign in with an APK Auditor account displays a clear message that field auditor accounts must sign in using the AuditGrid Android mobile app.
  2. **Navigation & Workspace Shell**: Left sidebar presents three focused groups—*Dashboard & Audits* (Dashboard, Audit Forms, Audit Reports, Map & Live Locations, Analytics & Review), *Geography Hierarchy* (Cities, Territories, Locations, Sub-locations, Shops), *Distributors & Catalog* (Distributors, Product Groups, Products), and *Users & Roles* (Users, User Roles)—with the "Auditor Mobile View" tab removed.
  3. **Audit Forms Configuration & Live Preview**: Managers configure built-in or custom audit forms on the left and immediately inspect how the form renders for APK auditors in the side-by-side mobile preview frame on the right.
  4. **Users & Roles Administration**:
     - **Mobile Users (APK Auditors) Tab**: Create and edit auditor credentials, assign cities/territories/product groups, and view scoped entity counts—labelled clearly as **Mobile App (APK) Only** without any web sign-in checkbox.
     - **Web Users (Managers & Admins) Tab**: Create and edit web portal users and assign web roles—labelled clearly as **Web Portal Only** without any mobile sign-in checkbox.
     - **Roles & Permission Matrix**: Roles are scoped to either **Web Dashboard** or **Mobile App (APK)** without dual-surface ambiguity.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Swiss enterprise utility—high-contrast light-mode surfaces optimized for dense operational tables and scannable KPIs.
  - *Color Palette & Mood*: Crisp slate-tinted canvas (`--background: #F8FAFC`), pure white structural cards (`--card: #FFFFFF`), deep navy primary (`--primary: #1E3A5F`), royal blue interactive accents (`--secondary: #2563EB`), emerald verification states (`--accent: #16A34A`), amber warnings (`--warning: #B45309`), and crimson alerts (`--destructive: #DC2626`).
  - *Typography & Hierarchy*: **Fira Sans** (400/500/600/700) for clear UI hierarchy paired with **Fira Code** (`tabular-nums`) for entity codes, coordinates, carton ratios, and PKR currency figures.
  - *Component Styling & Layout*: Full-viewport sidebar + header workspace (`max-w-[1360px]` main container), 1px structural borders (`#CBD5E1`), and single-line controls (`whitespace-nowrap shrink-0`).
- **Interactive Feedback & Motion**: Instantaneous tab switching, inline validation alerts, confirmation dialogs explaining preserved historical audit records on user deactivation, and dismissible status toasts.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Strict Surface Enforcement at Authentication**
  - *Chosen Approach*: Web login requests always send `surface: 'web'`. On the server, `surface === 'web'` is permitted strictly for active `userType === 'web'` accounts, and `surface === 'mobile'` is permitted strictly for active `userType === 'mobile'` accounts (used by the APK).
  - *Why*: Guarantees that field auditors cannot bypass the APK by logging into a desktop browser, and managers don't accidentally use management accounts as field auditors.
  - *Alternatives Considered*: Per-user `canLoginFromWeb` / `canLoginFromMobile` flags were removed as requested to simplify administration and enforce the APK split.
- **Decision 2: Retaining the Audit Forms Side-by-Side Preview**
  - *Chosen Approach*: Keep the phone preview frame inside the **Audit Forms** management page while removing the standalone "Auditor Mobile View" page and full-screen mobile PWA shell from the web app.
  - *Why*: Gives administrators immediate visual feedback when editing field labels, required flags, or custom form questions before those changes sync to the APK.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌────────────────────────────────────────────────────────────────────────────┐
│                        AuditGrid Express + Knex Server                     │
│  ┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ /api/auth/login      │  │ /api/bootstrap       │  │ /api/reports/*   │  │
│  │ • surface='web' (Web)│  │ • Master Collections │  │ /api/submissions │  │
│  │ • surface='mobile'   │  │ • Form Config Sync   │  │ /api/plans       │  │
│  │   client='native'    │  │ • Territory Scoping  │  │ /api/tracking/*  │  │
│  └──────────┬───────────┘  └──────────┬───────────┘  └────────┬─────────┘  │
└─────────────┼─────────────────────────┼───────────────────────┼────────────┘
              │                         │                       │
      ┌───────┴───────────────┐         │               ┌───────┴────────────┐
      ▼                       ▼         ▼               ▼                    ▼
┌───────────────────────────────────────────┐   ┌────────────────────────────┐
│        Web Management Portal (SPA)        │   │  Standalone Android APK    │
│  ┌─────────────────────────────────────┐  │   │  (External Mobile Client)  │
│  │ LoginPage (Web Portal Sign-In Only) │  │   │  • Native Token Refresh    │
│  └─────────────────┬───────────────────┘  │   │  • Field Audits & Plans    │
│                    ▼                      │   │  • Live GPS & Photo Upload │
│  ┌─────────────────────────────────────┐  │   └────────────────────────────┘
│  │ App Shell (Sidebar + Top Header)    │  │
│  │ • InfrastructureOverview (KPIs)     │  │
│  │ • GeographyPages (Cities → Shops)   │  │
│  │ • DistributorsPage & ProductsPages  │  │
│  │ • AuditFormsAndReportsPage          │  │
│  │   └─ FormBuilder + Live Form Preview│  │
│  │ • AuditReportsPage & AnalyticsPage  │  │
│  │ • MapLivePage (Live APK Locations)  │  │
│  │ • UsersAndRolesPages                │  │
│  │   ├─ Mobile Users (APK Auditors)    │  │
│  │   └─ Web Users (Portal Managers)    │  │
│  └─────────────────────────────────────┘  │
└───────────────────────────────────────────┘
```

- **Data Model & State**:
  - **User Accounts (`AppUser`)**: `userType: 'web'` accounts always have `surfaceAccess: 'Web Dashboard'` (`canLoginFromWeb: true`, `canLoginFromMobile: false`). `userType: 'mobile'` accounts always have `surfaceAccess: 'Mobile PWA'` (`canLoginFromMobile: true`, `canLoginFromWeb: false`).
  - **Roles (`UserRole`)**: Roles are defined as either `'Web Dashboard'` (management permissions `web.*`) or `'Mobile PWA'` (APK auditor permissions `mobile.*`).
- **Interactive Component & State Mapping**:
  - **Web Login (`LoginPage`)**: Submits `{ username, password, surface: 'web' }` directly; displays dedicated error messaging if an APK auditor account attempts web sign-in.
  - **Portal Shell (`App`)**: Removes the `'mobile-view'` route and non-manager fallback shell; if a session lacks web management access, it signs out and returns to the Web Portal login screen.
  - **Users & Roles (`UsersAndRolesPages`)**:
    - Removes the inline and modal checkboxes for `"Also can login from mobile"` and `"Also can sign in on the Web Portal"`.
    - Updates user table badges, modal headers, and role surface selectors to reflect **Web Portal Only** vs. **Mobile App (APK) Only**.
  - **Dashboard KPIs (`InfrastructureOverview`)**: Displays clean counts of **Mobile App (APK) Auditors** and **Web Portal Managers** without "Web+Mob Dual Access" sub-labels.
  - **Server Auth & User Routes (`server/routes/auth.ts`, `server/routes/users.ts`)**: Enforces strict surface separation (`user_type === surface`) while keeping native token refresh (`client: 'native'`) and all mobile audit/plan/tracking endpoints intact for the APK.

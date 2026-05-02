# Medicare Hub — Complete Application Guide

> **Version:** 1.0 (Unreleased)
> **Organization:** 
> **Last Updated:** May 2026

---

## Table of Contents

1. [What Is Medicare Hub?](#1-what-is-medicare-hub)
2. [Getting Started](#2-getting-started)
3. [Technology Stack](#3-technology-stack)
4. [Architecture Overview](#4-architecture-overview)
5. [Project Structure](#5-project-structure)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Theme System](#7-theme-system)
8. [Modules & Features](#8-modules--features)
9. [Data Models & Types](#9-data-models--types)
10. [Service Layer](#10-service-layer)
11. [Routing Map](#11-routing-map)
12. [Component Library](#12-component-library)
13. [Business Logic & Calculations](#13-business-logic--calculations)
14. [Data Storage](#14-data-storage)
15. [Developer Conventions](#15-developer-conventions)
16. [Testing & QA Reference](#16-testing--qa-reference)
17. [Known Limitations & Future Roadmap](#17-known-limitations--future-roadmap)

---

## 1. What Is Medicare Hub?

Medicare Hub is a single-page web application for managing health insurance sales operations. It is purpose-built for agents who sell Medicare plans (Medicare Advantage, PDP, Medigap, Ancillary) and the administrators who oversee them.

The platform covers the entire sales lifecycle: capturing leads, verifying eligibility, recommending plans, managing appointments, sending plan information kits, enrolling beneficiaries, and tracking agent productivity — all within a single, unified interface.

Three distinct user types interact with the system:

- **Agents** — use it daily to manage their book of leads, search plans, check eligibility, and submit enrollments.
- **Admins** — configure users, roles, departments, and targets; monitor team-wide productivity and enrollment metrics.
- **Members (Beneficiaries)** — log in to a self-service portal to view their plan, benefits, enrollment history, and upcoming appointments.

The application currently supports 80+ real Medicare plans across five carriers: Aetna, Humana, UnitedHealthcare, Cigna, and Blue Cross Blue Shield.

---

## 2. Getting Started

### Prerequisites

- Node.js 18 or later
- npm (ships with Node.js)

### Installation

```bash
cd techsales-app
npm install
```

### Running the Dev Server

```bash
npm run dev
```

The app starts at `http://localhost:5173`.

### Building for Production

```bash
npm run build     # Type-checks then builds to dist/
npm run preview   # Preview the production build locally
```

### Linting

```bash
npm run lint
```

### Demo Credentials

| Role | Username / Policy | Password | Notes |
|------|-------------------|----------|-------|
| Admin | `admin` | any | Full system access |
| Agent 1 | `johndoe11` | any | Agent — John Doe |
| Agent 2 | `janesmith22` | any | Agent — Jane Smith |
| Agent 3 | `mikewilson33` | any | Agent — Mike Wilson |
| Member (Aetna) | Policy `POL-2025-001`, DOB `1955-03-15` | n/a | Robert Anderson — Aetna theme |
| Member (Humana) | Policy `POL-2025-002`, DOB `1948-07-22` | n/a | Mary Johnson — Humana theme |

Admin and agent login: `/login`. Member login: `/member/login`.

---

## 3. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| UI Framework | React | 19.2 |
| Language | TypeScript | 5.9 |
| Build Tool | Vite | 7.2 |
| Styling | Tailwind CSS | 4.1 |
| Routing | React Router DOM | 7.11 |
| Icons | Lucide React | 0.562 |
| State Management | React Context API | — |
| Date Handling | date-fns | 4.1 |
| ID Generation | uuid | 13.0 |
| Data Layer | Local JSON files | — |

There is no backend server. All data is stored in JSON files within the project and accessed through a service layer that simulates async API calls. This is intentional for the current phase — a real backend is on the roadmap.

---

## 4. Architecture Overview

The application follows a layered architecture with clear separation of concerns:

```
┌──────────────────────────────────────────────────┐
│                   PAGES (Routes)                 │
│   Dashboard, Leads, Plans, Enrollment, Admin...  │
├──────────────────────────────────────────────────┤
│                COMPONENTS (UI)                   │
│   Common (Button, Modal, Table, Input...)        │
│   Layout (Header, Sidebar)                       │
│   Tiles  (StatCard, NavigationTile, Flippable)   │
│   Tagging (PharmacySearch, DrugSearch, Provider)  │
├──────────────────────────────────────────────────┤
│                CONTEXTS (Global State)           │
│   AuthContext (user/member auth, permissions)     │
│   ThemeContext (light/dark, color theme)          │
├──────────────────────────────────────────────────┤
│              SERVICES (Data Access)              │
│   leadService, planService, enrollmentService    │
│   userService, pharmacyService, drugService...   │
├──────────────────────────────────────────────────┤
│                  DATA (JSON)                     │
│   Lookup: plans, drugs, pharmacies, benefits...  │
│   Runtime: leads, users, enrollments, roles...   │
└──────────────────────────────────────────────────┘
```

Design principles enforced throughout the codebase:

- **Component-Based** — small, reusable components with typed props.
- **Type-Safe** — strict TypeScript with no `any` types.
- **Service Layer** — components never import JSON directly; all data access goes through services.
- **Theme-Aware** — all colors use CSS variables (`bg-primary-500`, etc.); no hardcoded color classes.
- **Responsive** — mobile-first design using Tailwind breakpoints.
- **Accessible** — semantic HTML and ARIA attributes.

---

## 5. Project Structure

```
techsales-app/
├── public/                          # Static assets (logos, images)
├── src/
│   ├── components/
│   │   ├── common/                  # Reusable UI primitives
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Modal.tsx            # Modal + ConfirmModal
│   │   │   ├── Table.tsx            # Sortable data table + Pagination
│   │   │   ├── Badge.tsx
│   │   │   ├── StatusBadge.tsx      # Lead-status-specific badge
│   │   │   ├── SearchInput.tsx      # Debounced search with autocomplete
│   │   │   ├── LeadAutocomplete.tsx # Lead name picker
│   │   │   ├── Tabs.tsx             # Tab navigation + TabPanel
│   │   │   ├── DatePicker.tsx
│   │   │   └── EmptyState.tsx
│   │   ├── layout/
│   │   │   ├── Layout.tsx           # Main shell (sidebar + header + content)
│   │   │   └── Header.tsx           # Top bar: user menu, theme toggle, notifications
│   │   ├── tiles/
│   │   │   ├── NavigationTile.tsx   # Clickable module tile with icon and count
│   │   │   ├── StatCard.tsx         # KPI card (value, icon, change %)
│   │   │   ├── FlippableStatCard.tsx
│   │   │   ├── FlippableCostSavingsCard.tsx
│   │   │   ├── FlippableRevenueCard.tsx
│   │   │   └── FlippableCommissionCard.tsx
│   │   └── tagging/
│   │       ├── DrugSearch.tsx       # Drug search & tag to lead
│   │       ├── PharmacySearch.tsx   # Pharmacy search & tag to lead
│   │       └── ProviderSearch.tsx   # Provider search & tag to lead
│   ├── context/
│   │   ├── AuthContext.tsx          # User + member authentication, RBAC
│   │   └── ThemeContext.tsx         # Light/dark mode + color theme
│   ├── data/
│   │   ├── lookup/                  # Reference/static data
│   │   │   ├── planInformation.json
│   │   │   ├── premiumInformation.json
│   │   │   ├── benefitData.json
│   │   │   ├── starRatings.json
│   │   │   ├── drugData.json
│   │   │   ├── pharmacyData.json
│   │   │   ├── providerData.json
│   │   │   └── zipStateCounty.json
│   │   └── runtime/                 # Dynamic/mutable data
│   │       ├── leads.json
│   │       ├── users.json
│   │       ├── roles.json
│   │       ├── departments.json
│   │       ├── enrollments.json
│   │       ├── pba.json
│   │       ├── pbkit.json
│   │       ├── medicaidEligibility.json
│   │       ├── lisEligibility.json
│   │       ├── members.json
│   │       ├── memberAppointments.json
│   │       └── targets.json
│   ├── hooks/                       # Custom React hooks
│   ├── pages/
│   │   ├── Dashboard.tsx            # Dual-mode: Admin insights / Agent sales
│   │   ├── Login.tsx
│   │   ├── MemberLogin.tsx
│   │   ├── NotFound.tsx
│   │   ├── ComingSoon.tsx
│   │   ├── admin/
│   │   │   ├── AdminLayout.tsx      # Nested admin shell with tab nav
│   │   │   ├── UserManagement.tsx
│   │   │   ├── RoleManagement.tsx
│   │   │   ├── DepartmentManagement.tsx
│   │   │   ├── SystemSettings.tsx
│   │   │   ├── ProductivityDashboard.tsx
│   │   │   ├── TargetManagement.tsx
│   │   │   ├── AgentEnrollments.tsx
│   │   │   ├── AgentLeads.tsx
│   │   │   └── AllEnrollments.tsx
│   │   ├── leads/
│   │   │   ├── LeadList.tsx
│   │   │   ├── LeadDetail.tsx
│   │   │   └── LeadForm.tsx
│   │   ├── plans/
│   │   │   ├── PlanList.tsx
│   │   │   └── PlanDetail.tsx
│   │   ├── pharmacies/
│   │   │   └── PharmacySearch.tsx
│   │   ├── drugs/
│   │   │   └── DrugSearch.tsx
│   │   ├── providers/
│   │   │   └── ProviderSearch.tsx
│   │   ├── pba/
│   │   │   └── PBAList.tsx
│   │   ├── pbkit/
│   │   │   └── PBKitList.tsx
│   │   ├── eligibility/
│   │   │   ├── StateAssistanceCheck.tsx
│   │   │   └── PlanSubsidyCheck.tsx
│   │   ├── recommendations/
│   │   │   └── PlanRecommendations.tsx
│   │   ├── yoy/
│   │   │   └── YOYComparison.tsx
│   │   ├── enrollment/
│   │   │   ├── SelectPlanYear.tsx
│   │   │   ├── SelectPlan.tsx
│   │   │   ├── EnrollmentForm.tsx
│   │   │   └── SubmitEnrollment.tsx
│   │   └── member/
│   │       ├── MemberDashboard.tsx
│   │       ├── MemberPlanDetail.tsx
│   │       └── PreviousEnrollments.tsx
│   ├── services/
│   │   ├── baseService.ts           # Shared helpers (pagination, search, sort, ID gen)
│   │   ├── leadService.ts
│   │   ├── planService.ts
│   │   ├── enrollmentService.ts
│   │   ├── userService.ts
│   │   ├── pharmacyService.ts
│   │   ├── drugService.ts
│   │   ├── providerService.ts
│   │   ├── memberService.ts
│   │   ├── targetService.ts
│   │   └── zipService.ts
│   ├── types/
│   │   ├── index.ts                 # Generic types (ApiResponse, Pagination, Sort, Filter)
│   │   ├── lead.ts
│   │   ├── plan.ts
│   │   ├── user.ts
│   │   ├── enrollment.ts
│   │   ├── enrollmentForm.ts
│   │   ├── eligibility.ts
│   │   ├── pharmacy.ts
│   │   ├── drug.ts
│   │   ├── provider.ts
│   │   ├── pba.ts
│   │   ├── pbkit.ts
│   │   ├── member.ts
│   │   ├── target.ts
│   │   └── location.ts
│   └── utils/
│       ├── dateUtils.ts             # Age calc, date formatting, Medicare eligibility
│       ├── costSavingsUtils.ts      # Revenue, commission, savings calculations
│       └── logoUtils.ts             # Theme-aware logo selection
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── postcss.config.js
├── eslint.config.js
├── tailwind.config.ts
└── package.json
```

---

## 6. Authentication & Authorization

### Authentication Flow

The app supports two independent authentication paths managed by `AuthContext`:

**Agent/Admin Login (`/login`):**
1. User enters a username and any password (demo mode — all passwords accepted).
2. `AuthContext.login()` looks up the user in `users.json` by username.
3. On success, the user object and their role (from `roles.json`) are stored in React state and `localStorage`.
4. `lastLoginAt` is updated on the user record.

**Member Login (`/member/login`):**
1. Member enters a policy number and date of birth.
2. `memberService.memberLogin()` matches against `members.json` (case-insensitive policy, exact DOB).
3. On success, the member object is stored in state and `localStorage`.
4. The color theme automatically switches based on the member's carrier (Aetna → purple, Humana → green).

Logging in as a member clears any active agent session and vice versa.

### Role-Based Access Control (RBAC)

Permissions follow a **module + action** model. Each role contains an array of permission objects:

```
{ module: "leads", actions: ["view", "create", "edit", "delete"] }
```

**Modules:** dashboard, leads, plans, pharmacy, drugs, providers, pba, pbkit, stateAssistance, planSubsidy, recommendations, yoy, enrollments, admin, users, departments, roles, reports.

**Actions:** view, create, edit, delete, export.

**Built-in roles:**

| Role | Access Level | Description |
|------|-------------|-------------|
| Super Admin | admin | All permissions on all modules. Cannot be deleted or deactivated. |
| Sales Agent | agent | Create/edit leads, view plans, manage enrollments, use sales tools. |
| Customer Service Rep | viewer | View-only access across modules. |

Permission checks in components use `hasPermission(module, action)` from AuthContext. Super admins bypass all checks.

---

## 7. Theme System

### Color Themes

Three color themes are available, each mapped to a carrier brand:

| Theme | CSS Class | Primary Color | Use Case |
|-------|-----------|--------------|----------|
| Default | `.theme-default` | Orange `#f97316` | Neutral / EXL branding |
| Aetna | `.theme-aetna` | Purple `#5a2e6f` | Aetna-branded experience |
| Humana | `.theme-humana` | Green `#5c9a1b` | Humana-branded experience |

Theme classes are applied to `document.documentElement`. CSS variables (defined via Tailwind's `@theme` directive in `index.css`) cascade to all components. The logo in the header also changes per theme.

### Light/Dark Mode

The app supports three modes: `light`, `dark`, and `system` (follows OS preference). The resolved mode applies `.light` or `.dark` to the document root. Tailwind's `dark:` variant handles dark-mode overrides.

### Persistence

Both theme selections are saved to `localStorage` (`medsales-theme`, `medsales-color-theme`) and restored on page load.

### Developer Rules

- Never use hardcoded color classes like `bg-orange-500` or `text-purple-600`.
- Always use theme-aware classes: `bg-primary-500`, `text-primary-700`, `border-primary-300`, etc.
- All new components must support dark mode via the `dark:` variant.

---

## 8. Modules & Features

### 8.1 Lead Management

The central module of the application. A "lead" represents a potential Medicare beneficiary being worked by an agent.

**Lead Lifecycle (6 stages):**
```
New Lead → Contacted Lead → Appointment Schedule → Enrollment in progress → Enrolled → Dropped / Lost lead
```

The lifecycle is visualized as a horizontal timeline on the lead detail page, with color-coded stages.

**Lead Fields:** First/last name, DOB (age auto-calculated), gender, email, phone, full address (zip triggers auto-population of state/county/city), Medicare number, Medicaid ID, Part A/B effective dates, ethnicity, race, lead source (required), permission to contact, existing Aetna member flag, tobacco usage.

**Lead Sources (required):** Web, Call, Event, Referral, Vendor.

**Tagging:** Each lead can have up to 3 pharmacies, up to 5 providers, and unlimited drugs (each with dosage, quantity, frequency, and days supply) tagged to their profile.

**Key Features:** Full CRUD, debounced search, filter by status/state/county/zip/source/agent, pagination, status summary counters, lead autocomplete for quick selection across other modules.

### 8.2 Plan Management

Browse and inspect 80+ Medicare plans across five carriers.

**Plan Attributes:** Plan ID, contract year, contract/PBP numbers, plan name, product type, plan type, category, carrier, market, region, commission status, SNP type, age restrictions, documents.

**Product Types:** MAPD, MA, PDP, Medsup, ANC.
**Plan Types:** HMO, PPO, POS, RPPO, PDP, DSNP, CSNP, ISNP, Medigap.
**Categories:** Medicare Advantage, PDP, Medsup, ANC.
**Carriers:** Aetna, Humana, UnitedHealthcare, Cigna, Blue Cross Blue Shield.

**Plan Detail Tabs:** Overview, Benefits (with availability indicators), Premiums (including Medicaid/LIS adjustments), Documents (5 types).

**Theme-Aware Filtering:** When the Aetna theme is active, only Aetna plans appear. Same for Humana. Default theme shows all carriers.

**Star Ratings:** Overall, health services, drug services, and member experience ratings displayed per plan.

### 8.3 Pharmacy Search & Tagging

Search pharmacies by name and filter by zip code, state, county, 24-hour availability, drive-through, mail order, and retail. Grid and list view layouts. Tag up to 3 pharmacies per lead via the lead detail page.

**Pharmacy Types:** Retail, Chain Retail, Mail Order, Specialty, Long Term Care, Compounding, Hospital, Clinic.

Distance calculations use the Haversine formula (radius in miles). Nearby search defaults to a 10-mile radius.

### 8.4 Drug Formulary & Tagging

Search drugs by brand or generic name. Filter by dosage form, tier, drug class, brand/generic status. Autocomplete with a minimum of 2 characters returns the top 10 matches. Tag unlimited drugs per lead with dosage, quantity, frequency, and days supply.

**Dosage Forms:** Tablet, Capsule, Solution, Suspension, Injection, Cream, Ointment, Patch, Inhaler, Drops, Spray, Powder, Chewable, Extended Release, Suppository.

**Frequencies:** Once daily, twice daily, three times daily, four times daily, every other day, weekly, bi-weekly, monthly, as needed.

Drug details include GPI code, NDC, tier, prior authorization requirement, quantity limits, step therapy, route, therapeutic category, and manufacturer.

### 8.5 Provider Search & Tagging

Search providers by name. Filter by zip, state, county, city, and network status (covered/not covered). Tag up to 5 providers per lead. Distance-based nearby search supported.

### 8.6 Plan Briefing Appointments (PBA)

Formerly "Scope of Appointment (SOA)." Schedule and track consultation appointments for leads who want to discuss plans before enrolling.

**Fields:** Lead (autocomplete), agent, date/time, duration, meeting type (In-Person, Phone, Video Call, Home Visit), location/link, products to discuss, summary, notes.

**Products to Discuss:** Medicare Advantage (HMO/PPO/PFFS/SNP), PDP, Medigap, Dental/Vision/Hearing, Hospital Indemnity.

**Statuses:** Pending, Sent, Completed, Expired, Scheduled, Confirmed, Cancelled, No Show, Rescheduled.

Features include sending the appointment to the beneficiary and PDF download.

### 8.7 Plan Bundle Kits (PBKit)

Formerly "EKIT." Send plan information packages to leads via email. Track engagement through delivery status.

**Tracking Statuses:** Pending → Sent → Opened → Clicked (also: Draft, Delivered, Bounced, Failed).

**Template Types:** Plan Comparison, Single Plan Details, Welcome, Follow Up, Enrollment Confirmation.

Features include plan selection (multiple plans per kit), recipient customization, resend capability, and plan count badges.

### 8.8 Eligibility Checks

Two eligibility modules run independently or as part of the plan recommendation flow:

**State Assistance Check (Medicaid):**
Form fields: name, DOB, gender, Medicare number, Medicaid ID, SSN, Medicaid state. Result: Eligible or Not Eligible. Eligibility types: Full, QMB, SLMB, QI. Dashboard with stats: total checks, eligible, not eligible, expiring soon.

**Plan Subsidy Check (LIS — Low Income Subsidy):**
Form fields: name, DOB, gender, Medicare number. LIS levels 1 through 4 with copay display. Dashboard with stats: total checks, eligible, full subsidy, partial subsidy.

Both modules are available standalone at their own routes and embedded within the plan listing flow to adjust premiums.

### 8.9 Plan Recommendations

AI-powered (rules-based in current implementation) plan recommendations based on a beneficiary's profile.

**Inputs:** Lead selection (with autocomplete), Medicaid status, LIS status.
**Filters:** Plan type, maximum monthly premium, minimum star rating.
**Output per plan:** Match score (0–100%), drug coverage percentage, pharmacy network percentage, estimated annual cost, highlight badges.

Expandable cards show detailed breakdowns per recommended plan.

### 8.10 Year-Over-Year Comparison

Compare plans across contract years (2024 vs 2025). Summary cards highlight changes, a comparison table shows side-by-side values, and impact badges flag what improved, increased in cost, or changed.

### 8.11 Enrollment Workflow

A four-step wizard to enroll a beneficiary into a plan:

1. **Select Year** — choose the contract year.
2. **Select Plan** — browse and pick a plan for the beneficiary.
3. **Enrollment Form** — multi-section form collecting personal info, Medicare details, language preferences, release of information, and signatures.
4. **Submit** — review all data and submit the enrollment.

**Enrollment Types:** New Enrollment, Plan Change, Disenrollment, Re-enrollment.
**Election Periods:** AEP, OEP, SEP, IEP, ICEP.
**Status Workflow:** Pending → Submitted → Approved / Rejected / Cancelled → Active / Terminated.

### 8.12 Admin Dashboard

Accessible only to admin users. Provides a tabbed layout with:

- **User Management** — CRUD for agent accounts with search, filters, pagination, status toggle, role/department assignment. Super admins cannot be deleted or deactivated. Duplicate username/email validation enforced.
- **Role Management** — define roles with granular module + action permissions.
- **Department Management** — create departments, assign managers, link to parent departments. Departments cannot be deleted while users are assigned.
- **System Settings** — theme selection, light/dark toggle.
- **Target Management** — set performance targets by metric (New Leads, New Enrollments, New Appointments, Electronic Kits Sent) and period (daily, weekly, monthly, quarterly, yearly) with points for gamification.

### 8.13 Productivity Dashboard

Admin-only analytics view showing:

- Lead lifecycle overview (status distribution across the funnel).
- Agent performance table with pagination (5 per page), color-coded progress bars (green ≥90%, blue ≥70%, yellow ≥50%, red <50%).
- Summary statistics: total enrollments, total leads, total revenue, average conversion rate, monthly cost savings.
- Drill-down links to view individual agent enrollments and leads.

### 8.14 Member Portal

A separate authenticated experience for beneficiaries (members):

- **Dashboard** — plan overview, benefits summary, enrollment details, upcoming appointments, contact-agent options (chat/email).
- **Plan Detail** — full plan information from the member's perspective.
- **Previous Enrollments** — enrollment history.

The portal auto-themes based on the member's carrier (Aetna → purple, Humana → green).

---

## 9. Data Models & Types

### Lead

```
leadId, firstName, lastName, dob, age?, gender, email, phone
address1, address2?, zipCode, state, county, city
ethnicity?, race?, medicareNumber?, medicaidId?, stateAssistanceNumber?
partADate?, partBDate?, leadStatus (LeadStatus), source (LeadSource)
permissionToContact, existingAetnaMember, tobaccoUsage
taggedPharmacies: string[] (max 3)
taggedDrugs: TaggedDrug[] (unlimited)
taggedProviders: string[] (max 5)
createdAt, createdBy, updatedAt?, updatedBy?
```

`TaggedDrug`: drugId, drugName?, dosage, quantity, frequency, daysSupply?

### Plan

```
planId, contractYear, contractNumber, pbp, segmentId?
planName, product (ProductType), planType (PlanType), category (PlanCategory)
carrier?, commissionable, planStatus, market, region, legalEntity, marketingName
minAge?, maxAge?, snpType?, documents?: PlanDocument[]
annualOopMax?, drugDeductible?, premium?, isDeleted
```

### Benefit

```
benefitId, planId, contractYear, contractNumber, pbp
category (BenefitCategory), categoryData, categoryGroup, categoryOrder
isAvailable?, isDeleted
```

18 benefit categories covering doctor services, facility services, emergency/urgent care, diagnostics, dental, hearing, vision, preventive, wellness, home health, telehealth, mental health, prescriptions, and more.

### Premium

```
premiumId, planId, premium
medicaidAdjustedPremium?, lisLevel1Premium?, lisLevel2Premium?
lisLevel3Premium?, lisLevel4Premium?, isDeleted
```

### Star Rating

```
ratingId, planId, contractYear, overallRating
healthServicesRating?, drugServicesRating?, memberExperienceRating?
```

### User

```
userId, username, email, firstName, lastName, phone?
roleId, departmentId?, isActive, isSuperAdmin, accessLevel (AccessLevel)
markets: string[], createdAt, createdBy, updatedAt?, updatedBy?, lastLoginAt?
```

AccessLevel: `admin` | `manager` | `agent` | `viewer`

### Role

```
roleId, roleName, description, permissions: RolePermission[], isActive, createdAt
```

RolePermission: `{ module: string, actions: string[] }`

### Enrollment

```
enrollmentId, leadId, planId, agentId
enrollmentDate, effectiveDate
enrollmentType (EnrollmentType), enrollmentPeriod (EnrollmentPeriod)
status (EnrollmentStatus), confirmationNumber?
premium, medicaidEligible, lisLevel?, notes?
createdAt, createdBy, updatedAt?, updatedBy?
```

### Pharmacy

```
pharmacyId, npi, ncpdpId?, name, chainName?, chainId?
address, city, state, zipCode, county, phone, fax?
pharmacyType (PharmacyType)
is24Hour, hasDriveThru, isOpen7Days, hasDelivery, languages: string[]
latitude, longitude, isActive, isRetail?, isMailOrder?, isSpecialty?, isPreferred?
```

### Drug

```
drugId, gpiCode, ndc, brandName, genericName, drugLabelName
strength, strengthNumber, strengthUnit, dosageForm (DosageForm)
drugClass, isBrand, isGeneric, isVaccine
frequencies: string[], commonQuantities: number[]
tier?, requiresPriorAuth?, hasQuantityLimit?, quantityLimit?
hasStepTherapy?, route?, therapeuticCategory?, manufacturer?
```

### Provider

```
providerId, providerIdentificationNumber, providerName, npi
address, city, county, state, zipCode, latitude, longitude
covered: boolean (in-network flag), isActive
```

### Member

```
memberId, policyNumber, dateOfBirth, firstName, lastName, email?, phone?
address?: { street, city, state, zipCode }
planId, carrier ('Aetna' | 'Humana'), assignedAgentId?
enrollmentDate, isActive, createdAt
```

### Target

```
targetId, metric (TargetMetric), period (TargetPeriod)
targetValue, points, isActive, createdAt, createdBy, updatedAt?, updatedBy?
```

### Location (Zip)

```
zipCode, multiCountyZip, state, stateAbbr, county, countyFips
city, region, market, territory
maStatus ('Current' | 'Whitespace' | 'Expansion'), brand
```

---

## 10. Service Layer

All data access goes through service files in `src/services/`. Components never import JSON directly. Each service simulates async behavior with a small delay.

### Base Service (`baseService.ts`)

Shared utilities used by all other services:

- `ServiceResponse<T>` — generic wrapper: `{ success, data, error, message }`.
- `delay(ms?)` — simulates network latency.
- `generateId(prefix)` — creates unique IDs in `prefix-timestamp-random` format.
- `filterByField()`, `searchByFields()`, `sortByField()`, `paginateItems()` — generic helpers.

### Lead Service

| Function | Description |
|----------|-------------|
| `getAllLeads()` | Returns all leads |
| `getLeadById(leadId)` | Single lead lookup |
| `searchLeads(params)` | Full search with filters, sort, pagination |
| `createLead(data, createdBy)` | Creates lead, auto-generates ID and age |
| `updateLead(leadId, updates, updatedBy)` | Partial update with timestamp |
| `deleteLead(leadId)` | Removes lead |
| `tagPharmacy(leadId, pharmacyId)` | Adds pharmacy (enforces max 3) |
| `untagPharmacy(leadId, pharmacyId)` | Removes pharmacy |
| `tagDrug(leadId, drug)` | Adds or updates drug tag |
| `untagDrug(leadId, drugId)` | Removes drug tag |
| `tagProvider(leadId, providerId)` | Adds provider (enforces max 5) |
| `untagProvider(leadId, providerId)` | Removes provider |
| `autocompleteLeads(searchTerm)` | Top 10 matches on first/last name |

### Plan Service

| Function | Description |
|----------|-------------|
| `getAllPlans()` | All non-deleted plans |
| `getPlanById(planId)` | Single plan |
| `getPlanWithDetails(planId)` | Plan + benefits + premium + star rating |
| `searchPlans(params)` | Theme-aware search and filtering |
| `getPlanBenefits(planId)` | Benefits for a plan |
| `getPlanPremium(planId)` / `getPlanPremiums(planId)` | Premium data |
| `getPlanRating(planId)` | Star rating |
| `calculateAdjustedPremium(premium, hasMedicaid, lisLevel?)` | Applies Medicaid/LIS adjustments |
| `comparePlans(planIds[])` | Returns array of PlanWithDetails for comparison |

### Enrollment Service

| Function | Description |
|----------|-------------|
| `getAllEnrollments()` | All enrollments |
| `getEnrollmentsByAgent(agentId)` | Agent's enrollments |
| `getEnrollmentsByLead(leadId)` | Lead's enrollments |
| `createEnrollment(data, createdBy)` | Create with auto-generated ID |

### User Service

| Function | Description |
|----------|-------------|
| `getAllUsers()` / `getUserById()` / `searchUsers()` | User lookup |
| `createUser(data, createdBy)` | Validates duplicate username/email |
| `updateUser(userId, updates)` | Validates duplicates excluding current user |
| `deleteUser(userId)` | Blocks deletion of super admins |
| `toggleUserStatus(userId)` | Blocks deactivation of super admins |
| `getAllRoles()` / `createRole()` / `deleteRole()` | Role CRUD (blocks delete if users assigned) |
| `getAllDepartments()` / `createDepartment()` / `deleteDepartment()` | Dept CRUD (blocks delete if users assigned) |

### Pharmacy Service

| Function | Description |
|----------|-------------|
| `searchPharmacies(params)` | Filter by location, features (24hr, drive-thru) |
| `getChainNames()` | Unique sorted chain names |
| `calculateDistance(lat1, lon1, lat2, lon2)` | Haversine formula in miles |
| `getNearbyPharmacies(lat, lon, radius?)` | Returns with distance, default 10mi |

### Drug Service

| Function | Description |
|----------|-------------|
| `searchDrugs(params)` | Multi-field search, filter by tier/class/form |
| `autocompleteDrugs(term)` | Top 10, min 2 chars |
| `getDrugClasses()` / `getDosageForms()` | Unique values for filters |
| `getDrugStrengths(genericName)` | Available strengths for a generic |

### Provider Service

| Function | Description |
|----------|-------------|
| `searchProviders(params)` | Filter by location, network status |
| `getNearbyProviders(lat, lon, radius?)` | Haversine distance, default 10mi |

### Zip Service

| Function | Description |
|----------|-------------|
| `getLocationByZip(zipCode)` | Returns matching ZipStateCounty records |
| `autoPopulateFromZip(zipCode)` | Returns state, county, city, region, market |
| `getStates()` / `getCountiesByState()` / `getCitiesByStateCounty()` | Cascading dropdowns |
| `validateZipCode(zipCode)` | Boolean validation |

### Member Service

| Function | Description |
|----------|-------------|
| `memberLogin(policyNumber, dob)` | Case-insensitive policy match |
| `getMemberById(memberId)` | Single member lookup |
| `getMemberAppointments(memberId)` | Scheduled appointments only |

### Target Service

| Function | Description |
|----------|-------------|
| `getAllTargets()` / `getActiveTargets()` | Target retrieval |
| `getTargetsByPeriod(period)` / `getTargetsByMetric(metric)` | Filtered targets |
| `createTarget(data, createdBy)` / `updateTarget()` / `deleteTarget()` | CRUD |
| `toggleTargetStatus(targetId)` | Active/inactive toggle |

---

## 11. Routing Map

### Public Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/login` | Login | Agent/Admin login |
| `/member/login` | MemberLogin | Member login (policy + DOB) |

### Member Routes (requires member auth)

| Path | Component | Description |
|------|-----------|-------------|
| `/member/dashboard` | MemberDashboard | Plan overview, appointments |
| `/member/plan/:id` | MemberPlanDetail | Plan detail view |
| `/member/enrollments` | PreviousEnrollments | Enrollment history |

### Agent/Admin Routes (requires user auth)

| Path | Component | Description |
|------|-----------|-------------|
| `/` | — | Redirects to `/insights` |
| `/insights` | Dashboard (insights tab) | Productivity metrics |
| `/sales` | Dashboard (sales tab) | Quick actions, sales tools |
| `/leads` | LeadList | Lead list with filters |
| `/leads/new` | LeadForm | Create new lead |
| `/leads/:id` | LeadDetail | Lead detail with tabs |
| `/leads/:id/edit` | LeadForm | Edit lead |
| `/plans` | PlanList | Plan catalog |
| `/plans/:id` | PlanDetail | Plan detail |
| `/pharmacies` | PharmacySearch | Pharmacy lookup |
| `/drugs` | DrugSearch | Drug formulary |
| `/providers` | ProviderSearch | Provider lookup |
| `/pba` | PBAList | Plan briefing appointments |
| `/pbkit` | PBKitList | Plan bundle kits |
| `/state-assistance` | StateAssistanceCheck | Medicaid eligibility |
| `/plan-subsidy` | PlanSubsidyCheck | LIS eligibility |
| `/recommendations` | PlanRecommendations | AI plan recommendations |
| `/yoy` | YOYComparison | Year-over-year comparison |
| `/enroll/select-year` | SelectPlanYear | Enrollment step 1 |
| `/enroll/select-plan` | SelectPlan | Enrollment step 2 |
| `/enroll/form` | EnrollmentForm | Enrollment step 3 |
| `/enroll/submit` | SubmitEnrollment | Enrollment step 4 |

### Admin Routes (requires admin auth)

| Path | Component | Description |
|------|-----------|-------------|
| `/admin` | AdminLayout | Redirects to `/admin/users` |
| `/admin/users` | UserManagement | User CRUD |
| `/admin/roles` | RoleManagement | Role + permissions |
| `/admin/departments` | DepartmentManagement | Department CRUD |
| `/admin/targets` | TargetManagement | Performance targets |
| `/admin/settings` | SystemSettings | Theme, system config |
| `/admin/productivity` | ProductivityDashboard | Team analytics |
| `/admin/agent/:agentId/enrollments` | AgentEnrollments | Agent enrollment drill-down |
| `/admin/agent/:agentId/leads` | AgentLeads | Agent lead drill-down |
| `/admin/enrollments` | AllEnrollments | All enrollments |

### Error Route

| Path | Component | Description |
|------|-----------|-------------|
| `/*` | NotFound | 404 page |

---

## 12. Component Library

### Common Components (`src/components/common/`)

| Component | Purpose |
|-----------|---------|
| `Button` | Styled button with variants (primary, secondary, outline, danger) |
| `Input` | Text input with validation support |
| `Select` | Dropdown select with typed options |
| `Modal` / `ConfirmModal` | Dialog overlays, confirmation prompts |
| `Table` + `Pagination` | Sortable data table with column definitions and paginated navigation |
| `Badge` | Colored label for statuses and tags |
| `StatusBadge` | Lead-status-specific badge with color mapping |
| `SearchInput` | Debounced search field with optional autocomplete |
| `LeadAutocomplete` | Lead name picker returning top 10 matches |
| `Tabs` + `TabPanel` | Tab navigation with content panels |
| `DatePicker` | Date input component |
| `EmptyState` | Placeholder shown when a list has no results |

### Layout Components (`src/components/layout/`)

| Component | Purpose |
|-----------|---------|
| `Layout` | Main application shell — sidebar navigation + header + content area |
| `Header` | Top bar with user menu, theme toggle, notification bell |

### Tile Components (`src/components/tiles/`)

| Component | Purpose |
|-----------|---------|
| `NavigationTile` | Clickable module card with icon, title, description, and count badge |
| `StatCard` | KPI display: title, value, icon, percentage change indicator |
| `FlippableStatCard` | StatCard that flips to reveal calculation details |
| `FlippableCostSavingsCard` | Front: total savings. Back: per-product-type breakdown |
| `FlippableRevenueCard` | Front: total revenue. Back: agent vs carrier split |
| `FlippableCommissionCard` | Front: estimated monthly commission. Back: rate table and totals |

### Tagging Components (`src/components/tagging/`)

| Component | Purpose |
|-----------|---------|
| `PharmacySearch` | Search + tag pharmacies to a lead (embedded in lead detail) |
| `DrugSearch` | Search + tag drugs with dosage/frequency (embedded in lead detail) |
| `ProviderSearch` | Search + tag providers to a lead (embedded in lead detail) |

---

## 13. Business Logic & Calculations

### Agent Commission

Commission is calculated per enrollment based on the plan's product type and premium:

| Product Type | Agent Rate | Carrier Rate |
|-------------|-----------|-------------|
| MAPD / MA | 15% | 75% |
| PDP | 15% | 75% |
| Medsup | 20% | 80% |
| ANC | 20% | 80% |

Formula: `Agent Commission = Premium × Agent Rate`. The remaining goes to carrier revenue.

**Example:** An enrollment in a MAPD plan with a $150 premium yields $22.50 for the agent and $112.50 for the carrier.

### Cost Savings

Savings are calculated differently per product type:

| Product Type | Method | Rate |
|-------------|--------|------|
| MAPD / MA | Fixed per enrollment | $20 |
| PDP | Fixed per enrollment | $18 |
| Medsup | Percentage of premium | 20% |
| ANC | Percentage of premium | 20% |

### Premium Adjustments

When a beneficiary has Medicaid or LIS eligibility, their premium is adjusted:

- **Medicaid eligible** → uses `medicaidAdjustedPremium` from the premium record.
- **LIS Level 1–4** → uses `lisLevel1Premium` through `lisLevel4Premium` respectively.

### Target Points

Default targets and their point values:

| Metric | Monthly Target | Points per Unit |
|--------|---------------|----------------|
| New Leads | 50 | 100 |
| New Enrollments | 25 | 200 |
| New Appointments | 30 | 150 |
| Electronic Kits Sent | 50 | 75 |

Targets can be set at daily, weekly, monthly, quarterly, or yearly intervals.

### Progress Bar Color Coding

Used in the productivity dashboard for agent performance:

| Achievement | Color |
|------------|-------|
| ≥ 90% | Green |
| ≥ 70% | Blue |
| ≥ 50% | Yellow |
| < 50% | Red |

### Utility Functions

- **Age Calculation** — `calculateAge(dob)` computes age from date of birth, factoring in whether the birthday has occurred this year.
- **Medicare Eligibility** — `isMedicareEligible(dob)` returns true if the person is 65 or older.
- **Distance Calculation** — Haversine formula computes great-circle distance between two lat/lon points in miles. Default search radius is 10 miles.

---

## 14. Data Storage

All data lives in JSON files within `src/data/`, split into two categories:

### Lookup Data (`src/data/lookup/`)

Reference data that does not change during normal operation:

| File | Records | Description |
|------|---------|-------------|
| `planInformation.json` | 80+ | Plans across 5 carriers |
| `premiumInformation.json` | — | Premium amounts with Medicaid/LIS adjustments |
| `benefitData.json` | — | Benefit details (508 KB) |
| `starRatings.json` | — | Plan quality ratings |
| `drugData.json` | — | Drug formulary catalog |
| `pharmacyData.json` | — | Pharmacy locations (35 KB) |
| `providerData.json` | — | Provider network (101 KB) |
| `zipStateCounty.json` | — | US geographic reference data |

### Runtime Data (`src/data/runtime/`)

Data created and modified during application use:

| File | Description |
|------|-------------|
| `leads.json` | Lead records (506 KB — large dataset of 50+ leads) |
| `users.json` | Agent/admin accounts |
| `roles.json` | Role definitions with permissions |
| `departments.json` | Department records |
| `enrollments.json` | Enrollment records (194 KB) |
| `pba.json` | Plan briefing appointments |
| `pbkit.json` | Plan bundle kit records |
| `medicaidEligibility.json` | State assistance eligibility records |
| `lisEligibility.json` | Plan subsidy eligibility records |
| `members.json` | Member/beneficiary accounts |
| `memberAppointments.json` | Member appointment data |
| `targets.json` | Performance target configurations |

Since there is no backend, changes made during a session are held in memory and lost on page refresh. Persistent data requires the planned backend integration.

---

## 15. Developer Conventions

### Naming

| Item | Convention | Example |
|------|-----------|---------|
| Components | PascalCase | `LeadForm.tsx` |
| Services | camelCase | `leadService.ts` |
| Types/Interfaces | PascalCase | `interface Lead {}` |
| Type aliases | camelCase | `type LeadStatus = ...` |
| Utilities | camelCase | `dateUtils.ts` |
| Constants | UPPER_SNAKE_CASE | `DRUG_FREQUENCIES` |

### Code Patterns

- Always use TypeScript strict mode. No `any` types.
- Use functional components with hooks. No class components.
- Local component state via `useState` / `useReducer`.
- Global state via Context API only (AuthContext, ThemeContext).
- Standard data fetching pattern: loading state → fetch in useEffect → set data or error.
- Soft deletes preferred: set `isDeleted: true` rather than removing records.
- All timestamp management (createdAt, updatedAt) happens in the service layer, not in components.

### Theming Rules

- Use `bg-primary-*`, `text-primary-*`, `border-primary-*` classes — never `bg-orange-500` etc.
- All new UI must support dark mode via Tailwind's `dark:` variant.
- Test every new component under all three color themes and both light/dark modes.

### Service Layer Rules

- Components must never import JSON files directly.
- All data access must go through the corresponding service.
- Services return `ServiceResponse<T>` wrappers for consistency.
- All service functions are async (simulating future API integration).

---

## 16. Testing & QA Reference

### User Flows to Verify

1. **Agent Login → Dashboard** — login as `johndoe11`, verify personal metrics, lead count, navigation tiles.
2. **Lead CRUD** — create a new lead, verify zip auto-populates location, edit the lead, change status through lifecycle.
3. **Pharmacy Tagging** — open a lead, search pharmacies, tag 3, verify the 4th is blocked.
4. **Drug Tagging** — tag drugs with dosage/frequency, verify unlimited tags.
5. **Provider Tagging** — tag up to 5 providers, verify limit.
6. **Plan Browse & Filter** — switch themes, verify only matching carrier plans appear.
7. **Eligibility Check** — run Medicaid and LIS checks, verify results and stats.
8. **PBA Creation** — schedule an appointment for a lead, verify status tracking.
9. **PBKit Creation** — create a plan kit, verify plan selection and tracking status.
10. **Plan Recommendations** — select a lead, verify match scores and filters.
11. **YOY Comparison** — compare plans across years, verify impact badges.
12. **Enrollment Wizard** — walk through all 4 steps, verify form validation and submission.
13. **Admin User Management** — create/edit/delete users, verify super admin protections.
14. **Role Permissions** — create a restricted role, assign to user, verify access limits.
15. **Target Management** — create targets, verify they appear in productivity dashboard.
16. **Productivity Dashboard** — verify agent performance table, progress bars, drill-down links.
17. **Member Login** — login as member, verify theme switch, plan details, appointments.
18. **Dark Mode** — toggle dark mode across all pages, verify no broken styles.
19. **Theme Switching** — switch between Default/Aetna/Humana, verify colors, logos, plan filtering.
20. **Responsive** — test on mobile, tablet, and desktop breakpoints.

### Edge Cases

- Zip codes that span multiple counties (multiCountyZip flag).
- Leads with no tagged pharmacies/drugs/providers.
- Plans with missing premium or star rating data.
- Super admin deletion/deactivation attempts (should be blocked).
- Role/department deletion when users are assigned (should be blocked).
- Member login with incorrect DOB (should fail).
- Empty search results across all modules (should show EmptyState).

---

## 17. Known Limitations & Future Roadmap

### Current Limitations

- **No persistent backend** — all data is in-memory via JSON files; changes are lost on refresh.
- **No real authentication** — any password is accepted for demo purposes.
- **No email integration** — PBKit "send" and PBA "send to beneficiary" are simulated.
- **No PDF generation** — PBA download is a placeholder.
- **No Google Maps** — pharmacy/provider location is data-only, no map visualization.
- **Plan visibility rules not enforced** — plans are not yet filtered by beneficiary age, zip, or access level.
- **Premium adjustments partially implemented** — Medicaid/LIS adjustment logic exists in the service but is not fully wired through all UI flows.

### Planned Enhancements

1. **Real Backend & Database** — Node.js API server with persistent storage, multi-user concurrency, and audit trails.
2. **AI-Powered Agent Assist** — RAG pipeline (Databricks Vector Search or Qdrant), AI call scripts, auto-fill, note summarization, next-best-action via LLM.
3. **"Explain My Plan" for Members** — natural language plan explanation (e.g., "Is my insulin covered?").
4. **Google Maps Integration** — visual pharmacy and provider search with map pins.
5. **Email Integration** — real email delivery for PBKit and PBA notifications.
6. **PDF Generation** — downloadable PBA forms and plan comparison documents.
7. **Advanced Reporting** — exportable reports, trend analysis, carrier dashboards, commission reconciliation, compliance audit.
8. **SaaS & Multi-Tenant Model** — support for multiple carriers, brokerages, and FMOs as separate tenants with subscription-based access.

### Version History

| Version | Phase | Description |
|---------|-------|-------------|
| 0.1.0 | Phase 1 | Project setup and data foundation |
| 0.2.0 | Phase 2 | Core UI framework (auth, layout, dashboard) |
| 0.3.0 | Phase 3 | Admin module (users, roles, departments) |
| 0.4.0 | Phase 4 | Lead management module |
| 0.5.0 | Phase 5 | Plan module |
| 0.6.0 | Phase 6 | Pharmacy and drug modules |
| 0.7.0 | Phase 7 | PBA and PBKit modules |
| 0.8.0 | Phase 8 | Eligibility modules (Medicaid/LIS) |
| 0.9.0 | Phase 9 | Recommendations, YOY, and dashboard enhancements |
| 0.9.1 | — | Orange theme, dark mode fix |
| 0.9.2 | — | Module renaming (SOA→PBA, EKIT→PBKit) |
| 1.0.0 | Release | Production ready (planned) |

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.9.2] - 2025-12-29

### Changed
- **Module Renaming** - Renamed modules to avoid conflicts with industry-standard naming:
  - SOA → **PBA** (Plan Briefing Appointment)
  - EKIT → **PBKit** (Plan Bundle Kit)
  - Medicaid Eligibility → **State Assistance Check**
  - LIS Eligibility → **Plan Subsidy Check**
- Updated all routes, types, components, and references
- Updated permission and role definitions

## [0.9.1] - 2025-12-24

### Changed
- **Orange Theme**: Updated entire application theme from blue to orange gradients
  - Primary color changed to orange palette (orange-500, orange-600, orange-700)
  - Updated all components: Button, Badge, Input, Select, Tabs, SearchInput
  - Updated all pages with orange gradients and accents
  - Header and Sidebar logos now use orange gradient
  - Login page branding updated to orange
- **Dark Mode Fix**: Fixed dark mode configuration for Tailwind CSS v4
  - Added `@custom-variant dark` selector
  - Updated dark mode class handling

## [0.9.0] - 2025-12-24

### Added
- **Enhanced Dashboard**:
  - Welcome banner with quick stats (appointments, follow-ups, goal progress)
  - Performance metrics with progress bars (enrollments, SOAs, conversion, satisfaction)
  - Recent activity feed with type icons and timestamps
  - Upcoming appointments widget with appointment type icons
  - Top Plans section showing most enrolled plans
  - AI Recommend quick action button
- **Plan Recommendations Module** (`/recommendations`):
  - Plan recommendations based on beneficiary profile
  - Lead selection with Medicaid/LIS status display
  - Filter by plan type, max premium, minimum stars
  - Match score calculation (0-100%)
  - Drug coverage and pharmacy network percentages
  - Estimated annual cost calculations
  - Plan highlight badges (premium, coverage, benefits)
  - Expandable plan cards with detailed information
- **Year-Over-Year Comparison** (`/yoy`):
  - Side-by-side plan comparison (2024 vs 2025)
  - Summary cards for premium, star rating, and total changes
  - Detailed comparison table with change highlighting
  - Impact badges (Improved, Increased Cost, Changed)
  - Change direction icons (increase/decrease/same)
  - Drug tier and benefit comparison

## [0.8.0] - 2025-12-24

### Added
- **Medicaid Eligibility Module** (`/medicaid`):
  - Eligibility check form with Medicaid number, state, DOB
  - Eligibility verification result display (Eligible/Not Eligible)
  - Eligibility type indicator (Full, QMB, SLMB, QI)
  - Records list with verification dates and expiration
  - Stats cards (Total, Eligible, Not Eligible, Expiring Soon)
  - Eligibility types info panel
  - Detail modal with full eligibility information
- **LIS Eligibility Module** (`/lis`):
  - Low Income Subsidy eligibility check
  - LIS level determination (1-4)
  - Copay level display
  - Records list with level badges
  - Stats cards (Total, Eligible, Full Subsidy, Partial Subsidy)
  - LIS levels info panel with copay details
  - Detail modal with subsidy information

## [0.7.0] - 2025-12-24

### Added
- **SOA Management Module** (`/soa`):
  - SOA list with status badges (Pending, Sent, Completed, Expired)
  - Search by lead name or SOA ID
  - Filter by status
  - Stats cards (Total, Pending, Sent, Completed, Expired)
  - SOA detail modal with appointment info and topics
  - Create SOA modal with lead selection and topic checkboxes
  - Send to Beneficiary action
  - Download PDF placeholder
- **EKIT Management Module** (`/ekit`):
  - EKIT list with tracking status (Pending, Sent, Opened, Clicked)
  - Search by name or email
  - Filter by status
  - Stats cards (Total, Pending, Sent, Opened)
  - Plan count badges on cards
  - EKIT detail modal with send/open timestamps
  - Create EKIT modal with plan selection
  - Resend functionality

### Changed
- Updated type definitions for SOA, EKIT, and Eligibility
- Removed ComingSoon import from App.tsx (no longer needed)

## [0.6.0] - 2025-12-24

### Added
- **Pharmacy Search Module** (`/pharmacies`):
  - Search pharmacies by name
  - Filter by zip code proximity
  - Filter by state, 24-hour, retail, mail order
  - Grid and list view modes
  - Pharmacy detail modal with:
    - Contact information
    - Services & features (24hr, delivery, drive-thru, preferred)
    - Action buttons (Get Directions, Call)
- **Drug Formulary Module** (`/drugs`):
  - Search drugs by brand or generic name
  - Filter by dosage form, formulary tier, generic
  - Tier color-coded badges (Tier 1-5)
  - Grid and list view modes
  - Drug detail modal with:
    - Drug information (NDC, GPI, strength, form, route)
    - Classification (drug class, therapeutic category, manufacturer)
    - Coverage restrictions (PA, QL, Step Therapy)

## [0.5.0] - 2025-12-24

### Added
- **Plan Module**:
  - Plan List page with grid and list view options
  - Search plans by name, contract, or PBP
  - Filter by product (MAPD, PDP, MA), plan type (HMO, PPO, DSNP, CSNP), category
  - Contract year selector (2024, 2025)
  - Plan cards showing star ratings, premium, plan type badges
  - Plan Detail page with tabbed sections:
    - Overview: Plan details and cost summary
    - Benefits: Grouped by category with copay/coinsurance details
    - Premiums: Regional premium breakdown table
    - Documents: Placeholder for future
  - Star rating visualization component

## [0.4.0] - 2025-12-24

### Added
- **Lead Management Module**:
  - Lead List page with card grid layout
  - Search with debounce
  - Filter by status, state, Medicare type
  - Status summary with clickable counters
  - Lead Detail page with tabbed sections (Overview, Pharmacies, Drugs, Documents, Activity)
  - Lead Form for create/edit with validation
  - Zip code auto-lookup with city/state/county population
  - **Pharmacy Tagging**: Search and select up to 5 pharmacies per lead
  - **Drug Tagging**: Add medications with dosage, frequency, quantity details
- **Tagging Components**:
  - PharmacySearch - Multi-select pharmacy search with location filtering
  - DrugSearch - Drug search with expandable details editor
- **Additional Common Components**:
  - SearchInput with debounce and clear button
  - Tabs component with underline/pills variants
  - EmptyState component for no-data scenarios
  - StatusBadge for lead status display

### Fixed
- TypeScript type imports for verbatimModuleSyntax compatibility
- Table component generic type constraints
- Service layer type casting for JSON data

## [0.3.0] - 2025-12-24

### Added
- **Admin Module**:
  - Admin layout with tabbed navigation
  - User Management page with full CRUD operations
  - Role Management page with permission editor
  - Department Management page
  - System Settings page with multiple sections
- **User Service**:
  - User CRUD operations with validation
  - Role CRUD operations with permission management
  - Department CRUD operations
  - User count by role/department
  - Duplicate username/email prevention
- **Common UI Components**:
  - Modal component with size variants
  - ConfirmModal component for delete confirmations
  - Select dropdown component
  - Badge component with color variants
  - Table component with sorting, pagination
  - Pagination component with page size selector

### Changed
- Updated App.tsx with nested admin routes
- Added new exports to component indexes

## [0.2.0] - 2025-12-24

### Added
- **Theme System**: Light/dark mode with system preference detection
- **Authentication Context**: Role-based access control with demo users
- **Layout Components**:
  - Header with logo, theme toggle, notifications, and user menu
  - Responsive sidebar with navigation links
  - Footer with version information
- **Dashboard Page**:
  - Welcome banner with user greeting
  - Statistics cards with trend indicators
  - Quick action navigation tiles
  - Recent leads and appointments widgets
- **Common UI Components**:
  - Button component with variants (primary, secondary, outline, ghost, danger)
  - Input component with validation and icons
  - NavigationTile component with colors and badges
  - StatCard component with trends
- **React Router Setup**:
  - Protected and public route wrappers
  - All module routes configured
  - Coming Soon placeholder pages
  - 404 Not Found page
- **Login Page**:
  - Demo credentials display
  - Form validation
  - Password visibility toggle
  - Theme toggle on login screen

### Changed
- Upgraded to Tailwind CSS v4 with @tailwindcss/postcss plugin
- Updated PostCSS configuration for Tailwind v4 compatibility

## [0.1.0] - 2025-12-24

### Added
- Initial project setup with Vite, React 18, and TypeScript
- Tailwind CSS v3 configuration with dark mode support (class-based)
- Custom color palette (primary blue, secondary slate)
- Inter font family integration
- Base component styles (buttons, inputs, cards, tiles)
- Project folder structure:
  - `src/components/` - Reusable UI components
  - `src/pages/` - Page components for each module
  - `src/services/` - Data access layer
  - `src/data/` - JSON data files (lookup and runtime)
  - `src/context/` - React contexts (Theme, Auth)
  - `src/hooks/` - Custom React hooks
  - `src/types/` - TypeScript type definitions
  - `src/utils/` - Helper functions
- Dependencies installed:
  - react-router-dom - Client-side routing
  - lucide-react - Icon library
  - uuid - Unique ID generation
  - date-fns - Date manipulation
- Sample lookup data files (50 records each):
  - zipStateCounty.json - US geographic data
  - planInformation.json - Insurance plans
  - benefitData.json - Plan benefits
  - premiumInformation.json - Plan pricing
  - pharmacyData.json - Pharmacy locations
  - drugData.json - Drug catalog
  - starRatings.json - Plan star ratings
- Runtime data files:
  - leads.json - Lead records
  - users.json - Users/Agents
  - departments.json - Departments
  - roles.json - Role definitions
  - soa.json - Scope of Appointment records
  - ekit.json - Email kit tracking
  - enrollments.json - Enrollment records
  - medicaidEligibility.json - Medicaid eligibility data
  - lisEligibility.json - LIS eligibility data
- TypeScript type definitions for all data models
- Base service layer with CRUD operations

---

## Version History

| Version | Phase | Description |
|---------|-------|-------------|
| 0.1.0 | Phase 1 | Project Setup and Data Foundation |
| 0.2.0 | Phase 2 | Core UI Framework |
| 0.3.0 | Phase 3 | Admin Module |
| 0.4.0 | Phase 4 | Lead Management Module (Planned) |
| 0.5.0 | Phase 5 | Plan Module (Planned) |
| 0.6.0 | Phase 6 | Pharmacy and Drug Modules |
| 0.7.0 | Phase 7 | SOA and EKIT Modules |
| 0.8.0 | Phase 8 | Eligibility Modules (Medicaid/LIS) |
| 0.9.0 | Phase 9 | Recommendations, YOY, and Dashboard |
| 1.0.0 | Release | Production Ready (Planned) |


# TechSales App - Health Insurance Sales Management System

A comprehensive React-based application for managing health insurance sales, leads, plans, and enrollments. Built with modern web technologies and designed for insurance agents and administrators.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm/yarn
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The application will be available at `http://localhost:5173`

## 📋 Features

### Core Modules

- **Lead Management**: Complete CRUD operations for leads with lifecycle tracking
- **Plan Management**: Browse and compare insurance plans from multiple carriers (Aetna, Humana, etc.)
- **Pharmacy Search**: Search and tag pharmacies to leads
- **Drug Formulary**: Search drugs and tag medications to leads
- **Plan Briefing Appointments (PBA)**: Schedule and manage appointments
- **Plan Bundle Kits (PBKit)**: Create and send plan information kits
- **Eligibility Checks**: Medicaid (State Assistance) and LIS (Plan Subsidy) eligibility verification
- **Plan Recommendations**: AI-powered plan recommendations based on lead profiles
- **Year-Over-Year Comparison**: Compare plans across contract years
- **Admin Dashboard**: User, role, and department management with RBAC
- **Target Management**: Set and manage performance targets with points system for agents
- **Productivity Dashboard**: Monitor team performance metrics and target progress

### Key Features

- **Multi-Theme Support**: Switch between Default (Orange), Aetna (Purple), and Humana (Green) color themes
- **Dark Mode**: Full dark mode support with system preference detection
- **Responsive Design**: Mobile, tablet, and desktop optimized
- **Role-Based Access Control**: Granular permissions per module and action
- **Lead Lifecycle Tracking**: Visual timeline showing lead progression through stages
- **Multi-Carrier Plans**: Support for plans from multiple insurance carriers
- **Real-time Dashboard**: Dynamic statistics and insights for agents and admins

## 🏗️ Architecture

### Tech Stack

- **Frontend Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS v4 with custom theme system
- **Routing**: React Router DOM v7
- **Icons**: Lucide React
- **State Management**: React Context API
- **Data Storage**: JSON files (simulating backend)

### Project Structure

```
techsales-app/
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── common/          # Common components (Button, Input, Modal, etc.)
│   │   ├── layout/          # Layout components (Header, Sidebar, Layout)
│   │   ├── tiles/           # Navigation tiles and stat cards
│   │   └── tagging/         # Pharmacy and drug tagging components
│   ├── pages/               # Page components
│   │   ├── admin/          # Admin pages (User, Role, Department, Target management)
│   │   ├── leads/          # Lead management pages
│   │   ├── plans/          # Plan browsing and detail pages
│   │   ├── pharmacies/     # Pharmacy search
│   │   ├── drugs/          # Drug search
│   │   ├── eligibility/    # Eligibility check pages
│   │   ├── recommendations/ # Plan recommendations
│   │   └── member/         # Member-facing pages
│   ├── services/            # Data access layer (simulates API calls)
│   ├── data/               # JSON data files
│   │   ├── lookup/        # Reference data (plans, drugs, pharmacies, etc.)
│   │   └── runtime/       # Dynamic data (leads, users, enrollments, etc.)
│   ├── types/              # TypeScript type definitions
│   ├── context/            # React contexts (Auth, Theme)
│   ├── utils/              # Utility functions
│   └── hooks/              # Custom React hooks
├── public/                 # Static assets
└── package.json
```

## 🎨 Theming System

The application supports multiple color themes that can be changed via System Settings (Admin only):

- **Default Theme**: Orange (#f97316)
- **Aetna Theme**: Purple (#5a2e6f)
- **Humana Theme**: Green (#5c9a1b)

Themes are applied using CSS variables and Tailwind's `@theme` directive. All components use `primary-*` classes that automatically adapt to the selected theme.

### Using Themes in Components

```tsx
// Use primary color classes instead of hardcoded colors
<button className="bg-primary-600 hover:bg-primary-700 text-white">
  Click me
</button>
```

## 👥 Authentication & Authorization

### Demo Credentials

See `LOGIN_CREDENTIALS.md` in the root directory for all available demo accounts.

### Role-Based Access Control (RBAC)

The application uses a permission-based system where:
- **Roles** define sets of permissions
- **Permissions** are module + action pairs (e.g., `leads:create`, `plans:view`)
- **Users** are assigned roles and departments

### Available Roles

- **Super Admin**: Full access to all modules and admin functions
- **Sales Agent**: Can view, create, and edit leads, plans, and enrollments
- **Customer Service Rep**: View-only access for support purposes

## 🎯 Target Management System

### Overview

The Target Management system allows administrators to set performance targets for agents and track their progress. Targets are used to calculate agent performance metrics displayed in the Productivity Dashboard.

### Features

- **Set Monthly Targets**: Configure targets for different metrics:
  - New Leads
  - New Enrollments
  - New Appointments
  - Electronic Kits Sent
- **Points System**: Assign points for achieving each target
- **Period Support**: Set targets for daily, weekly, monthly, quarterly, or yearly periods
- **Active/Inactive Status**: Enable or disable targets as needed
- **Agent Performance Integration**: Agent Performance metrics automatically use admin-set targets

### Accessing Target Management

1. Navigate to **Admin Panel** → **Target Management** tab
2. Or click **"Manage Targets"** button from the Productivity Dashboard

### Default Targets

The system comes with default monthly targets:
- **New Leads**: 50 leads/month (100 points)
- **New Enrollments**: 25 enrollments/month (200 points)
- **New Appointments**: 30 appointments/month (150 points)
- **Electronic Kits Sent**: 50 kits/month (75 points)

### How It Works

1. Admins create targets in the Target Management page
2. The Productivity Dashboard loads active targets
3. Agent Performance metrics calculate progress based on the active monthly target for "New Enrollments"
4. Target progress is displayed as a percentage in the Agent Performance table
5. Progress bars show visual representation of target achievement

## 📊 Lead Lifecycle

Leads progress through the following lifecycle stages:

1. **New Lead** - Initial lead entry
2. **Contacted Lead** - First contact made
3. **Appointment Schedule** - Appointment scheduled
4. **Enrollment in progress** - Enrollment process started
5. **Enrolled** - Successfully enrolled
6. **Dropped / Lost lead** - Lead lost or dropped

Each lead must have a **source** field:
- Web
- Call
- Event
- Referral
- Vendor

## 📈 Productivity Dashboard

### Features

- **Lead Lifecycle Overview**: Visual progress bars showing distribution of leads across all lifecycle stages
- **Agent Performance Table**: 
  - Shows all agents with their enrollment counts, lead counts, conversion rates, and target progress
  - Pagination support (default: 5 agents per page)
  - Target progress calculated based on admin-set monthly enrollment targets
  - Progress bars with color coding (green ≥90%, blue ≥70%, yellow ≥50%, red <50%)
- **Summary Statistics**: 
  - Total Enrollments
  - Total Leads
  - Total Revenue
  - Average Conversion Rate (Total Enrollments / Total Leads)
  - Monthly Cost Savings (from multi-platform savings)
- **Targets Overview**: Visual cards showing target progress for different metrics and periods
- **Period Filtering**: Filter targets by daily, weekly, or monthly periods

## 🏥 Plan Management

### Plan Types

- **MAPD** (Medicare Advantage Prescription Drug)
- **MA** (Medicare Advantage)
- **PDP** (Prescription Drug Plan)
- **Medsup** (Medicare Supplement)
- **ANC** (Additional Non-Covered)

### Plan Categories

- Medicare Advantage
- PDP
- Medsup
- ANC

### Multi-Carrier Support

Plans can be from multiple insurance carriers. Currently supported:
- Aetna
- Humana
- UnitedHealthcare
- Cigna
- Blue Cross Blue Shield
- And more...

Plans include:
- Premium information (with Medicaid/LIS adjustments)
- Benefit details (with availability indicators)
- Star ratings
- Documents (Summary of Benefits, Evidence of Coverage, etc.)

## 📁 Data Storage

Currently, the application uses JSON files to simulate a backend:

### Lookup Data (`src/data/lookup/`)
- `planInformation.json` - Plan details
- `premiumInformation.json` - Premium pricing
- `benefitData.json` - Plan benefits
- `starRatings.json` - Plan quality ratings
- `drugData.json` - Drug formulary
- `pharmacyData.json` - Pharmacy locations
- `zipStateCounty.json` - Geographic data

### Runtime Data (`src/data/runtime/`)
- `leads.json` - Lead records
- `users.json` - User accounts
- `roles.json` - Role definitions
- `departments.json` - Department information
- `enrollments.json` - Enrollment records
- `pba.json` - Plan Briefing Appointments
- `pbkit.json` - Plan Bundle Kits
- `medicaidEligibility.json` - Medicaid eligibility records
- `lisEligibility.json` - LIS eligibility records
- `members.json` - Member accounts
- `memberAppointments.json` - Member appointments
- `targets.json` - Performance targets and points configuration

## 🔧 Development

### Adding a New Component

1. Create component in appropriate directory (`components/common/`, `components/layout/`, etc.)
2. Export from `components/common/index.ts` or appropriate index file
3. Use TypeScript for type safety
4. Follow existing component patterns (props interface, default exports)

### Adding a New Page

1. Create page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation link in `src/components/layout/Layout.tsx` (if needed)
4. Update permissions in `src/data/runtime/roles.json` (if needed)

### Service Layer Pattern

Services in `src/services/` simulate API calls:

```typescript
// Example: leadService.ts
export async function getAllLeads(): Promise<Lead[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 100));
  // Read from JSON file
  const data = await import('../data/runtime/leads.json');
  return data.default;
}
```

### Styling Guidelines

- Use Tailwind CSS utility classes
- Use `primary-*` classes for theme-aware colors
- Support dark mode with `dark:` variants
- Follow responsive design patterns (`sm:`, `md:`, `lg:` breakpoints)

## 📝 TypeScript

The project uses strict TypeScript. All data models are defined in `src/types/`:

- `lead.ts` - Lead interfaces and types
- `plan.ts` - Plan interfaces and types
- `user.ts` - User and role types
- `pharmacy.ts` - Pharmacy types
- `drug.ts` - Drug types
- `target.ts` - Target and points system types
- And more...

## 🧪 Testing

Currently, the application does not include automated tests. Manual testing is performed through the UI.

## 📄 License

This is a private project for internal use.

## 🤝 Contributing

When contributing:
1. Follow the existing code style
2. Use TypeScript for all new code
3. Update documentation for new features
4. Test thoroughly before committing
5. Update CHANGELOG.md for significant changes

## 📚 Additional Documentation

- `CHANGELOG.md` - Version history and changes
- `RequirementDoc.txt` - Original requirements document
- `LOGIN_CREDENTIALS.md` - Demo account credentials
- `DEVELOPER_GUIDE.md` - Detailed development guide (see below)

For more detailed development information, see `DEVELOPER_GUIDE.md`.

# TechSalesApp (Medicare Hub) — Management Demo Presentation Points

> **Duration:** 30 minutes | **Demo Flow:** Agent → Admin → Member

---

## TechSalesApp — 10 Key Application Highlights

1. **End-to-End Health Insurance Sales Workflow** — Covers the full sales funnel from lead capture to enrollment submission, including SOA scheduling, plan briefing kits, eligibility checks, and plan comparison — all in one platform. We are showcasing Medicare as an example, but the platform is designed to incorporate any line of health insurance business.

2. **Dynamic Plan Discovery Based on Geography & Lead Profile** — Plans are not static. They change dynamically based on the lead's zip code, state, county, and profile information — ensuring agents only see plans relevant to the beneficiary's location and eligibility.

3. **Side-by-Side Plan Comparison** — Agents can compare plans across carriers with a Year-Over-Year view (2024 vs 2025) featuring impact badges (Improved / Increased Cost / Changed), helping agents proactively advise members on plan changes.

4. **Dual Eligibility Engine** — Built-in Medicaid eligibility check (Full/QMB/SLMB/QI) and LIS subsidy determination (Levels 1–4) with copay-level display — critical for DSNP and LIS plan placement.

5. **Member Self-Service Portal** — Separate member login (Policy Number + DOB) with plan details, benefits view, enrollment history, and upcoming appointment visibility — no agent dependency.

6. **Pharmacy, Drug & Provider Tagging** — Agents can search and tag pharmacies (max 3), drugs (unlimited with dosage/quantity/frequency), and providers (max 5) per lead to drive accurate plan matching.

7. **Carrier-Aware Theming** — UI dynamically adapts its theme per carrier context (Aetna blue, Humana green) with full light/dark mode support — ready for white-label deployment.

8. **80+ Real Medicare Plans Across 5 Carriers** — Preloaded with actual plan data across Aetna, Humana, UnitedHealthcare, Cigna, and BCBS — covering MAPD, MA, PDP, Medicare Supplement, and Ancillary products.

9. **Analytics for Agents & Admins with Target Management** — Agents get a personal Insights Dashboard with KPIs (leads, enrollments, conversion rate, monthly performance). Admins get a Productivity Dashboard with agent performance drill-downs, lead lifecycle views, financial breakdowns, and the ability to create and track targets (daily/weekly/monthly/quarterly) with a points system.

10. **Three User Roles: Agent, Admin & Member** — Granular RBAC with per-module, per-action permissions (view/create/edit/delete/export). Supports Admin, Agent, and Member access levels — each with a tailored experience. *(Demo: we'll walk through each role live)*

---

## How TechSalesApp Differs from ThinkAgent — 5 Points (Analytics & Reporting Focus)

1. **Purpose-Built Sales Analytics vs General-Purpose Querying** — TechSalesApp has a dedicated Productivity Dashboard with pre-built KPIs (enrollments, conversion rates, lead lifecycle, revenue). ThinkAgent requires users to write SQL queries to extract insights — no out-of-the-box sales analytics.

2. **Visual Lead Lifecycle Tracking** — TechSalesApp renders a 6-stage horizontal pipeline (New Lead → Contacted → Appointment → Enrollment in Progress → Enrolled → Dropped) with counts and percentages. ThinkAgent has no visual funnel — data sits in raw table rows.

3. **Financial Reporting Built-In** — Flippable dashboard cards show agent commission (15–20%), carrier revenue splits (75–80%), and cost savings breakdowns by product type (MAPD: $20/enrollment, PDP: $18). ThinkAgent has no financial calculation layer.

4. **Agent Performance Drill-Down** — Admins see a ranked agent table (enrollments, leads, conversion rate, target progress %) and can click through to individual agent enrollments and leads. ThinkAgent offers no agent-level performance views.

5. **Target Management with Gamification** — Admins set daily/weekly/monthly/quarterly/yearly targets with a points system. Progress is tracked visually on the dashboard. ThinkAgent has no target-setting or goal-tracking capability.

---

## How TechSalesApp Differs from 3rd Party Tools (Salesforce, Connecture, SunFire, Benefytt) — 5 Points

1. **Healthcare-First, Not CRM-Adapted** — Unlike Salesforce Health Cloud which retrofits a generic CRM, TechSalesApp is built ground-up for health insurance sales — every screen, field, and workflow maps directly to the enrollment lifecycle (AEP/OEP/SEP/IEP/ICEP).

2. **Integrated Eligibility + Plan Matching in One Flow** — Tools like Connecture and SunFire separate quoting from eligibility. TechSalesApp chains Medicaid check → LIS determination → drug/pharmacy/provider tagging → plan comparison in a single agent workflow — no context switching.

3. **No Per-Seat Licensing or Vendor Lock-In** — Built in-house with open-source stack (React, Vite, Tailwind). No recurring SaaS fees, no carrier-specific platform dependencies. Full control over feature roadmap and data.

4. **Carrier-Agnostic Multi-Carrier View** — Most carrier-provided tools (Aetna Agent Portal, Humana MarketPoint) only show their own plans. TechSalesApp displays 80+ plans across 5 carriers side-by-side, enabling unbiased plan comparison.

5. **White-Label Ready with Carrier Theming** — Unlike rigid 3rd party UIs, TechSalesApp dynamically adapts its theme per carrier context. This makes it deployable as a branded solution for any carrier or brokerage without UI rework.

---

## Future Roadmap — 5 Points

1. **AI-Powered Agent Assist (RAG Pipeline)** — Architecture is already designed (Databricks Vector Search or Qdrant options). Will add AI call script generation, lead form auto-fill, note summarization, and "next best action" recommendations powered by LLM.

2. **"Explain My Plan" for Members** — AI-driven natural language plan explanation in the Member Portal — members ask questions like "Is my insulin covered?" and get plain-English answers sourced from formulary and benefit documents.

3. **Real Backend & Persistent Data Layer** — Moving from in-memory data to a Node.js backend with database persistence, enabling multi-user concurrent access, audit trails, and production-grade data integrity.

4. **Advanced Reporting & Analytics Module** — Exportable reports, trend analysis over enrollment periods, carrier-level performance dashboards, commission reconciliation, and compliance audit reporting.

5. **SaaS & Cloud-Ready Product Model** — The platform is designed to be converted into a SaaS product, deployable as a cloud-hosted solution. This enables multi-tenant onboarding for carriers, brokerages, and FMOs — offered as a subscription service with scalable infrastructure and zero client-side installation.

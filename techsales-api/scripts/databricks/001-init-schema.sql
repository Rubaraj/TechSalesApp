-- Medicare Hub — Phase 1a Databricks schema initialization
--
-- Storage strategy: each table has a primary-key column + a `data` STRING
-- column holding the JSON-encoded entity, plus optional created_at/updated_at
-- TIMESTAMPs for sorting. Mirrors the Mongo document model exactly so the
-- migration is a near-identity transform.
--
-- USAGE — run this ONCE inside the org via the Databricks SQL editor.
-- Replace `${CATALOG}` with your actual catalog name (default: dev_medhub).
-- All statements are idempotent (CREATE … IF NOT EXISTS).

CREATE CATALOG IF NOT EXISTS dev_medhub;

CREATE SCHEMA IF NOT EXISTS dev_medhub.medhub_app;
CREATE SCHEMA IF NOT EXISTS dev_medhub.medhub_lookup;

-- =================== APP SCHEMA (mutable) ===================

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_app.leads (
  lead_id    STRING NOT NULL,
  data       STRING NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_app.users (
  user_id    STRING NOT NULL,
  data       STRING NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_app.roles (
  role_id    STRING NOT NULL,
  data       STRING NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_app.departments (
  department_id STRING NOT NULL,
  data          STRING NOT NULL,
  created_at    TIMESTAMP,
  updated_at    TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_app.enrollments (
  enrollment_id STRING NOT NULL,
  data          STRING NOT NULL,
  created_at    TIMESTAMP,
  updated_at    TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_app.targets (
  target_id  STRING NOT NULL,
  data       STRING NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
) USING DELTA;

-- aiInteractions audit log (write-mostly; aggregate queries via get_json_object).
CREATE TABLE IF NOT EXISTS dev_medhub.medhub_app.ai_interactions (
  interaction_id STRING NOT NULL,
  data           STRING NOT NULL,
  created_at     TIMESTAMP,
  updated_at     TIMESTAMP
) USING DELTA;

-- =================== LOOKUP SCHEMA (read-only reference) ===================

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_lookup.members (
  member_id  STRING NOT NULL,
  data       STRING NOT NULL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
) USING DELTA;

CREATE TABLE IF NOT EXISTS dev_medhub.medhub_lookup.member_appointments (
  appointment_id STRING NOT NULL,
  data           STRING NOT NULL,
  created_at     TIMESTAMP,
  updated_at     TIMESTAMP
) USING DELTA;

-- (Reference catalogs for plans, drugs, pharmacies, providers, formulary, etc.
--  follow the same shape and can be added here as the migration of those
--  collections is needed. Phase 1a focuses on the app DB; lookup tables
--  beyond members are populated from JSON seed files via the migration script.)

-- =================== VERIFY ===================
-- After running the above, you can verify with:
--   SHOW TABLES IN dev_medhub.medhub_app;
--   SHOW TABLES IN dev_medhub.medhub_lookup;

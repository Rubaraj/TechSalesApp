/**
 * Deterministic generator for recent sales activity.
 *
 * The committed seed data is a historical snapshot (Oct 2025 - Jan 2026), so
 * every period-scoped view on the productivity dashboard reads zero. This
 * generates a block of realistic leads, enrollments and appointments spanning
 * the PREVIOUS and CURRENT month, ending today, and appends it to the seed
 * files. Historical records are left exactly as they are.
 *
 * Determinism: every field is derived from a SHA-256 of a stable key (the same
 * approach as build-formulary.ts), so re-running on the same day rewrites the
 * identical bytes — no diff churn, and a specific dataset is reproducible.
 *
 * Idempotent: generated records carry the `-G` id prefixes below. Each run
 * strips anything with those prefixes before regenerating, so it never
 * duplicates and never touches `LEAD-001` / `ENROLL-001` / `APT-001`.
 *
 * The previous month is generated at a slightly lower rate than the current one
 * so month-over-month deltas are non-zero, and today is a partial day so
 * "on track" pacing reads correctly rather than looking like a miss.
 *
 * CLI:
 *   npm run data:generate
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const RUNTIME_DIR = path.join(SERVER_ROOT, 'data', 'sample', 'runtime');
const LOOKUP_DIR = path.join(SERVER_ROOT, 'data', 'sample', 'lookup');

const LEAD_PREFIX = 'LEAD-G';
const ENROLL_PREFIX = 'ENROLL-G';
const APPT_PREFIX = 'APT-G';

/**
 * Per-day team volume for the current month. Sized against the seeded targets
 * (per-agent x 13 active agents = 260 leads / 195 enrollments / 234 appointments
 * a month) to land pacing in the high 80s-90s — close enough to target that some
 * metrics read on-track and some behind, rather than uniformly failing.
 */
const LEADS_PER_DAY = 8;
const ENROLLMENTS_PER_DAY = 6;
const APPOINTMENTS_PER_DAY = 7;
/** Previous month runs slightly lighter so deltas show growth. */
const PREV_MONTH_FACTOR = 0.9;
/** Today is a partial day. Fixed (not clock-derived) to keep runs identical. */
const TODAY_FACTOR = 0.55;
/** Day-to-day jitter, so volumes don't look machine-flat. */
const JITTER = 0.35;

// --- deterministic primitives ----------------------------------------------

/** Stable [0,1) from a key. */
function rand(key: string): number {
  const h = createHash('sha256').update(key).digest();
  return h.readUInt32BE(0) / 0x1_0000_0000;
}
const pick = <T>(arr: readonly T[], key: string): T => arr[Math.floor(rand(key) * arr.length)]!;
const intBetween = (min: number, max: number, key: string): number =>
  min + Math.floor(rand(key) * (max - min + 1));

// --- name / attribute pools -------------------------------------------------

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'William', 'Linda',
  'David', 'Elizabeth', 'Richard', 'Barbara', 'Joseph', 'Susan', 'Thomas', 'Jessica',
  'Charles', 'Karen', 'Christopher', 'Sarah', 'Daniel', 'Nancy', 'Matthew', 'Betty',
  'Anthony', 'Margaret', 'Donald', 'Sandra', 'Mark', 'Ashley', 'Paul', 'Dorothy',
  'Steven', 'Carol', 'Andrew', 'Ruth', 'Kenneth', 'Sharon', 'George', 'Michelle',
] as const;

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
] as const;

const SOURCES = ['Web', 'Call', 'Event', 'Referral', 'Vendor'] as const;
/** Statuses for leads that did NOT enrol. 'Enrolled' is assigned by enrollment. */
const OPEN_STATUSES = [
  'New Lead',
  'Contacted Lead',
  'Appointment Schedule',
  'Enrollment in progress',
  'Dropped / Lost lead',
] as const;
const GENDERS = ['Male', 'Female'] as const;
const ETHNICITIES = ['Hispanic', 'Non-Hispanic'] as const;
const RACES = ['White', 'Black', 'Asian', 'Native American', 'Other'] as const;
const EMAIL_HOSTS = ['email.com', 'hotmail.com', 'outlook.com', 'gmail.com'] as const;

const ENROLLMENT_TYPES = ['New Enrollment', 'Plan Change', 'Re-enrollment'] as const;
const ENROLLMENT_PERIODS = ['AEP', 'OEP', 'IEP', 'SEP'] as const;
const ENROLLMENT_STATUSES = ['Active', 'Pending', 'Submitted', 'Approved'] as const;
const APPOINTMENT_TYPES = ['Initial Consultation', 'Follow-up', 'Annual Review', 'Plan Change'] as const;
const APPOINTMENT_TIMES = ['9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'] as const;

// --- shapes we read ---------------------------------------------------------

interface ZipRow { zipCode: string; state: string; stateAbbr: string; county: string; city: string }
interface PlanRow { planId: string; product?: string }
interface UserRow {
  userId: string;
  firstName?: string;
  lastName?: string;
  accessLevel?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
}
type Row = Record<string, unknown>;

const readJson = async <T>(dir: string, file: string): Promise<T[]> =>
  JSON.parse(await fs.readFile(path.join(dir, `${file}.json`), 'utf8')) as T[];

const iso = (d: Date): string => d.toISOString();
const ymd = (d: Date): string => {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (d: Date, n: number): Date => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};

/** Volume for one day, with deterministic jitter. */
function dailyCount(base: number, day: string, kind: string, factor: number): number {
  const j = 1 - JITTER + rand(`${kind}|jitter|${day}`) * (JITTER * 2);
  return Math.max(1, Math.round(base * factor * j));
}

async function main(): Promise<void> {
  const [zips, plans, users, existingLeads, existingEnrollments, existingAppointments] =
    await Promise.all([
      readJson<ZipRow>(LOOKUP_DIR, 'zipStateCounty'),
      readJson<PlanRow>(LOOKUP_DIR, 'planInformation'),
      readJson<UserRow>(RUNTIME_DIR, 'users'),
      readJson<Row>(RUNTIME_DIR, 'leads'),
      readJson<Row>(RUNTIME_DIR, 'enrollments'),
      readJson<Row>(RUNTIME_DIR, 'memberAppointments'),
    ]);

  const agents = users.filter((u) => u.isActive !== false && !u.isSuperAdmin).map((u) => u.userId);
  if (agents.length === 0) throw new Error('No active agents in users.json');
  const userName = new Map(
    users.map((u) => [u.userId, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.userId]),
  );

  // Bucket plans by product so every commission tier and cost-savings branch is
  // exercised. Medsup/ANC savings are a % of premium, so those need real premiums.
  const byProduct = new Map<string, PlanRow[]>();
  for (const p of plans) {
    if (!p.product) continue;
    const list = byProduct.get(p.product) ?? [];
    list.push(p);
    byProduct.set(p.product, list);
  }
  const PRODUCT_MIX = ['MAPD', 'MAPD', 'MAPD', 'MAPD', 'PDP', 'PDP', 'Medsup', 'ANC'].filter((p) =>
    byProduct.has(p),
  );
  if (PRODUCT_MIX.length === 0) throw new Error('No usable plan products in planInformation.json');

  // --- window: start of previous month -> today -----------------------------
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const days: Date[] = [];
  for (let d = new Date(windowStart); d <= today; d = addDays(d, 1)) days.push(new Date(d));

  // --- leads ----------------------------------------------------------------
  interface GenLead { row: Row; id: string; createdAt: Date; agentId: string; enrolled: boolean }
  const genLeads: GenLead[] = [];
  let leadSeq = 0;

  for (const day of days) {
    const key = ymd(day);
    const isPrev = day < currentMonthStart;
    const isToday = key === ymd(today);
    const factor = (isPrev ? PREV_MONTH_FACTOR : 1) * (isToday ? TODAY_FACTOR : 1);

    for (let i = 0; i < dailyCount(LEADS_PER_DAY, key, 'lead', factor); i++) {
      leadSeq += 1;
      const k = `lead|${key}|${i}`;
      const id = `${LEAD_PREFIX}${String(leadSeq).padStart(5, '0')}`;
      const zip = pick(zips, `${k}|zip`);
      const first = pick(FIRST_NAMES, `${k}|first`);
      const last = pick(LAST_NAMES, `${k}|last`);
      const agentId = agents[leadSeq % agents.length]!; // every agent gets leads
      const age = intBetween(64, 88, `${k}|age`);
      const dobYear = day.getFullYear() - age;
      const dob = `${dobYear}-${String(intBetween(1, 12, `${k}|dobm`)).padStart(2, '0')}-${String(intBetween(1, 28, `${k}|dobd`)).padStart(2, '0')}`;
      const partA = `${dobYear + 65}-${String(intBetween(1, 12, `${k}|pam`)).padStart(2, '0')}-01`;
      // Spread the creation time across a working day.
      const createdAt = new Date(day);
      createdAt.setHours(intBetween(8, 18, `${k}|hr`), intBetween(0, 59, `${k}|min`), 0, 0);

      genLeads.push({
        id,
        createdAt,
        agentId,
        enrolled: false,
        row: {
          leadId: id,
          firstName: first,
          lastName: last,
          dob,
          age,
          gender: pick(GENDERS, `${k}|gender`),
          email: `${first.toLowerCase()}.${last.toLowerCase()}${intBetween(10, 999, `${k}|em`)}@${pick(EMAIL_HOSTS, `${k}|host`)}`,
          // 555 is the reserved range — never a dialable number.
          phone: `${intBetween(200, 989, `${k}|ac`)}-555-${String(intBetween(0, 9999, `${k}|ln`)).padStart(4, '0')}`,
          address1: `${intBetween(100, 9899, `${k}|st`)} ${pick(['Main Street', 'Oak Avenue', 'Maple Drive', 'Cedar Lane', 'Elm Street', 'Park Road'], `${k}|rd`)}`,
          address2: rand(`${k}|apt`) < 0.25 ? `Apt ${intBetween(1, 40, `${k}|aptn`)}` : '',
          zipCode: zip.zipCode,
          state: zip.stateAbbr,
          county: zip.county,
          city: zip.city,
          ethnicity: pick(ETHNICITIES, `${k}|eth`),
          race: pick(RACES, `${k}|race`),
          medicareNumber: `${intBetween(1, 9, `${k}|m1`)}${pick(['EG', 'HK', 'QT', 'RW', 'VX'], `${k}|m2`)}${intBetween(1, 9, `${k}|m3`)}-${pick(['TE', 'MK', 'PA', 'ZC'], `${k}|m4`)}${intBetween(1, 9, `${k}|m5`)}-${pick(['MK', 'QW', 'HD', 'LN'], `${k}|m6`)}${intBetween(10, 99, `${k}|m7`)}`,
          medicaidId: null,
          stateAssistanceNumber: null,
          partADate: partA,
          partBDate: partA,
          leadStatus: pick(OPEN_STATUSES, `${k}|status`),
          permissionToContact: rand(`${k}|ptc`) < 0.85,
          existingCarrier1Member: rand(`${k}|c1`) < 0.3,
          tobaccoUsage: rand(`${k}|tob`) < 0.18,
          taggedPharmacies: [],
          taggedDrugs: [],
          createdAt: iso(createdAt),
          createdBy: agentId,
          source: pick(SOURCES, `${k}|src`),
        },
      });
    }
  }

  // --- enrollments ----------------------------------------------------------
  // Drawn from leads already created on/before the enrollment day, so
  // enrollmentDate >= lead.createdAt always holds.
  const genEnrollments: Row[] = [];
  let enrollSeq = 0;

  for (const day of days) {
    const key = ymd(day);
    const isPrev = day < currentMonthStart;
    const isToday = key === ymd(today);
    const factor = (isPrev ? PREV_MONTH_FACTOR : 1) * (isToday ? TODAY_FACTOR : 1);
    const want = dailyCount(ENROLLMENTS_PER_DAY, key, 'enroll', factor);

    // Candidates: created within the preceding three weeks and not yet enrolled.
    const cutoff = addDays(day, -21);
    const pool = genLeads.filter(
      (l) => !l.enrolled && l.createdAt <= new Date(day.getTime() + 86_399_000) && l.createdAt >= cutoff,
    );
    for (let i = 0; i < want && pool.length > 0; i++) {
      const lead = pool[Math.floor(rand(`enroll|${key}|${i}|pick`) * pool.length)]!;
      if (lead.enrolled) continue;
      lead.enrolled = true;
      enrollSeq += 1;
      const k = `enroll|${key}|${i}`;
      const product = pick(PRODUCT_MIX, `${k}|prod`);
      const plan = pick(byProduct.get(product)!, `${k}|plan`);
      // Medsup/ANC savings and commission are a share of premium — keep them non-zero.
      const premium =
        product === 'Medsup' || product === 'ANC'
          ? intBetween(80, 199, `${k}|prem`)
          : intBetween(0, 160, `${k}|prem`);
      // Enrol at or after the lead was created, never in the future.
      const enrolledAt = new Date(day);
      enrolledAt.setHours(Math.max(lead.createdAt.getHours(), 9), 30, 0, 0);
      const effective = new Date(day.getFullYear(), day.getMonth() + 1, 1);

      genEnrollments.push({
        enrollmentId: `${ENROLL_PREFIX}${String(enrollSeq).padStart(5, '0')}`,
        leadId: lead.id,
        planId: plan.planId,
        agentId: lead.agentId,
        enrollmentDate: ymd(day),
        effectiveDate: ymd(effective),
        enrollmentType: pick(ENROLLMENT_TYPES, `${k}|type`),
        enrollmentPeriod: pick(ENROLLMENT_PERIODS, `${k}|period`),
        status: pick(ENROLLMENT_STATUSES, `${k}|status`),
        premium,
        medicaidEligible: rand(`${k}|medicaid`) < 0.22,
        notes: '',
        createdAt: iso(enrolledAt),
        createdBy: lead.agentId,
      });
      // An enrolled lead's status must reflect that.
      (lead.row as Record<string, unknown>).leadStatus = 'Enrolled';
    }
  }

  // --- appointments ---------------------------------------------------------
  const genAppointments: Row[] = [];
  let apptSeq = 0;

  for (const day of days) {
    const key = ymd(day);
    const isPrev = day < currentMonthStart;
    const isToday = key === ymd(today);
    const factor = (isPrev ? PREV_MONTH_FACTOR : 1) * (isToday ? TODAY_FACTOR : 1);
    const cutoff = addDays(day, -30);
    const pool = genLeads.filter(
      (l) => l.createdAt <= new Date(day.getTime() + 86_399_000) && l.createdAt >= cutoff,
    );
    if (pool.length === 0) continue;

    for (let i = 0; i < dailyCount(APPOINTMENTS_PER_DAY, key, 'appt', factor); i++) {
      apptSeq += 1;
      const k = `appt|${key}|${i}`;
      const lead = pool[Math.floor(rand(`${k}|pick`) * pool.length)]!;
      const past = day < today;
      genAppointments.push({
        appointmentId: `${APPT_PREFIX}${String(apptSeq).padStart(5, '0')}`,
        memberId: lead.id,
        agentId: lead.agentId,
        agentName: userName.get(lead.agentId) ?? 'Unknown',
        appointmentType: pick(APPOINTMENT_TYPES, `${k}|type`),
        scheduledDate: key,
        scheduledTime: pick(APPOINTMENT_TIMES, `${k}|time`),
        status: past ? (rand(`${k}|st`) < 0.12 ? 'Cancelled' : 'Completed') : 'Scheduled',
        notes: '',
        createdAt: iso(addDays(day, -intBetween(1, 7, `${k}|created`))),
      });
    }
  }

  // A handful of upcoming appointments so the pipeline isn't all in the past.
  for (let i = 0; i < 12; i++) {
    apptSeq += 1;
    const k = `appt|future|${i}`;
    const lead = genLeads[Math.floor(rand(`${k}|pick`) * genLeads.length)]!;
    const when = addDays(today, intBetween(1, 14, `${k}|offset`));
    genAppointments.push({
      appointmentId: `${APPT_PREFIX}${String(apptSeq).padStart(5, '0')}`,
      memberId: lead.id,
      agentId: lead.agentId,
      agentName: userName.get(lead.agentId) ?? 'Unknown',
      appointmentType: pick(APPOINTMENT_TYPES, `${k}|type`),
      scheduledDate: ymd(when),
      scheduledTime: pick(APPOINTMENT_TIMES, `${k}|time`),
      status: 'Scheduled',
      notes: '',
      createdAt: iso(today),
    });
  }

  // --- merge: drop any previously generated block, keep history -------------
  const keep = (rows: Row[], field: string, prefix: string): Row[] =>
    rows.filter((r) => !String(r[field] ?? '').startsWith(prefix));

  const leadsOut = [...keep(existingLeads, 'leadId', LEAD_PREFIX), ...genLeads.map((l) => l.row)];
  const enrollmentsOut = [...keep(existingEnrollments, 'enrollmentId', ENROLL_PREFIX), ...genEnrollments];
  const appointmentsOut = [...keep(existingAppointments, 'appointmentId', APPT_PREFIX), ...genAppointments];

  await Promise.all([
    fs.writeFile(path.join(RUNTIME_DIR, 'leads.json'), `${JSON.stringify(leadsOut, null, 2)}\n`),
    fs.writeFile(path.join(RUNTIME_DIR, 'enrollments.json'), `${JSON.stringify(enrollmentsOut, null, 2)}\n`),
    fs.writeFile(path.join(RUNTIME_DIR, 'memberAppointments.json'), `${JSON.stringify(appointmentsOut, null, 2)}\n`),
  ]);

  const statuses = new Set(genLeads.map((l) => l.row.leadStatus));
  const sources = new Set(genLeads.map((l) => l.row.source));
  // eslint-disable-next-line no-console
  console.log(
    [
      `window        ${ymd(windowStart)} -> ${ymd(today)} (${days.length} days)`,
      `leads         +${genLeads.length}  (total ${leadsOut.length})`,
      `enrollments   +${genEnrollments.length}  (total ${enrollmentsOut.length})`,
      `appointments  +${genAppointments.length}  (total ${appointmentsOut.length})`,
      `statuses      ${[...statuses].join(', ')}`,
      `sources       ${[...sources].join(', ')}`,
      `agents        ${new Set(genLeads.map((l) => l.agentId)).size}`,
    ].join('\n'),
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('generate-recent-activity failed:', err);
  process.exit(1);
});

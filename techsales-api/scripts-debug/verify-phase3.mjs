// Phase 3 smoke test — boots the server in-process via tsx (since the source is TS) is hard,
// so instead we just exercise endpoints against a separately-running server and exit.
// Usage:
//   node scripts-debug/verify-phase3.mjs
// Assumes the server is already up at http://localhost:4000.

const BASE = 'http://localhost:4000';

async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json() };
}
async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}
async function del(path, body) {
  const r = await fetch(BASE + path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json() };
}

const log = (label, v) => console.log(`\n=== ${label} ===\n` + JSON.stringify(v, null, 2));

(async () => {
  // 1. health
  log('health', (await get('/api/health')).body);

  // 2. count
  const all = await get('/api/leads');
  console.log(`\n=== /api/leads count === ${all.body.success} ${all.body.data?.length ?? 0}`);

  // 3. one
  const sample = all.body.data?.[0];
  if (sample) {
    log('byId', (await get(`/api/leads/${sample.leadId}`)).body);
  }

  // 4. search
  const s = await get('/api/leads/search?page=1&pageSize=10');
  console.log(`\n=== search === success=${s.body.success} total=${s.body.data?.total} pageSize=${s.body.data?.pageSize} returned=${s.body.data?.data?.length}`);

  // 5. create
  const created = await post('/api/leads', {
    firstName: 'Test', lastName: 'Phase3', dob: '1955-01-01', gender: 'Male',
    phone: '555-0001', email: 't@p.com', zipCode: '10001', state: 'NY', county: 'NY', city: 'NYC',
    leadStatus: 'New Lead', source: 'Web', permissionToContact: true,
    existingCarrier1Member: false, tobaccoUsage: false,
    taggedPharmacies: [], taggedDrugs: [], taggedProviders: [],
    address1: '1 Test St', createdBy: 'test',
  });
  log('create (status ' + created.status + ')', created.body);
  const newId = created.body.data?.leadId;
  if (!newId) {
    console.error('Create failed — bailing'); process.exit(1);
  }

  // 6. tag pharmacies (max 3)
  await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-1', updatedBy: 'test' });
  await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-2', updatedBy: 'test' });
  await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-3', updatedBy: 'test' });
  const fourth = await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-4', updatedBy: 'test' });
  console.log(`\n=== 4th pharmacy (expect 400) === status=${fourth.status} body=${JSON.stringify(fourth.body)}`);

  // 7. login
  const login = await post('/api/auth/login', { username: 'johndoe11', password: 'anything' });
  console.log(`\n=== login === status=${login.status} success=${login.body.success} username=${login.body.data?.user?.username}`);

  // 8. cleanup
  const dl = await del(`/api/leads/${newId}`);
  console.log(`\n=== delete cleanup === status=${dl.status} ${dl.body.message ?? dl.body.error}`);

  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

// Spawn the dev server, wait for /api/health, run smoke checks, kill the server.
import { spawn } from 'node:child_process';

const env = { ...process.env };
const useJson = process.argv.includes('--json');
if (useJson) env.FORCE_JSON = 'true';

// Spawn `npx tsx src/index.ts`. On Windows, `npx.cmd` is required and
// `shell:false` works as long as we point at the .cmd. We use `detached:false`
// so signals propagate. To kill cleanly, we use `taskkill /F /T` on Windows
// (the shell-wrapper trick leaks tsx); on POSIX we just kill the group.
const isWin = process.platform === 'win32';
const child = spawn(
  'npx',
  ['tsx', 'src/index.ts'],
  {
    cwd: new URL('..', import.meta.url),
    shell: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let stdout = '';
let stderr = '';
child.stdout.on('data', (b) => { stdout += b.toString(); });
child.stderr.on('data', (b) => { stderr += b.toString(); });

const BASE = 'http://localhost:4000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHealthy(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) return await r.json();
    } catch {}
    await sleep(300);
  }
  throw new Error('Server never became healthy. Logs:\n' + stdout + '\nERR:\n' + stderr);
}

async function get(p) { const r = await fetch(BASE + p); return { status: r.status, body: await r.json() }; }
async function post(p, b) {
  const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return { status: r.status, body: await r.json() };
}
async function del(p) {
  const r = await fetch(BASE + p, { method: 'DELETE' });
  return { status: r.status, body: await r.json() };
}

(async () => {
  let exitCode = 0;
  try {
    const health = await waitHealthy(20000);
    console.log('=== /api/health ===');
    console.log(JSON.stringify(health, null, 2));

    const all = await get('/api/leads');
    console.log('\n=== /api/leads ===');
    console.log(JSON.stringify({ success: all.body.success, count: all.body.data?.length }));

    const sample = all.body.data?.[0];
    if (sample) {
      const byId = await get(`/api/leads/${sample.leadId}`);
      console.log('\n=== /api/leads/:id (first lead) ===');
      console.log(JSON.stringify({ success: byId.body.success, leadId: byId.body.data?.leadId, firstName: byId.body.data?.firstName }));
    }

    const search = await get('/api/leads/search?page=1&pageSize=10');
    console.log('\n=== /api/leads/search?page=1&pageSize=10 ===');
    console.log(JSON.stringify({
      success: search.body.success,
      total: search.body.data?.total,
      page: search.body.data?.page,
      pageSize: search.body.data?.pageSize,
      totalPages: search.body.data?.totalPages,
      returned: search.body.data?.data?.length,
    }));

    const created = await post('/api/leads', {
      firstName: 'Test', lastName: 'Phase3', dob: '1955-01-01', gender: 'Male',
      phone: '555-0001', email: 't@p.com', zipCode: '10001', state: 'NY', county: 'NY', city: 'NYC',
      leadStatus: 'New Lead', source: 'Web', permissionToContact: true,
      existingCarrier1Member: false, tobaccoUsage: false,
      taggedPharmacies: [], taggedDrugs: [], taggedProviders: [],
      address1: '1 Test St', createdBy: 'test',
    });
    console.log('\n=== POST /api/leads (status ' + created.status + ') ===');
    console.log(JSON.stringify({ success: created.body.success, leadId: created.body.data?.leadId, message: created.body.message }));

    const newId = created.body.data?.leadId;
    if (newId) {
      const t1 = await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-1', updatedBy: 'test' });
      const t2 = await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-2', updatedBy: 'test' });
      const t3 = await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-3', updatedBy: 'test' });
      const t4 = await post(`/api/leads/${newId}/pharmacies`, { pharmacyId: 'PHARM-4', updatedBy: 'test' });
      console.log('\n=== Tag pharmacies 1-3 + 4th (expect 400) ===');
      console.log(JSON.stringify({
        t1: { status: t1.status, success: t1.body.success },
        t2: { status: t2.status, success: t2.body.success },
        t3: { status: t3.status, success: t3.body.success, tagged: t3.body.data?.taggedPharmacies },
        t4: { status: t4.status, success: t4.body.success, error: t4.body.error },
      }));

      const dl = await del(`/api/leads/${newId}`);
      console.log('\n=== DELETE cleanup ===');
      console.log(JSON.stringify({ status: dl.status, success: dl.body.success }));
    }

    const login = await post('/api/auth/login', { username: 'johndoe11', password: 'anything' });
    console.log('\n=== POST /api/auth/login ===');
    console.log(JSON.stringify({ status: login.status, success: login.body.success, username: login.body.data?.user?.username }));

    const badLogin = await post('/api/auth/login', { username: 'nobody-here', password: 'anything' });
    console.log('\n=== POST /api/auth/login (bad creds) ===');
    console.log(JSON.stringify({ status: badLogin.status, success: badLogin.body.success, error: badLogin.body.error }));
  } catch (e) {
    console.error('VERIFY FAILED:', e?.message ?? e);
    exitCode = 1;
  } finally {
    if (isWin) {
      // Recursively kill the spawned tree (npx.cmd → node tsx → ...).
      try {
        const { spawnSync } = await import('node:child_process');
        spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
      } catch {}
    } else {
      child.kill('SIGINT');
      await sleep(500);
      child.kill('SIGKILL');
    }
    await sleep(500);
    process.exit(exitCode);
  }
})();

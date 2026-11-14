'use strict';
/* Run with:  npm test   (uses Node's built-in test runner, no dependencies) */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 3100 + Math.floor(Math.random() * 500);
const BASE = 'http://127.0.0.1:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wanderdesk-test-'));
let child;

const future = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const validBooking = () => ({
  customerName: 'Test Traveller', email: 'test@example.com', phone: '', destination: 'Kyoto, Japan',
  tripType: 'return', departureDate: future(10), returnDate: future(17), adults: 2, children: 1,
  addOns: ['insurance'], paymentStatus: 'deposit', status: 'pending', notes: '', bookedBy: 'Tester'
});
const call = async (method, url, body, role) => {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (role) headers['X-WD-Role'] = role;
  const res = await fetch(BASE + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => null), res };
};

test.before(async () => {
  child = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, DELAY_MS: '0' }, stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server did not start');
});
test.after(() => { child.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); });

test('seeds 40 demo bookings on first run', async () => {
  const { status, data } = await call('GET', '/api/bookings');
  assert.equal(status, 200);
  assert.equal(data.bookings.length, 40);
});

test('rejects an invalid booking with field-level messages', async () => {
  const { status, data } = await call('POST', '/api/bookings', { customerName: '', email: 'nope', adults: 0 });
  assert.equal(status, 400);
  assert.ok(data.errors.customerName && data.errors.email && data.errors.destination && data.errors.adults);
});

test('rejects a return date that is not after departure', async () => {
  const b = validBooking();
  b.returnDate = b.departureDate;
  const { status, data } = await call('POST', '/api/bookings', b);
  assert.equal(status, 400);
  assert.match(data.errors.returnDate, /after the departure date/);
});

test('requires assistance details when special assistance is ticked', async () => {
  const b = validBooking();
  b.addOns = ['assistance'];
  const { status, data } = await call('POST', '/api/bookings', b);
  assert.equal(status, 400);
  assert.ok(data.errors.assistanceDetails);
});

test('create, read, update, delete and restore a booking', async () => {
  const created = await call('POST', '/api/bookings', validBooking());
  assert.equal(created.status, 201);
  const ref = created.data.reference;
  assert.match(ref, /^WD-\d{4}$/);

  const got = await call('GET', '/api/bookings/' + ref);
  assert.equal(got.data.customerName, 'Test Traveller');

  const upd = await call('PUT', '/api/bookings/' + ref, { ...validBooking(), status: 'confirmed', paymentStatus: 'paid' });
  assert.equal(upd.status, 200);
  assert.equal(upd.data.status, 'confirmed');

  // agents may not delete or restore; managers may
  assert.equal((await call('DELETE', '/api/bookings/' + ref, undefined, 'agent')).status, 403);
  assert.equal((await call('DELETE', '/api/bookings/' + ref)).status, 403);
  const del = await call('DELETE', '/api/bookings/' + ref, undefined, 'manager');
  assert.equal(del.status, 200);
  assert.equal((await call('GET', '/api/bookings/' + ref)).status, 404);

  assert.equal((await call('POST', '/api/bookings/restore', { ...upd.data }, 'agent')).status, 403);
  const restored = await call('POST', '/api/bookings/restore', { ...upd.data }, 'manager');
  assert.equal(restored.status, 201);
  assert.equal(restored.data.reference, ref);
  assert.equal((await call('POST', '/api/bookings/restore', { ...upd.data }, 'manager')).status, 409);
});

test('rejects a departure date that is in the past, but accepts today', async () => {
  const past = validBooking();
  past.departureDate = future(-5); past.returnDate = future(2);
  const r1 = await call('POST', '/api/bookings', past);
  assert.equal(r1.status, 400);
  assert.match(r1.data.errors.departureDate, /past/);
  const today = validBooking();
  today.departureDate = future(0); today.returnDate = future(3);
  assert.equal((await call('POST', '/api/bookings', today)).status, 201);
});

test('editing keeps the booked-by agent sent by the client', async () => {
  const created = await call('POST', '/api/bookings', { ...validBooking(), bookedBy: 'Alex Rivera' });
  const upd = await call('PUT', '/api/bookings/' + created.data.reference, { ...validBooking(), bookedBy: 'Alex Rivera', notes: 'changed' });
  assert.equal(upd.data.bookedBy, 'Alex Rivera');
  assert.equal(upd.data.notes, 'changed');
});

test('data persists to the JSON file on disk', async () => {
  const file = JSON.parse(fs.readFileSync(path.join(dataDir, 'bookings.json'), 'utf8'));
  assert.ok(file.bookings.length >= 41);
});

test('stats endpoint summarises the data', async () => {
  const { data } = await call('GET', '/api/stats');
  assert.equal(data.total, data.confirmed + data.pending + data.cancelled);
  assert.ok(data.upcoming.length <= 5);
});

test('static files are served, traversal is blocked, security headers are set', async () => {
  const home = await fetch(BASE + '/');
  assert.equal(home.status, 200);
  assert.ok(home.headers.get('content-security-policy'));
  assert.equal((await fetch(BASE + '/%2e%2e/server/server.js')).status === 200, false);
  assert.equal((await fetch(BASE + '/nope.html')).status, 404);
});

'use strict';
/*
 * WanderDesk back end.
 * - Zero dependencies (Node's built-in http/fs only), so it deploys with no npm install.
 * - Persistence: a single JSON file (data/bookings.json), written atomically.
 * - Serves the static front end from /public and a small JSON API under /api.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { validate } = require('./validate');
const { generate } = require('./seed');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'bookings.json');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// A short artificial delay lets the interface show its loading/saving states.
const DELAY_MS = process.env.DELAY_MS !== undefined ? Number(process.env.DELAY_MS) : 350;
const MAX_BODY = 50 * 1024;

const todayISO = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- storage ---------- */
let db;

function loadDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    db = generate(40, todayISO());
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    return;
  }
  // If the file is corrupt we stop rather than overwrite someone's data.
  db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (!db || !Array.isArray(db.bookings)) throw new Error('data/bookings.json is not in the expected format');
  if (!Number.isInteger(db.nextId)) db.nextId = db.bookings.length + 1;
}

let queue = Promise.resolve();
function persist() {
  const run = queue.then(async () => {
    const tmp = DATA_FILE + '.tmp';
    await fs.promises.writeFile(tmp, JSON.stringify(db, null, 2));
    await fs.promises.rename(tmp, DATA_FILE);
  });
  queue = run.catch(() => {});
  return run;
}

/* ---------- helpers ---------- */
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(text);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Request too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (e) {
        reject(Object.assign(new Error('The request body is not valid JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

const find = (id) => db.bookings.find((b) => b.reference === id);

// Sign-in is simulated, so roles are too: the browser sends the signed-in role in a header.
// This demonstrates "different roles" end to end; it is NOT real security.
const isManager = (req) => req.headers['x-wd-role'] === 'manager';

function stats() {
  const today = todayISO();
  const live = db.bookings.filter((b) => b.status !== 'cancelled');
  const upcoming = live
    .filter((b) => b.departureDate >= today)
    .sort((a, b) => a.departureDate.localeCompare(b.departureDate))
    .slice(0, 5);
  return {
    today,
    total: db.bookings.length,
    confirmed: db.bookings.filter((b) => b.status === 'confirmed').length,
    pending: db.bookings.filter((b) => b.status === 'pending').length,
    cancelled: db.bookings.filter((b) => b.status === 'cancelled').length,
    awaitingPayment: live.filter((b) => b.paymentStatus !== 'paid').length,
    upcoming
  };
}

/* ---------- API ---------- */
async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'bookings', id?]
  const method = req.method;

  if (parts[1] === 'health' && method === 'GET') return sendJson(res, 200, { ok: true });

  if (DELAY_MS > 0) await sleep(DELAY_MS);

  if (parts[1] === 'stats' && method === 'GET') return sendJson(res, 200, stats());

  if (parts[1] !== 'bookings') return sendJson(res, 404, { message: 'Not found.' });

  // /api/bookings
  if (parts.length === 2) {
    if (method === 'GET') return sendJson(res, 200, { bookings: db.bookings });
    if (method === 'POST') {
      const body = await readBody(req);
      const { errors, clean } = validate(body, { checkPast: true });
      if (Object.keys(errors).length) {
        return sendJson(res, 400, { message: 'Some fields need correcting.', errors });
      }
      const now = new Date().toISOString();
      const booking = {
        reference: 'WD-' + String(db.nextId).padStart(4, '0'),
        ...clean,
        createdAt: now,
        updatedAt: now
      };
      db.nextId += 1;
      db.bookings.push(booking);
      await persist();
      return sendJson(res, 201, booking);
    }
    return sendJson(res, 405, { message: 'Method not allowed.' });
  }

  // /api/bookings/restore  (used by the "Undo delete" button, manager only)
  if (parts[2] === 'restore' && parts.length === 3) {
    if (method !== 'POST') return sendJson(res, 405, { message: 'Method not allowed.' });
    if (!isManager(req)) return sendJson(res, 403, { message: 'Only managers can restore bookings.' });
    const body = await readBody(req);
    const ref = typeof body.reference === 'string' ? body.reference : '';
    if (!/^WD-\d{4,}$/.test(ref)) return sendJson(res, 400, { message: 'Invalid booking reference.' });
    if (find(ref)) return sendJson(res, 409, { message: 'That booking already exists.' });
    const { errors, clean } = validate(body, { checkPast: false });
    if (Object.keys(errors).length) return sendJson(res, 400, { message: 'Some fields need correcting.', errors });
    const now = new Date().toISOString();
    const booking = {
      reference: ref,
      ...clean,
      createdAt: typeof body.createdAt === 'string' ? body.createdAt : now,
      updatedAt: now
    };
    db.bookings.push(booking);
    const n = Number(ref.slice(3));
    if (n >= db.nextId) db.nextId = n + 1;
    await persist();
    return sendJson(res, 201, booking);
  }

  // /api/bookings/:id
  if (parts.length === 3) {
    const id = decodeURIComponent(parts[2]);
    const existing = find(id);
    if (!existing) return sendJson(res, 404, { message: 'Booking ' + id + ' was not found. It may have been deleted.' });

    if (method === 'GET') return sendJson(res, 200, existing);

    if (method === 'PUT') {
      const body = await readBody(req);
      const { errors, clean } = validate(body, { checkPast: false });
      if (Object.keys(errors).length) {
        return sendJson(res, 400, { message: 'Some fields need correcting.', errors });
      }
      Object.assign(existing, clean, { updatedAt: new Date().toISOString() });
      await persist();
      return sendJson(res, 200, existing);
    }

    if (method === 'DELETE') {
      if (!isManager(req)) return sendJson(res, 403, { message: 'Only managers can delete bookings.' });
      db.bookings = db.bookings.filter((b) => b.reference !== id);
      await persist();
      return sendJson(res, 200, { deleted: id });
    }
  }
  return sendJson(res, 405, { message: 'Method not allowed.' });
}

/* ---------- static files ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
      return res.end(
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found - WanderDesk</title></head>' +
          '<body><main><h1>Page not found</h1><p><a href="/">Go to the sign-in page</a></p></main></body></html>'
      );
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-cache',
      ...SECURITY_HEADERS
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

/* ---------- server ---------- */
function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      return serveStatic(req, res, url);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error(err);
      if (!res.headersSent) {
        sendJson(res, status, { message: status === 500 ? 'Something went wrong on the server. Please try again.' : err.message });
      }
    }
  });
}

if (require.main === module) {
  loadDb();
  createServer().listen(PORT, HOST, () => {
    console.log('WanderDesk running at http://' + HOST + ':' + PORT);
  });
}

module.exports = { createServer, loadDb };

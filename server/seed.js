'use strict';
/*
 * Generates believable demo bookings so the table has enough rows to test
 * sorting, filtering and pagination. Deterministic (seeded) so tests are stable.
 * Run  `node server/seed.js --force`  to reset the data file.
 */
const fs = require('fs');
const path = require('path');
const { DESTINATIONS, ADDONS } = require('./validate');

const FIRST = ['Aiko', 'Mateo', 'Fatima', 'Liam', 'Priya', 'Omar', 'Sofia', 'Chen', 'Amara', 'Lucas',
  'Nadia', 'Jonas', 'Yara', 'Diego', 'Hana', 'Ibrahim', 'Elena', 'Kofi', 'Mei', 'Tomas'];
const LAST = ['Tanaka', 'Garcia', 'Hassan', 'Murphy', 'Patel', 'Khalil', 'Rossi', 'Wei', 'Okafor', 'Silva',
  'Haddad', 'Berg', 'Mansour', 'Torres', 'Sato', 'Yusuf', 'Petrova', 'Mensah', 'Lin', 'Novak'];
const AGENTS = ['Alex Rivera', 'Morgan Blake'];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function generate(count, today) {
  const rand = rng(20261111);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const bookings = [];
  for (let i = 1; i <= count; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const tripType = rand() < 0.75 ? 'return' : 'one-way';
    const departureDate = addDays(today, Math.floor(rand() * 150) - 20);
    const returnDate = tripType === 'return' ? addDays(departureDate, 3 + Math.floor(rand() * 18)) : '';
    const adults = 1 + Math.floor(rand() * 3);
    const children = rand() < 0.3 ? 1 + Math.floor(rand() * 2) : 0;
    const addOns = ADDONS.filter(() => rand() < 0.3);
    const roll = rand();
    const status = roll < 0.5 ? 'confirmed' : roll < 0.85 ? 'pending' : 'cancelled';
    const pay = rand();
    const paymentStatus = status === 'cancelled' ? 'unpaid' : pay < 0.5 ? 'paid' : pay < 0.8 ? 'deposit' : 'unpaid';
    const created = addDays(today, -Math.floor(rand() * 60)) + 'T09:00:00.000Z';
    bookings.push({
      reference: 'WD-' + String(i).padStart(4, '0'),
      customerName: first + ' ' + last,
      email: (first + '.' + last).toLowerCase() + '@example.com',
      phone: '+44 7700 900' + String(100 + Math.floor(rand() * 899)),
      destination: pick(DESTINATIONS),
      tripType,
      departureDate,
      returnDate,
      adults,
      children,
      addOns,
      assistanceDetails: addOns.includes('assistance') ? 'Wheelchair assistance at the airport.' : '',
      paymentStatus,
      status,
      notes: '',
      bookedBy: pick(AGENTS),
      createdAt: created,
      updatedAt: created
    });
  }
  return { nextId: count + 1, bookings };
}

module.exports = { generate };

if (require.main === module) {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'bookings.json');
  if (fs.existsSync(file) && !process.argv.includes('--force')) {
    console.log('Data file already exists. Use --force to overwrite it.');
    process.exit(0);
  }
  fs.mkdirSync(dir, { recursive: true });
  // optional:  node server/seed.js --force --count 500   (to test the table with many rows)
  const i = process.argv.indexOf('--count');
  const count = i > -1 ? Math.min(5000, Math.max(1, parseInt(process.argv[i + 1], 10) || 40)) : 40;
  fs.writeFileSync(file, JSON.stringify(generate(count, new Date().toISOString().slice(0, 10)), null, 2));
  console.log('Wrote ' + count + ' demo bookings to ' + file);
}

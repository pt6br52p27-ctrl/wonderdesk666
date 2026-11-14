'use strict';
/*
 * Server-side validation for a booking record.
 * The browser validates too (public/js/form.js), but the server never trusts it.
 */

const DESTINATIONS = [
  'Lisbon, Portugal',
  'Kyoto, Japan',
  'Marrakech, Morocco',
  'Reykjavik, Iceland',
  'Cape Town, South Africa',
  'Istanbul, Turkey',
  'Bali, Indonesia',
  'Rome, Italy',
  'Cusco, Peru',
  'Vancouver, Canada',
  'Dubai, UAE',
  'Sydney, Australia'
];
const ADDONS = ['insurance', 'transfer', 'baggage', 'assistance'];
const TRIP_TYPES = ['return', 'one-way'];
const PAYMENT = ['unpaid', 'deposit', 'paid'];
const STATUS = ['pending', 'confirmed', 'cancelled'];

function isIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/* The earliest calendar date that is "today" anywhere on Earth (UTC-12).
   The browser checks against the person's own local date; using this tolerant
   value on the server means a date the browser accepted is never rejected here. */
function todayISO() {
  return new Date(Date.now() - 12 * 3600 * 1000).toISOString().slice(0, 10);
}

/**
 * @param {object} input   raw request body
 * @param {object} [opts]  { checkPast: boolean, today: 'YYYY-MM-DD' }
 * @returns {{errors: object, clean: object}}
 */
function validate(input, opts) {
  const o = opts || {};
  const today = o.today || todayISO();
  const b = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const clean = {};

  clean.customerName = str(b.customerName);
  if (!clean.customerName) errors.customerName = "Enter the customer's full name.";
  else if (clean.customerName.length < 2) errors.customerName = 'The name must be at least 2 characters.';
  else if (clean.customerName.length > 80) errors.customerName = 'The name must be 80 characters or fewer.';

  clean.email = str(b.email);
  if (!clean.email) errors.email = 'Enter an email address, for example name@example.com.';
  else if (clean.email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
    errors.email = 'Enter a valid email address, for example name@example.com.';
  }

  clean.phone = str(b.phone);
  if (clean.phone && !/^\+?[\d\s()-]{7,20}$/.test(clean.phone)) {
    errors.phone = 'Enter a phone number using digits, spaces, brackets or hyphens (7 to 20 characters). You can leave it blank.';
  }

  clean.destination = str(b.destination);
  if (!DESTINATIONS.includes(clean.destination)) errors.destination = 'Choose a destination from the list.';

  clean.tripType = str(b.tripType);
  if (!TRIP_TYPES.includes(clean.tripType)) errors.tripType = 'Choose return or one way.';

  clean.departureDate = str(b.departureDate);
  if (!isIsoDate(clean.departureDate)) errors.departureDate = 'Enter the departure date.';
  else if (o.checkPast && clean.departureDate < today) {
    errors.departureDate = 'The departure date cannot be in the past. Choose today or a later date.';
  }

  clean.returnDate = '';
  if (clean.tripType === 'return') {
    const r = str(b.returnDate);
    if (!isIsoDate(r)) errors.returnDate = 'Enter the return date, or choose "One way" if there is no return.';
    else if (isIsoDate(clean.departureDate) && r <= clean.departureDate) {
      errors.returnDate = 'The return date must be after the departure date.';
    } else clean.returnDate = r;
  }

  clean.adults = Number(b.adults);
  if (!Number.isInteger(clean.adults) || clean.adults < 1 || clean.adults > 9) {
    errors.adults = 'Enter the number of adults (1 to 9).';
  }
  clean.children = b.children === '' || b.children == null ? 0 : Number(b.children);
  if (!Number.isInteger(clean.children) || clean.children < 0 || clean.children > 9) {
    errors.children = 'Enter the number of children (0 to 9).';
  } else if (!errors.adults && clean.adults + clean.children > 9) {
    errors.children = 'A booking can have at most 9 travellers in total. Reduce adults or children.';
  }

  const addOns = Array.isArray(b.addOns) ? b.addOns : [];
  clean.addOns = ADDONS.filter((a) => addOns.includes(a));

  clean.assistanceDetails = '';
  if (clean.addOns.includes('assistance')) {
    const d = str(b.assistanceDetails);
    if (!d) errors.assistanceDetails = 'Describe the assistance needed so the airline can be told.';
    else if (d.length > 300) errors.assistanceDetails = 'Keep the assistance details to 300 characters or fewer.';
    else clean.assistanceDetails = d;
  }

  clean.paymentStatus = str(b.paymentStatus) || 'unpaid';
  if (!PAYMENT.includes(clean.paymentStatus)) errors.paymentStatus = 'Choose a payment status from the list.';

  clean.status = str(b.status) || 'pending';
  if (!STATUS.includes(clean.status)) errors.status = 'Choose a booking status from the list.';

  clean.notes = str(b.notes);
  if (clean.notes.length > 500) errors.notes = 'Keep the notes to 500 characters or fewer.';

  clean.bookedBy = str(b.bookedBy).slice(0, 60) || 'Unknown';

  return { errors, clean };
}

module.exports = { validate, isIsoDate, DESTINATIONS, ADDONS, TRIP_TYPES, PAYMENT, STATUS };

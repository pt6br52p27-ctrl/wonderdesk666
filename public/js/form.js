'use strict';
/*
 * Task 3 - Booking form (create + edit).
 * Accessibility notes:
 *  - every control has a <label>; hints and errors are linked with aria-describedby
 *  - errors appear inline AND in a focusable summary with links to each field
 *  - dynamic fields (return date, assistance details) are announced when they appear
 *  - "Save and add another" supports fast repeated entry
 */
(function () {
  var session = WD.requireAuth();
  if (!session) return;
  WD.initChrome(session);

  var $ = function (id) { return document.getElementById(id); };
  var form = $('booking-form');
  var editId = new URLSearchParams(location.search).get('id');
  var today = WD.todayISO();
  var busy = false;
  var touched = {};
  var originalBookedBy = '';
  var dirty = false;   // unsaved changes? (error prevention: warn before leaving)

  var FIELDS = ['customerName', 'email', 'phone', 'destination', 'departureDate', 'returnDate',
    'adults', 'children', 'assistanceDetails', 'notes'];

  var val = function (id) { return $(id).value; };
  var tripType = function () { return form.elements.tripType.value; };
  var checkedAddOns = function () {
    return Array.prototype.slice.call(form.querySelectorAll('input[name="addOns"]:checked'))
      .map(function (i) { return i.value; });
  };

  /* ---------- validation rules (messages say what is wrong AND how to fix it) ---------- */
  var validators = {
    customerName: function () {
      var v = val('customerName').trim();
      if (!v) return "Enter the customer's full name.";
      if (v.length < 2) return 'The name must be at least 2 characters.';
      if (v.length > 80) return 'The name must be 80 characters or fewer.';
      return '';
    },
    email: function () {
      var v = val('email').trim();
      if (!v) return 'Enter an email address, for example name@example.com.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address, for example name@example.com.';
      return '';
    },
    phone: function () {
      var v = val('phone').trim();
      if (v && !/^\+?[\d\s()-]{7,20}$/.test(v)) {
        return 'Enter a phone number using digits, spaces, brackets or hyphens (7 to 20 characters). You can leave it blank.';
      }
      return '';
    },
    destination: function () { return val('destination') ? '' : 'Choose a destination from the list.'; },
    departureDate: function () {
      var v = val('departureDate');
      if (!v) return 'Enter the departure date.';
      if (!editId && v < today) return 'The departure date cannot be in the past. Choose today or a later date.';
      return '';
    },
    returnDate: function () {
      if (tripType() !== 'return') return '';
      var v = val('returnDate');
      if (!v) return 'Enter the return date, or choose "One way" if there is no return.';
      var d = val('departureDate');
      if (d && v <= d) return 'The return date must be after the departure date.';
      return '';
    },
    adults: function () {
      var n = Number(val('adults'));
      if (val('adults') === '' || !Number.isInteger(n) || n < 1 || n > 9) return 'Enter the number of adults (1 to 9).';
      return '';
    },
    children: function () {
      var raw = val('children');
      var n = raw === '' ? 0 : Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 9) return 'Enter the number of children (0 to 9).';
      if (!validators.adults() && Number(val('adults')) + n > 9) {
        return 'A booking can have at most 9 travellers in total. Reduce adults or children.';
      }
      return '';
    },
    assistanceDetails: function () {
      if (!$('addon-assistance').checked) return '';
      var v = val('assistanceDetails').trim();
      if (!v) return 'Describe the assistance needed so the airline can be told.';
      if (v.length > 300) return 'Keep the assistance details to 300 characters or fewer.';
      return '';
    },
    notes: function () {
      return val('notes').trim().length > 500 ? 'Keep the notes to 500 characters or fewer.' : '';
    }
  };

  function setError(id, msg) {
    var input = $(id), err = $(id + '-error');
    if (!err) return;
    if (msg) {
      err.replaceChildren(WD.h('span', { class: 'sr-only', text: 'Error: ' }), document.createTextNode(msg));
      err.hidden = false;
      input.setAttribute('aria-invalid', 'true');
    } else {
      err.textContent = '';
      err.hidden = true;
      input.removeAttribute('aria-invalid');
    }
  }
  function validateField(id) {
    var msg = validators[id]();
    setError(id, msg);
    return msg;
  }
  function validateAll() {
    var errs = [];
    FIELDS.forEach(function (id) {
      touched[id] = true; // after a submit attempt, errors clear live as the person fixes them
      var msg = validateField(id);
      if (msg) errs.push({ id: id, msg: msg });
    });
    return errs;
  }

  function showSummary(errs) {
    var list = $('error-summary-list');
    list.replaceChildren();
    errs.forEach(function (e) {
      list.appendChild(WD.h('li', null, WD.h('a', {
        href: '#' + e.id, text: e.msg,
        onclick: function (ev) { ev.preventDefault(); $(e.id).focus(); }
      })));
    });
    $('error-summary-count').textContent = errs.length === 1
      ? '1 field needs your attention:'
      : errs.length + ' fields need your attention:';
    var box = $('error-summary');
    box.hidden = false;
    box.focus();
  }
  function hideSummary() { $('error-summary').hidden = true; }

  /* ---------- dynamic fields ---------- */
  function syncReturn(announce) {
    var isReturn = tripType() === 'return';
    $('return-group').hidden = !isReturn;
    $('returnDate').disabled = !isReturn;
    if (!isReturn) setError('returnDate', '');
    if (announce) WD.announce(isReturn ? 'Return date field added below.' : 'Return date field removed.');
  }
  function syncAssistance(announce) {
    var on = $('addon-assistance').checked;
    $('assistance-group').hidden = !on;
    $('assistanceDetails').disabled = !on;
    if (!on) setError('assistanceDetails', '');
    if (announce) WD.announce(on ? 'Assistance details field added below.' : 'Assistance details field removed.');
  }
  function syncTotal() {
    var a = Number(val('adults')) || 0;
    var c = Number(val('children')) || 0;
    var n = a + c;
    $('total-travellers').textContent = n + (n === 1 ? ' traveller' : ' travellers');
  }
  function syncDateLimits() {
    if (!editId) $('departureDate').min = today;
    var d = val('departureDate');
    if (d) $('returnDate').min = d;
  }

  /* ---------- wiring ---------- */
  FIELDS.forEach(function (id) {
    var el = $(id);
    // Skip blur-validation when focus is moving to a button: the error text appearing or
    // disappearing would shift the button between mouse-down and mouse-up and lose the
    // click. Submit validates everything anyway.
    el.addEventListener('blur', function (e) {
      touched[id] = true;
      if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.btn-row')) return;
      validateField(id);
    });
    // once a field has shown an error, re-check as the person types so the error clears promptly
    el.addEventListener('input', function () { if (touched[id]) validateField(id); });
    el.addEventListener('change', function () { if (touched[id]) validateField(id); });
  });
  Array.prototype.forEach.call(form.elements.tripType, function (r) {
    r.addEventListener('change', function () { syncReturn(true); });
  });
  $('addon-assistance').addEventListener('change', function () { syncAssistance(true); });
  $('departureDate').addEventListener('change', function () {
    syncDateLimits();
    if (touched.returnDate) validateField('returnDate');
  });
  ['adults', 'children'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      syncTotal();
      if (touched.children) validateField('children');
    });
  });

  /* ---------- saving ---------- */
  function setBusy(on, btn) {
    busy = on;
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    [$('save-btn'), $('another-btn')].forEach(function (b) {
      b.setAttribute('aria-disabled', on ? 'true' : 'false');
      b.querySelector('.spinner').hidden = true;
    });
    if (on) {
      btn.querySelector('.spinner').hidden = false;
      WD.announce('Saving booking, please wait.');
    }
    $('save-btn').querySelector('.btn-text').textContent = on && btn === $('save-btn') ? 'Saving…' : 'Save booking';
    $('another-btn').querySelector('.btn-text').textContent = on && btn === $('another-btn') ? 'Saving…' : 'Save and add another';
  }

  function payload() {
    var isReturn = tripType() === 'return';
    var assist = checkedAddOns().indexOf('assistance') !== -1;
    return {
      customerName: val('customerName').trim(),
      email: val('email').trim(),
      phone: val('phone').trim(),
      destination: val('destination'),
      tripType: tripType(),
      departureDate: val('departureDate'),
      returnDate: isReturn ? val('returnDate') : '',
      adults: Number(val('adults')),
      children: val('children') === '' ? 0 : Number(val('children')),
      addOns: checkedAddOns(),
      assistanceDetails: assist ? val('assistanceDetails').trim() : '',
      paymentStatus: val('paymentStatus'),
      status: val('status'),
      notes: val('notes').trim(),
      // when editing, keep the original agent; only new bookings are stamped with the current user
      bookedBy: editId && originalBookedBy ? originalBookedBy : session.name
    };
  }

  function resetForNext() {
    form.reset();
    touched = {};
    FIELDS.forEach(function (id) { setError(id, ''); });
    syncReturn(false); syncAssistance(false); syncTotal(); syncDateLimits();
    hideSummary();
    dirty = false;
  }

  function save(mode, btn) {
    if (busy) return;
    var errs = validateAll();
    if (errs.length) { showSummary(errs); return; }
    hideSummary();
    WD.clearNotice();
    setBusy(true, btn);

    var request = editId
      ? WD.api('/bookings/' + encodeURIComponent(editId), { method: 'PUT', body: payload() })
      : WD.api('/bookings', { method: 'POST', body: payload() });

    request.then(function (saved) {
      dirty = false;
      var verb = editId ? 'updated' : 'created';
      if (mode === 'another') {
        setBusy(false);
        resetForNext();
        WD.showNotice('success', 'Booking ' + saved.reference + ' for ' + saved.customerName + ' was ' + verb + '. The form is ready for the next booking.');
        $('customerName').focus();
      } else {
        WD.announce('Booking ' + saved.reference + ' saved. Opening the bookings list.');
        location.href = 'bookings.html?saved=' + encodeURIComponent(saved.reference) + '&mode=' + verb;
      }
    }).catch(function (err) {
      setBusy(false);
      var fieldErrors = err.data && err.data.errors;
      if (err.status === 400 && fieldErrors) {
        var list = [];
        Object.keys(fieldErrors).forEach(function (k) {
          if (FIELDS.indexOf(k) !== -1) { setError(k, fieldErrors[k]); list.push({ id: k, msg: fieldErrors[k] }); }
          else list.push({ id: FIELDS.filter(function (f) { return $(f).offsetParent !== null; })[0], msg: fieldErrors[k] });
        });
        showSummary(list);
      } else if (err.status === 404) {
        WD.showNotice('error', err.message);
      } else {
        WD.showNotice('error', 'The booking was not saved. ' + err.message);
      }
    });
  }

  /* Warn before losing typed data (Nielsen: error prevention). The browser shows its own
     standard "Leave site?" prompt; it is not shown after a successful save. */
  form.addEventListener('input', function () { dirty = true; });
  form.addEventListener('change', function () { dirty = true; });
  window.addEventListener('beforeunload', function (e) {
    if (dirty && !busy) { e.preventDefault(); e.returnValue = ''; }
  });

  form.addEventListener('submit', function (e) { e.preventDefault(); save('save', $('save-btn')); });
  $('another-btn').addEventListener('click', function () { save('another', $('another-btn')); });

  /* ---------- edit mode: load the record ---------- */
  function fill(b) {
    $('customerName').value = b.customerName;
    $('email').value = b.email;
    $('phone').value = b.phone || '';
    $('destination').value = b.destination;
    (b.tripType === 'one-way' ? $('trip-oneway') : $('trip-return')).checked = true;
    $('departureDate').value = b.departureDate;
    $('returnDate').value = b.returnDate || '';
    $('adults').value = b.adults;
    $('children').value = b.children;
    Array.prototype.forEach.call(form.querySelectorAll('input[name="addOns"]'), function (i) {
      i.checked = b.addOns.indexOf(i.value) !== -1;
    });
    $('assistanceDetails').value = b.assistanceDetails || '';
    $('paymentStatus').value = b.paymentStatus;
    $('status').value = b.status;
    $('notes').value = b.notes || '';
  }

  $('booked-by').textContent = session.name;
  syncReturn(false); syncAssistance(false); syncTotal(); syncDateLimits();

  if (editId) {
    document.title = 'Edit booking – WanderDesk';
    $('page-title').textContent = 'Edit booking ' + editId;
    $('nav-new').removeAttribute('aria-current');
    $('another-btn').hidden = true;
    $('save-btn').querySelector('.btn-text').textContent = 'Save changes';
    form.hidden = true;
    $('form-loading').hidden = false;
    WD.announce('Loading booking ' + editId + '.');
    WD.api('/bookings/' + encodeURIComponent(editId)).then(function (b) {
      fill(b);
      syncReturn(false); syncAssistance(false); syncTotal(); syncDateLimits();
      originalBookedBy = b.bookedBy;
      $('booked-by').textContent = b.bookedBy;
      dirty = false;
      $('form-loading').hidden = true;
      form.hidden = false;
      WD.announce('Booking ' + editId + ' loaded.');
    }).catch(function (err) {
      $('form-loading').hidden = true;
      $('load-error-text').textContent = err.message;
      $('load-error').hidden = false;
      WD.announce('Could not open booking. ' + err.message);
    });
  }
})();

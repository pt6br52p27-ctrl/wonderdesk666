'use strict';
/*
 * Task 4 - Bookings list: search, filter, sort, paginate.
 * Accessibility notes:
 *  - sortable headers are real <button>s inside <th aria-sort>
 *  - the result count is a polite live region ("Showing 1-10 of 42 ...")
 *  - empty, loading and error states each have their own message
 *  - delete uses a native <dialog> (focus trap + Esc) and offers Undo afterwards
 *  - paging buttons use aria-disabled so keyboard focus is never lost
 */
(function () {
  var session = WD.requireAuth();
  if (!session) return;
  WD.initChrome(session);

  var $ = function (id) { return document.getElementById(id); };
  var STORE = 'wanderdesk.bookings.view';
  var COLUMN_LABEL = {
    reference: 'Reference', customerName: 'Customer', destination: 'Destination', departureDate: 'Departure date',
    travellers: 'Travellers', paymentStatus: 'Payment', status: 'Status'
  };
  var STATUS_ORDER = { pending: 0, confirmed: 1, cancelled: 2 };
  var PAYMENT_ORDER = { unpaid: 0, deposit: 1, paid: 2 };

  var state = { all: [], q: '', status: '', payment: '', dest: '', sort: 'departureDate', dir: 'asc', page: 1, size: 10 };
  var loaded = false;
  var pendingDelete = null;

  /* ---------- remember the view (recognition over recall) ---------- */
  function saveView() {
    try { sessionStorage.setItem(STORE, JSON.stringify({ q: state.q, status: state.status, payment: state.payment, dest: state.dest, sort: state.sort, dir: state.dir, size: state.size })); } catch (e) { /* ignore */ }
  }
  function restoreView() {
    try {
      var v = JSON.parse(sessionStorage.getItem(STORE));
      if (v) Object.keys(v).forEach(function (k) { if (k in state) state[k] = v[k]; });
    } catch (e) { /* ignore */ }
    // links from the dashboard override the remembered filters
    var p = new URLSearchParams(location.search);
    ['status', 'payment'].forEach(function (k) { if (p.has(k)) state[k] = p.get(k); });
    if (p.has('status') || p.has('payment')) { state.q = ''; state.dest = ''; }
  }
  function syncControls() {
    $('q').value = state.q;
    $('f-status').value = state.status;
    $('f-payment').value = state.payment;
    $('f-dest').value = state.dest;
    $('f-size').value = String(state.size);
    if ($('f-size').value !== String(state.size)) { state.size = 10; $('f-size').value = '10'; }
  }

  /* ---------- filtering and sorting ---------- */
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    var rows = state.all.filter(function (b) {
      if (state.status && b.status !== state.status) return false;
      if (state.payment && b.paymentStatus !== state.payment) return false;
      if (state.dest && b.destination !== state.dest) return false;
      if (q) {
        var hay = (b.reference + ' ' + b.customerName + ' ' + b.email + ' ' + b.destination).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var dir = state.dir === 'asc' ? 1 : -1;
    var key = state.sort;
    rows.sort(function (a, b) {
      var r;
      if (key === 'travellers') r = (a.adults + a.children) - (b.adults + b.children);
      else if (key === 'status') r = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      else if (key === 'paymentStatus') r = PAYMENT_ORDER[a.paymentStatus] - PAYMENT_ORDER[b.paymentStatus];
      else r = String(a[key]).localeCompare(String(b[key]), undefined, { numeric: true, sensitivity: 'base' });
      if (r === 0) r = a.reference.localeCompare(b.reference, undefined, { numeric: true });
      return r * dir;
    });
    return rows;
  }

  /* ---------- rendering ---------- */
  function rowFor(b) {
    var travellers = b.adults + b.children;
    var who = b.reference + ' for ' + b.customerName;
    var actions = WD.h('div', { class: 'row-actions' },
      WD.h('a', { class: 'btn btn-secondary btn-small', href: 'booking-form.html?id=' + encodeURIComponent(b.reference) },
        'Edit', WD.h('span', { class: 'sr-only', text: ' booking ' + who }))
    );
    if (session.role === 'manager') {
      actions.appendChild(WD.h('button', {
        type: 'button', class: 'btn btn-danger btn-small',
        onclick: function (e) { askDelete(b, e.currentTarget); }
      }, 'Delete', WD.h('span', { class: 'sr-only', text: ' booking ' + who })));
    }
    return WD.h('tr', null,
      WD.h('th', { scope: 'row', text: b.reference }),
      WD.h('td', { 'data-label': 'Customer', text: b.customerName }),
      WD.h('td', { 'data-label': 'Destination', text: b.destination }),
      WD.h('td', { 'data-label': 'Departs', text: WD.formatDate(b.departureDate) }),
      WD.h('td', { 'data-label': 'Travellers', text: String(travellers) }),
      WD.h('td', { 'data-label': 'Payment' }, WD.badge('payment', b.paymentStatus)),
      WD.h('td', { 'data-label': 'Status' }, WD.badge('status', b.status)),
      WD.h('td', { 'data-label': 'Actions' }, actions)
    );
  }

  function render(options) {
    var opts = options || {};
    var rows = visibleRows();
    var total = rows.length;
    var pages = Math.max(1, Math.ceil(total / state.size));
    if (state.page > pages) state.page = pages;
    var start = (state.page - 1) * state.size;
    var slice = rows.slice(start, start + state.size);
    var filtered = !!(state.q.trim() || state.status || state.payment || state.dest);

    // sort state on headers
    Array.prototype.forEach.call(document.querySelectorAll('#table thead th'), function (th) {
      var btn = th.querySelector('.sort-btn');
      if (!btn) return;
      th.setAttribute('aria-sort', btn.dataset.sort === state.sort ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none');
    });

    var tbody = $('tbody');
    tbody.replaceChildren();
    slice.forEach(function (b) { tbody.appendChild(rowFor(b)); });

    var hasRows = total > 0;
    $('table-wrap').hidden = !hasRows;
    $('pagination').hidden = !hasRows || pages === 1 && total <= state.size;
    $('empty').hidden = hasRows;

    if (!hasRows) {
      if (filtered) {
        $('empty-title').textContent = 'No bookings match your search';
        $('empty-text').textContent = 'Try a different search word, or clear the filters to see all ' + state.all.length + ' bookings.';
        $('empty-add').hidden = true;
        $('empty-clear').hidden = false;
      } else {
        $('empty-title').textContent = 'No bookings yet';
        $('empty-text').textContent = 'When you add a booking it will appear here.';
        $('empty-add').hidden = false;
        $('empty-clear').hidden = true;
      }
    }

    // status line (live region)
    var msg;
    if (!hasRows) {
      msg = filtered ? 'No bookings match. 0 of ' + state.all.length + ' shown.' : 'No bookings to show.';
    } else {
      msg = 'Showing ' + (start + 1) + ' to ' + (start + slice.length) + ' of ' + total + (total === 1 ? ' booking' : ' bookings');
      if (filtered) msg += ' (filtered from ' + state.all.length + ')';
      msg += '. Sorted by ' + COLUMN_LABEL[state.sort] + ', ' + (state.dir === 'asc' ? 'ascending' : 'descending') + '.';
    }
    $('result-count').textContent = msg;

    $('page-info').textContent = 'Page ' + state.page + ' of ' + pages;
    $('prev').setAttribute('aria-disabled', state.page <= 1 ? 'true' : 'false');
    $('next').setAttribute('aria-disabled', state.page >= pages ? 'true' : 'false');

    if (opts.scroll) $('results-heading').scrollIntoView({ block: 'start' });
  }

  /* ---------- loading ---------- */
  function load() {
    loaded = false;
    $('loading').hidden = false;
    $('load-error').hidden = true;
    $('table-wrap').hidden = true;
    $('empty').hidden = true;
    $('pagination').hidden = true;
    $('result-count').textContent = 'Loading bookings…';
    WD.api('/bookings').then(function (data) {
      state.all = data.bookings;
      loaded = true;
      $('loading').hidden = true;
      render();
      showSavedNotice();
    }).catch(function (err) {
      $('loading').hidden = true;
      $('result-count').textContent = 'Bookings could not be loaded.';
      $('load-error-text').textContent = err.message;
      $('load-error').hidden = false;
      WD.announce('Bookings could not be loaded. ' + err.message);
    });
  }

  function showSavedNotice() {
    var p = new URLSearchParams(location.search);
    var ref = p.get('saved');
    if (!ref) return;
    WD.showNotice('success', 'Booking ' + ref + ' was ' + (p.get('mode') === 'updated' ? 'updated' : 'created') + ' and saved.');
    history.replaceState(null, '', 'bookings.html'); // so a refresh doesn't repeat the message
  }

  /* ---------- delete with confirmation + undo ---------- */
  var dialog = $('confirm-dialog');

  function askDelete(b, trigger) {
    pendingDelete = { booking: b, trigger: trigger };
    $('dlg-text').textContent = 'This removes ' + b.reference + ' for ' + b.customerName + ' (' + b.destination + ', departing ' +
      WD.formatDate(b.departureDate) + '). You will be able to undo it straight afterwards.';
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else if (window.confirm($('dlg-text').textContent)) doDelete();
  }

  function doDelete() {
    var b = pendingDelete && pendingDelete.booking;
    if (!b) return;
    pendingDelete = null;
    WD.announce('Deleting booking ' + b.reference + '.');
    WD.api('/bookings/' + encodeURIComponent(b.reference), { method: 'DELETE' }).then(function () {
      state.all = state.all.filter(function (x) { return x.reference !== b.reference; });
      render();
      WD.showNotice('success', 'Booking ' + b.reference + ' for ' + b.customerName + ' was deleted.', {
        label: 'Undo delete', handler: function () { undo(b); }
      });
      $('results-heading').focus();
    }).catch(function (err) {
      if (err.status === 404) { // someone else already removed it
        state.all = state.all.filter(function (x) { return x.reference !== b.reference; });
        render();
      }
      WD.showNotice('error', 'The booking was not deleted. ' + err.message);
    });
  }

  function undo(b) {
    WD.announce('Restoring booking ' + b.reference + '.');
    WD.api('/bookings/restore', { method: 'POST', body: b }).then(function (restored) {
      state.all.push(restored);
      render();
      WD.showNotice('success', 'Booking ' + restored.reference + ' was restored.');
      $('results-heading').focus();
    }).catch(function (err) {
      WD.showNotice('error', 'The booking could not be restored. ' + err.message);
    });
  }

  $('dlg-keep').addEventListener('click', function () { pendingDelete = null; dialog.close(); });
  $('dlg-delete').addEventListener('click', function () { dialog.close(); doDelete(); });
  dialog.addEventListener('cancel', function () { pendingDelete = null; }); // Esc key

  /* ---------- controls ---------- */
  var timer;
  $('q').addEventListener('input', function () {
    clearTimeout(timer);
    var v = this.value;
    timer = setTimeout(function () { state.q = v; state.page = 1; saveView(); if (loaded) render(); }, 250);
  });
  [['f-status', 'status'], ['f-payment', 'payment'], ['f-dest', 'dest']].forEach(function (pair) {
    $(pair[0]).addEventListener('change', function () { state[pair[1]] = this.value; state.page = 1; saveView(); if (loaded) render(); });
  });
  $('f-size').addEventListener('change', function () { state.size = Number(this.value); state.page = 1; saveView(); if (loaded) render(); });
  $('filters').addEventListener('submit', function (e) { e.preventDefault(); });

  function clearFilters() {
    state.q = ''; state.status = ''; state.payment = ''; state.dest = ''; state.page = 1;
    syncControls(); saveView(); render();
    $('q').focus();
  }
  $('clear').addEventListener('click', clearFilters);
  $('empty-clear').addEventListener('click', clearFilters);

  Array.prototype.forEach.call(document.querySelectorAll('.sort-btn'), function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.sort;
      if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
      else { state.sort = key; state.dir = 'asc'; }
      state.page = 1;
      saveView();
      if (loaded) render();
    });
  });

  $('prev').addEventListener('click', function () { if (this.getAttribute('aria-disabled') === 'true') return; state.page -= 1; render({ scroll: true }); });
  $('next').addEventListener('click', function () { if (this.getAttribute('aria-disabled') === 'true') return; state.page += 1; render({ scroll: true }); });
  $('retry').addEventListener('click', load);

  restoreView();
  syncControls();
  load();
})();

'use strict';
/* Task 2 - Dashboard: orientation, summary numbers, next departures. */
(function () {
  var session = WD.requireAuth();
  if (!session) return;
  WD.initChrome(session);

  var $ = function (id) { return document.getElementById(id); };
  var hour = new Date().getHours();
  var greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  $('welcome').textContent = greeting + ', ' + session.name.split(' ')[0] + '. Here is where the desk stands today.';
  if (session.role === 'manager') $('manager-panel').hidden = false;

  function render(s) {
    $('s-total').textContent = s.total;
    $('s-confirmed').textContent = s.confirmed;
    $('s-pending').textContent = s.pending;
    $('s-unpaid').textContent = s.awaitingPayment;
    $('cancelled-note').textContent = s.cancelled + (s.cancelled === 1 ? ' booking is' : ' bookings are') + ' currently cancelled.';

    var list = $('upcoming');
    list.replaceChildren();
    $('upcoming-empty').hidden = s.upcoming.length > 0;
    s.upcoming.forEach(function (b) {
      var travellers = b.adults + b.children;
      list.appendChild(WD.h('li', null,
        WD.h('a', {
          href: 'booking-form.html?id=' + encodeURIComponent(b.reference),
          text: b.customerName + ' to ' + b.destination
        }),
        WD.h('span', { class: 'meta', text: 'Departs ' + WD.formatDate(b.departureDate) + ' (' + WD.relativeDays(b.departureDate) + ') · ' +
          travellers + (travellers === 1 ? ' traveller' : ' travellers') + ' · ' + b.reference })
      ));
    });
  }

  function load() {
    $('dash-loading').hidden = false;
    $('dash-error').hidden = true;
    $('dash-content').hidden = true;
    WD.announce('Loading summary.');
    WD.api('/stats').then(function (s) {
      render(s);
      $('dash-loading').hidden = true;
      $('dash-content').hidden = false;
      WD.announce('Summary loaded. ' + s.total + ' bookings, ' + s.pending + ' pending.');
    }).catch(function (err) {
      $('dash-loading').hidden = true;
      $('dash-error-text').textContent = err.message;
      $('dash-error').hidden = false;
      WD.announce('Could not load the summary. ' + err.message);
    });
  }

  $('dash-retry').addEventListener('click', load);
  load();
})();

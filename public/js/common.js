'use strict';
/*
 * Shared helpers for every page: session handling (simulated), accessible
 * status announcements, a small DOM builder and the fetch wrapper.
 * Exposed as the single global `WD`.
 */
(function () {
  var KEY = 'wanderdesk.session';
  var WD = {};

  /* Simulated accounts - the brief says real authentication is not required. */
  WD.USERS = {
    agent: { password: 'agent123', role: 'agent', label: 'Travel agent', name: 'Alex Rivera' },
    manager: { password: 'manager123', role: 'manager', label: 'Manager', name: 'Morgan Blake' }
  };

  WD.STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed', cancelled: 'Cancelled' };
  WD.STATUS_ICON = { pending: '…', confirmed: '✓', cancelled: '✕' };
  WD.PAYMENT_LABEL = { unpaid: 'Unpaid', deposit: 'Deposit paid', paid: 'Paid in full' };
  WD.PAYMENT_ICON = { unpaid: '✕', deposit: '…', paid: '✓' };

  /* ---------- session ---------- */
  WD.getSession = function () {
    try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; }
  };
  WD.setSession = function (s) {
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
  };
  WD.clearSession = function () {
    try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  };
  WD.requireAuth = function () {
    var s = WD.getSession();
    if (!s) {
      location.replace('index.html?reason=signin');
      return null;
    }
    return s;
  };

  /* Fill the header's user name and wire up the sign-out button. */
  WD.initChrome = function (session) {
    var name = document.getElementById('user-name');
    if (name) name.textContent = session.name + ' (' + session.label + ')';
    var out = document.getElementById('signout');
    if (out) {
      out.addEventListener('click', function () {
        WD.clearSession();
        location.href = 'index.html?reason=signedout';
      });
    }
  };

  /* ---------- DOM builder (uses textContent, never innerHTML) ---------- */
  WD.h = function (tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === false || v == null) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  };

  /* ---------- screen-reader announcements ---------- */
  /* Clearing first, then writing after a tick, makes repeated identical
     messages announce again. */
  WD.announce = function (msg) {
    var r = document.getElementById('live-polite');
    if (!r) return;
    r.textContent = '';
    setTimeout(function () { r.textContent = msg; }, 60);
  };

  /* Visible notices. Errors go in the role="alert" region, everything else in
     the role="status" region. Both exist in the HTML at page load, which is
     what makes the announcements reliable. No auto-dismiss (WCAG 2.2.1). */
  WD.clearNotice = function () {
    var a = document.getElementById('notice');
    var b = document.getElementById('notice-alert');
    if (a) a.textContent = '';
    if (b) b.textContent = '';
  };
  WD.showNotice = function (type, message, action) {
    WD.clearNotice();
    var icon = { success: '✓', error: '⚠︎', info: 'i' }[type] || 'i';
    var box = document.getElementById(type === 'error' ? 'notice-alert' : 'notice');
    if (!box) return null;
    var el = WD.h('div', { class: 'notice notice-' + type },
      WD.h('span', { class: 'notice-icon', 'aria-hidden': 'true', text: icon }),
      WD.h('p', { text: message })
    );
    if (action) {
      el.appendChild(WD.h('button', { type: 'button', class: 'btn btn-secondary btn-small', text: action.label, onclick: action.handler }));
    }
    el.appendChild(WD.h('button', {
      type: 'button', class: 'btn btn-secondary btn-small', text: 'Dismiss',
      onclick: function () { var f = document.getElementById('main'); WD.clearNotice(); if (f) f.focus(); }
    }));
    box.appendChild(el);
    return el;
  };

  /* ---------- API ---------- */
  WD.api = function (path, options) {
    var o = options || {};
    var init = { method: o.method || 'GET', headers: {} };
    // Simulated role check: the server refuses manager-only actions without this header.
    var s = WD.getSession();
    if (s && s.role) init.headers['X-WD-Role'] = s.role;
    if (o.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(o.body);
    }
    return fetch('/api' + path, init).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data && data.message) || 'The request failed (code ' + res.status + ').');
          err.status = res.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    }, function () {
      var err = new Error('Cannot reach the server. Check your connection and try again.');
      err.status = 0;
      throw err;
    });
  };

  /* ---------- formatting ---------- */
  WD.todayISO = function () {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  };
  WD.formatDate = function (iso) {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(iso + 'T00:00:00Z'));
  };
  WD.daysUntil = function (iso) {
    var a = new Date(WD.todayISO() + 'T00:00:00Z');
    var b = new Date(iso + 'T00:00:00Z');
    return Math.round((b - a) / 86400000);
  };
  WD.relativeDays = function (iso) {
    var n = WD.daysUntil(iso);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
  };
  WD.badge = function (kind, value) {
    var labels = kind === 'status' ? WD.STATUS_LABEL : WD.PAYMENT_LABEL;
    var icons = kind === 'status' ? WD.STATUS_ICON : WD.PAYMENT_ICON;
    return WD.h('span', { class: 'badge badge-' + value },
      WD.h('span', { 'aria-hidden': 'true', text: icons[value] || '' }),
      labels[value] || value
    );
  };

  window.WD = WD;
})();

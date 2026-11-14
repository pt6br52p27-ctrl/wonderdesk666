'use strict';
/* Task 1 - Sign-in: validation, error summary, simulated "signing in..." delay. */
(function () {
  if (WD.getSession()) { location.replace('dashboard.html'); return; }

  var $ = function (id) { return document.getElementById(id); };
  var form = $('login-form');
  var busy = false;

  /* Message passed in the URL by other pages (signed out / session needed). */
  var reason = new URLSearchParams(location.search).get('reason');
  if (reason === 'signedout') WD.showNotice('success', 'You have signed out. See you next time.');
  if (reason === 'signin') WD.showNotice('info', 'Please sign in to continue.');

  function setError(id, msg) {
    var input = $(id), err = $(id + '-error');
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

  function showSummary(items) {
    var list = $('error-summary-list');
    list.replaceChildren();
    items.forEach(function (it) {
      var li = WD.h('li');
      if (it.id) {
        li.appendChild(WD.h('a', {
          href: '#' + it.id, text: it.msg,
          onclick: function (e) { e.preventDefault(); $(it.id).focus(); }
        }));
      } else {
        li.textContent = it.msg;
      }
      list.appendChild(li);
    });
    var box = $('error-summary');
    box.hidden = false;
    box.focus();
  }

  function setBusy(on) {
    busy = on;
    var btn = $('login-btn');
    btn.setAttribute('aria-disabled', on ? 'true' : 'false');
    form.setAttribute('aria-busy', on ? 'true' : 'false');
    $('login-spinner').hidden = !on;
    $('login-btn-text').textContent = on ? 'Signing in…' : 'Sign in';
    if (on) WD.announce('Signing in, please wait.');
  }

  /* Validate on blur as well as on submit (error prevention).
     Two details stop the layout jumping under the mouse pointer, which would
     swallow a click on "Sign in" (found during browser testing):
       1. errors are cleared as soon as the person types a valid value
       2. blur-validation is skipped when focus is moving to the submit button,
          because the submit handler validates anyway. */
  function movingToButton(e) { return e.relatedTarget && e.relatedTarget.id === 'login-btn'; }
  $('username').addEventListener('blur', function (e) {
    if (movingToButton(e)) return;
    setError('username', this.value.trim() ? '' : 'Enter your username.');
  });
  $('password').addEventListener('blur', function (e) {
    if (movingToButton(e)) return;
    setError('password', this.value ? '' : 'Enter your password.');
  });
  $('username').addEventListener('input', function () { if (this.value.trim()) setError('username', ''); });
  $('password').addEventListener('input', function () { if (this.value) setError('password', ''); });
  $('show-password').addEventListener('change', function () {
    $('password').type = this.checked ? 'text' : 'password';
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    WD.clearNotice();

    var u = $('username').value.trim();
    var p = $('password').value;
    var problems = [];
    setError('username', u ? '' : 'Enter your username.');
    setError('password', p ? '' : 'Enter your password.');
    if (!u) problems.push({ id: 'username', msg: 'Enter your username.' });
    if (!p) problems.push({ id: 'password', msg: 'Enter your password.' });
    if (problems.length) { showSummary(problems); return; }

    $('error-summary').hidden = true;
    setBusy(true);

    // Simulated network delay, as required by the brief.
    setTimeout(function () {
      var account = WD.USERS[u.toLowerCase()];
      if (account && account.password === p) {
        WD.setSession({ username: u.toLowerCase(), role: account.role, label: account.label, name: account.name });
        WD.announce('Signed in. Opening the dashboard.');
        location.href = 'dashboard.html';
        return;
      }
      setBusy(false);
      showSummary([{ id: 'username', msg: 'The username or password is not correct. Check the demo accounts below the form and try again.' }]);
    }, 900);
  });
})();

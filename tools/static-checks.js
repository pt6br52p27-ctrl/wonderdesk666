'use strict';
/* A small structural accessibility lint for the HTML pages (not a replacement for
   axe/WAVE). Checks: lang, title, one h1, heading order, landmarks, unique ids,
   every form control labelled, aria-describedby targets exist, no inline
   style/script (the CSP forbids them), skip link present. */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
let problems = 0;
const report = (file, msg) => { problems++; console.log('FAIL  ' + file + ': ' + msg); };

files.forEach((file) => {
  const html = fs.readFileSync(path.join(dir, file), 'utf8');
  const before = problems;

  if (!/<html[^>]*\blang="[a-z-]+"/i.test(html)) report(file, 'missing lang on <html>');
  if (!/<title>[^<]+<\/title>/i.test(html)) report(file, 'missing <title>');
  const h1s = html.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) report(file, 'expected exactly one <h1>, found ' + h1s.length);

  let last = 0;
  (html.match(/<h([1-6])[\s>]/g) || []).forEach((m) => {
    const level = Number(m[2]);
    if (last && level > last + 1) report(file, 'heading level jumps from h' + last + ' to h' + level);
    last = level;
  });

  ['<header', '<main', '<footer'].forEach((tag) => { if (!html.includes(tag)) report(file, 'missing landmark ' + tag + '>'); });
  if (!/class="skip-link"/.test(html)) report(file, 'missing skip link');
  if (/<nav/.test(html) && !/<nav[^>]*aria-label=/.test(html)) report(file, '<nav> without aria-label');

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  ids.forEach((id) => { if (seen.has(id)) report(file, 'duplicate id "' + id + '"'); seen.add(id); });

  // every visible form control needs a <label for> (or an aria-label)
  [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].forEach((m) => {
    const attrs = m[2];
    const type = (attrs.match(/\btype="([^"]+)"/) || [])[1] || 'text';
    if (['hidden', 'submit', 'button'].includes(type)) return;
    const id = (attrs.match(/\bid="([^"]+)"/) || [])[1];
    const hasLabel = id && new RegExp('<label[^>]*\\bfor="' + id + '"').test(html);
    if (!hasLabel && !/aria-label(ledby)?=/.test(attrs)) report(file, 'control without a label: ' + (id || m[0].slice(0, 40)));
  });

  [...html.matchAll(/aria-(?:describedby|labelledby|controls)="([^"]+)"/g)].forEach((m) => {
    m[1].split(/\s+/).forEach((ref) => { if (!seen.has(ref)) report(file, 'aria reference to missing id "' + ref + '"'); });
  });

  if (/\sstyle="/.test(html)) report(file, 'inline style attribute (blocked by CSP)');
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) report(file, 'inline <script> (blocked by CSP)');
  if (/<img\b(?![^>]*\balt=)/.test(html)) report(file, '<img> without alt');
  if (/tabindex="[1-9]/.test(html)) report(file, 'positive tabindex');
  if (/<button\b[^>]*>\s*<\/button>/.test(html)) report(file, 'empty button');

  console.log((problems === before ? 'PASS' : 'DONE') + '  ' + file);
});

console.log('\n' + files.length + ' pages checked, ' + problems + ' problem(s).');
process.exit(problems ? 1 : 0);

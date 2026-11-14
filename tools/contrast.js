'use strict';
/* Computes WCAG contrast ratios for every colour pair used in styles.css.
   Text needs 4.5:1; UI component borders and focus rings need 3:1. */

function lum(hex) {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#ffffff', BG = '#f5f2ec';
const pairs = [
  // [label, foreground, background, minimum]
  ['Body text on page background', '#1c2b30', BG, 4.5],
  ['Body text on white card', '#1c2b30', WHITE, 4.5],
  ['Muted text on white', '#465a61', WHITE, 4.5],
  ['Muted text on page background', '#465a61', BG, 4.5],
  ['Link on white', '#0a4f8f', WHITE, 4.5],
  ['Link on page background', '#0a4f8f', BG, 4.5],
  ['Header text on header', '#ffffff', '#073d45', 4.5],
  ['Primary button text', '#ffffff', '#0b5560', 4.5],
  ['Primary button hover text', '#ffffff', '#073d45', 4.5],
  ['Secondary button text on white', '#073d45', WHITE, 4.5],
  ['Secondary button hover text', '#073d45', '#e3f0f1', 4.5],
  ['Danger button text', '#ffffff', '#a61b1b', 4.5],
  ['Danger button hover text', '#ffffff', '#7f1414', 4.5],
  ['Error text on white', '#a61b1b', WHITE, 4.5],
  ['Error text on error panel', '#7a1111', '#fdecec', 4.5],
  ['Required asterisk on white', '#a61b1b', WHITE, 4.5],
  ['Success notice text', '#12461f', '#e8f5ea', 4.5],
  ['Warning badge text', '#6b4200', '#fff4dc', 4.5],
  ['Info notice text', '#093a66', '#e6f0fa', 4.5],
  ['Table header text on tint', '#073d45', '#e3f0f1', 4.5],
  ['Sort icon (unsorted) on tint', '#465a61', '#e3f0f1', 4.5],
  ['Muted text on stacked-card white', '#465a61', WHITE, 4.5],
  ['Footer text on white', '#465a61', WHITE, 4.5],
  // non-text (3:1)
  ['Form control border on white', '#5f7178', WHITE, 3],
  ['Focus ring on page background', '#0a3d91', BG, 3],
  ['Focus ring on white', '#0a3d91', WHITE, 3],
  ['Focus ring on header (yellow)', '#ffd166', '#073d45', 3],
  ['Success badge border on its fill', '#1b6a30', '#e8f5ea', 3],
  ['Warning badge border on its fill', '#6b4200', '#fff4dc', 3],
  ['Error badge border on its fill', '#a61b1b', '#fdecec', 3],
  ['Invalid-field border on white', '#a61b1b', WHITE, 3]
];

let failed = 0;
console.log('Contrast check (WCAG 2.1 AA)\n');
pairs.forEach(([label, fg, bg, min]) => {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + r.toFixed(2).padStart(5) + ':1  (need ' + min + ')  ' + label);
});
console.log('\n' + (pairs.length - failed) + ' of ' + pairs.length + ' pairs pass.');
process.exit(failed ? 1 : 0);

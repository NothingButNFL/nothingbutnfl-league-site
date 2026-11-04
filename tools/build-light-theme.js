// Builds theme-light.css: every rule in styles.css that uses a dark-theme color gets a
// html[data-theme="light"] copy with the light-theme color. Uses Chromium's CSS parser.
const { chromium } = require('playwright');
const fs = require('fs');
const site = require('path').join(__dirname, '..'); // run: node tools/build-light-theme.js (needs Playwright)
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.setContent(`<style>${fs.readFileSync(site + '/styles.css', 'utf8')}</style>`);
  const css = await p.evaluate(() => {
    const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', '); };
    // Surfaces/borders (backgrounds, borders, shadows, outlines)
    const surface = {
      '#071a33': '#eef2f8', '#0c2b50': '#ffffff', '#0a2647': '#f5f8fc', '#10335d': '#e6eef8', '#103261': '#e6eef8',
      '#174477': '#dbe7f6', '#1d3a5f': '#e2e9f2', '#264a75': '#cfdbea', '#31527a': '#c6d4e5', '#123f73': '#e2ebf7',
      '#2b2a1a': '#fff4dc', '#5b3650': '#f6e3ea', '#334149': '#d5dde6', '#101a22': '#eef2f6', '#405057': '#c9d3dc',
      '#54749b': '#9fb2cb', '#6d8197': '#c3d0df', '#8ca5c5': '#8ca5c5', '#c5d5e8': '#9fb2cb', '#c9d8ea': '#9fb2cb',
      '#8fd0ff': '#1f6fc5', '#6fc8ff': '#1677c9', '#ffd37a': '#c98a12', '#f2b950': '#d6981f', '#f2a950': '#d68a1f',
      '#ffb36b': '#d2701a', '#75e28b': '#2f9e52', '#ff9299': '#d23a46', '#ff6b7a': '#d23a46', '#ffb3a5': '#e0705f',
      '#dbe7f5': '#9fb2cb', '#a7bdd7': '#9fb2cb', '#d7e8ff': '#c6d4e5', '#ffffff': '#0c2b50', '#fff': '#0c2b50', '#3a2c0c': '#fff3d6'
    };
    // Text colors
    const text = {
      '#ffffff': '#0b1f3a', '#fff': '#0b1f3a', '#dbe7f5': '#22385a', '#c5d5e8': '#33496b', '#c9d8ea': '#33496b', '#d7e8ff': '#22385a',
      '#e6eef9': '#22385a', '#a7bdd7': '#4f6584', '#8ca5c5': '#556b8a', '#54749b': '#5d7391', '#6d8197': '#5d7391',
      '#8fd0ff': '#1561b0', '#6fc8ff': '#1468b8', '#ffd37a': '#946100', '#f2b950': '#9a6600', '#f2a950': '#9a5a00',
      '#ffb36b': '#b45c0c', '#ffcf8a': '#9a6600', '#75e28b': '#1e7f3a', '#ff9299': '#c0283a', '#ff6b7a': '#c0283a',
      '#ff8a95': '#c0283a', '#ff9a9a': '#c0283a', '#ffb3a5': '#b8432f', '#ff4d5e': '#c0283a', '#ff5a5e': '#c0283a',
      '#c79bff': '#6d35c4', '#f2d250': '#8a6d00', '#f6e7c1': '#5a4100', '#071a33': '#0b1f3a', '#0c2b50': '#0b1f3a', '#174477': '#1c3f6e', '#31527a': '#4a6488'
    };
    const toMap = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [hex(k), v]));
    const S = toMap(surface), T = toMap(text);
    const textProps = new Set(['color', '-webkit-text-fill-color', 'caret-color', 'fill', 'stroke', 'text-decoration-color', 'text-emphasis-color']);
    const vars = { '--ink': '#ffffff', '--ink-soft': '#33496b', '--paper': '#eef2f8', '--paper-deep': '#e2ebf7', '--muted': '#44597a', '--line': '#c6d4e5', '--lime': '#0c2b50', '--orange': '#1f6fc5' };
    // White-on-light overlays become ink-on-light; black shadows soften.
    const rgba = (value) => value
      .replace(/rgba\(255, 255, 255, ([\d.]+)\)/g, (_, a) => `rgba(11, 31, 58, ${Math.min(1, Number(a) * 1.4).toFixed(3)})`)
      .replace(/rgba\(0, 0, 0, ([\d.]+)\)/g, (_, a) => `rgba(15, 35, 70, ${(Number(a) * 0.35).toFixed(3)})`)
      .replace(/rgba\(7, 26, 51, ([\d.]+)\)/g, (_, a) => `rgba(255, 255, 255, ${a})`)
      .replace(/rgba\(3, 12, 26, ([\d.]+)\)/g, (_, a) => `rgba(15, 30, 60, ${(Number(a) * 0.6).toFixed(3)})`)
      .replace(/rgba\(143, 208, 255, /g, 'rgba(31, 111, 197, ')
      .replace(/rgba\(49, 82, 122, /g, 'rgba(198, 212, 229, ');
    const strongBg = new Set(['229, 50, 45', '229, 56, 59', '0, 0, 0'].map(String));
    const named = (v) => v.replace(/\bwhite\b/g, 'rgb(255, 255, 255)').replace(/\bblack\b/g, 'rgb(0, 0, 0)');
    const mapValue = (value, table) => rgba(named(value).replace(/rgb\((\d+), (\d+), (\d+)\)/g, (m, r, g, bl) => { const k = `${r}, ${g}, ${bl}`; return table[k] ? table[k] : m; }));
    const prefix = (sel) => sel.split(',').map((s) => {
      s = s.trim();
      if (s.startsWith(':root')) return 'html[data-theme="light"]' + s.slice(5);
      if (/^html\b/.test(s)) return 'html[data-theme="light"]' + s.slice(4);
      return 'html[data-theme="light"] ' + s;
    }).join(', ');
    const out = [];
    const walk = (rules, indent) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.MEDIA_RULE) {
          const inner = []; const save = out.length;
          walk(rule.cssRules, indent + '  ');
          const block = out.splice(save);
          if (block.length) out.push(`${indent}@media ${rule.conditionText} {`, ...block, `${indent}}`);
          continue;
        }
        if (rule.type !== CSSRule.STYLE_RULE) continue;
        const st = rule.style; const decls = [];
        const bgColor = st.getPropertyValue('background-color').replace(/rgb\((\d+), (\d+), (\d+)\)/, '$1, $2, $3');
        const whiteBg = bgColor === '255, 255, 255';
        const keepText = strongBg.has(bgColor);
        for (let i = 0; i < st.length; i++) {
          const prop = st[i]; const value = st.getPropertyValue(prop); const imp = st.getPropertyPriority(prop) ? ' !important' : '';
          if (prop.startsWith('--')) { if (vars[prop] && rule.selectorText.includes(':root')) decls.push(`${prop}: ${vars[prop]}${imp}`); continue; }
          if (prop === 'color-scheme') { decls.push('color-scheme: light'); continue; }
          if (!/rgb|#|\bwhite\b|\bblack\b/.test(value)) continue;
          let next;
          if (textProps.has(prop)) {
            if (keepText) continue;
            next = whiteBg && /rgb\((7, 26, 51|12, 43, 80|11, 31, 58)\)/.test(value) ? value.replace(/rgb\([^)]*\)/, '#ffffff') : mapValue(value, T);
          } else next = mapValue(value, S);
          if (next !== value) decls.push(`${prop}: ${next}${imp}`);
        }
        if (decls.length) out.push(`${indent}${prefix(rule.selectorText)} { ${decls.join('; ')}; }`);
      }
    };
    walk(document.styleSheets[0].cssRules, '');
    return out.join('\n');
  });
  fs.writeFileSync(site + '/theme-light.css', `/* Light theme. Generated from styles.css: each rule that uses a dark-theme color is repeated under\n   html[data-theme="light"] with the matching light color. Hand-tuned rules are at the end. */\n${css}\n`);
  console.log('bytes', css.length, 'rules', css.split('\n').length);
  await b.close();
})();

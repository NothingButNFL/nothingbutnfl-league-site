// Builds theme-light.css, theme-gray.css and theme-team.css (NFL team themes) from styles.css. Every rule that uses one of the dark theme's
// colors is repeated under html[data-theme="light"] (or "gray") with that theme's color. Uses Chromium's own
// CSS parser through Playwright. Run after changing styles.css:   node tools/build-themes.js
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const site = path.join(__dirname, "..");

const themes = {
  light: {
    title: "Light theme",
    // Backgrounds, borders, shadows, outlines
    surface: {
      "#071a33": "#eef2f8", "#0c2b50": "#ffffff", "#0a2647": "#f5f8fc", "#10335d": "#e6eef8", "#103261": "#e6eef8",
      "#174477": "#dbe7f6", "#1d3a5f": "#e2e9f2", "#264a75": "#cfdbea", "#31527a": "#c6d4e5", "#123f73": "#e2ebf7",
      "#2b2a1a": "#fff4dc", "#5b3650": "#f6e3ea", "#334149": "#d5dde6", "#101a22": "#eef2f6", "#405057": "#c9d3dc",
      "#54749b": "#9fb2cb", "#6d8197": "#c3d0df", "#c5d5e8": "#9fb2cb", "#c9d8ea": "#9fb2cb",
      "#8fd0ff": "#1f6fc5", "#6fc8ff": "#1677c9", "#ffd37a": "#c98a12", "#f2b950": "#d6981f", "#f2a950": "#d68a1f",
      "#ffb36b": "#d2701a", "#75e28b": "#2f9e52", "#ff9299": "#d23a46", "#ff6b7a": "#d23a46", "#ffb3a5": "#e0705f",
      "#dbe7f5": "#9fb2cb", "#a7bdd7": "#9fb2cb", "#d7e8ff": "#c6d4e5", "#ffffff": "#0c2b50", "#3a2c0c": "#fff3d6"
    },
    // Text colors
    text: {
      "#ffffff": "#0b1f3a", "#dbe7f5": "#22385a", "#c5d5e8": "#33496b", "#c9d8ea": "#33496b", "#d7e8ff": "#22385a",
      "#e6eef9": "#22385a", "#a7bdd7": "#4f6584", "#8ca5c5": "#556b8a", "#54749b": "#5d7391", "#6d8197": "#5d7391",
      "#8fd0ff": "#1561b0", "#6fc8ff": "#1468b8", "#ffd37a": "#946100", "#f2b950": "#9a6600", "#f2a950": "#9a5a00",
      "#ffb36b": "#b45c0c", "#ffcf8a": "#9a6600", "#75e28b": "#1e7f3a", "#ff9299": "#c0283a", "#ff6b7a": "#c0283a",
      "#ff8a95": "#c0283a", "#ff9a9a": "#c0283a", "#ffb3a5": "#b8432f", "#ff4d5e": "#c0283a", "#ff5a5e": "#c0283a",
      "#c79bff": "#6d35c4", "#f2d250": "#8a6d00", "#f6e7c1": "#5a4100", "#071a33": "#0b1f3a", "#0c2b50": "#0b1f3a",
      "#174477": "#1c3f6e", "#31527a": "#4a6488"
    },
    vars: { "--ink": "#ffffff", "--ink-soft": "#33496b", "--paper": "#eef2f8", "--paper-deep": "#e2ebf7", "--muted": "#44597a", "--line": "#c6d4e5", "--lime": "#0c2b50", "--orange": "#1f6fc5" },
    colorScheme: "light",
    invertWhiteButtons: true,
    rgba: [
      ["255, 255, 255", "11, 31, 58", 1.4], ["0, 0, 0", "15, 35, 70", 0.35], ["7, 26, 51", "255, 255, 255", 1],
      ["3, 12, 26", "15, 30, 60", 0.6], ["143, 208, 255", "31, 111, 197", 1], ["49, 82, 122", "198, 212, 229", 1]
    ]
  },
  gray: {
    title: "Gray theme",
    // Navy surfaces become neutral charcoal; text and accents stay light.
    surface: {
      "#071a33": "#18191b", "#0c2b50": "#242528", "#0a2647": "#1e1f22", "#10335d": "#2c2e32", "#103261": "#2c2e32",
      "#174477": "#3a3c41", "#1d3a5f": "#303236", "#264a75": "#3d3f44", "#31527a": "#47494f", "#123f73": "#303237",
      "#334149": "#3a3c40", "#101a22": "#1b1c1e", "#405057": "#4a4c50", "#54749b": "#6c6f76", "#6d8197": "#7b7e85",
      "#3a2c0c": "#2e2a20"
    },
    text: {
      "#8ca5c5": "#a5a8ae", "#c5d5e8": "#d5d7db", "#c9d8ea": "#d5d7db", "#dbe7f5": "#e2e3e6", "#d7e8ff": "#e2e3e6",
      "#e6eef9": "#e9eaec", "#a7bdd7": "#b6b9be", "#54749b": "#8a8d94", "#6d8197": "#8f9298", "#071a33": "#18191b",
      "#0c2b50": "#18191b", "#174477": "#3a3c41"
    },
    vars: { "--ink": "#18191b", "--ink-soft": "#3a3c41", "--paper": "#18191b", "--paper-deep": "#303237", "--muted": "#d5d7db", "--line": "#47494f" },
    colorScheme: "dark",
    invertWhiteButtons: false,
    rgba: [["7, 26, 51", "24, 25, 27", 1], ["49, 82, 122", "71, 73, 79", 1], ["3, 12, 26", "10, 10, 12", 1], ["12, 43, 80", "36, 37, 40", 1]]
  }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<style>${fs.readFileSync(path.join(site, "styles.css"), "utf8")}</style>`);
  for (const [name, theme] of Object.entries(themes)) {
    const css = await page.evaluate(({ name, theme }) => {
      const hex = (h) => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(", "); };
      const toMap = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [hex(k), v]));
      const S = toMap(theme.surface), T = toMap(theme.text);
      const textProps = new Set(["color", "-webkit-text-fill-color", "caret-color", "fill", "stroke", "text-decoration-color", "text-emphasis-color"]);
      const named = (v) => v.replace(/\bwhite\b/g, "rgb(255, 255, 255)").replace(/\bblack\b/g, "rgb(0, 0, 0)");
      const rgba = (value) => theme.rgba.reduce((v, [from, to, scale]) =>
        v.replace(new RegExp(`rgba\\(${from}, ([\\d.]+)\\)`, "g"), (_, a) => `rgba(${to}, ${Math.min(1, Number(a) * scale).toFixed(3)})`), value);
      const strongBg = new Set(["229, 50, 45", "229, 56, 59", "0, 0, 0"]);
      const mapValue = (value, table) => rgba(named(value).replace(/rgb\((\d+), (\d+), (\d+)\)/g, (m, r, g, b) => table[`${r}, ${g}, ${b}`] || m));
      const scope = `html[data-theme="${name}"]`;
      const prefix = (sel) => sel.split(",").map((s) => {
        s = s.trim();
        if (s.startsWith(":root")) return scope + s.slice(5);
        if (/^html\b/.test(s)) return scope + s.slice(4);
        return `${scope} ${s}`;
      }).join(", ");
      const out = [];
      const walk = (rules, indent) => {
        for (const rule of rules) {
          if (rule.type === CSSRule.MEDIA_RULE) {
            const start = out.length;
            walk(rule.cssRules, indent + "  ");
            const block = out.splice(start);
            if (block.length) out.push(`${indent}@media ${rule.conditionText} {`, ...block, `${indent}}`);
            continue;
          }
          if (rule.type !== CSSRule.STYLE_RULE) continue;
          const st = rule.style; const decls = [];
          const bg = named(st.getPropertyValue("background-color")).replace(/rgb\((\d+), (\d+), (\d+)\)/, "$1, $2, $3");
          const whiteBg = theme.invertWhiteButtons && bg === "255, 255, 255";
          const keepText = strongBg.has(bg);
          for (let i = 0; i < st.length; i++) {
            const prop = st[i]; const value = st.getPropertyValue(prop); const imp = st.getPropertyPriority(prop) ? " !important" : "";
            if (prop.startsWith("--")) { if (theme.vars[prop] && rule.selectorText.includes(":root")) decls.push(`${prop}: ${theme.vars[prop]}${imp}`); continue; }
            if (prop === "color-scheme") { decls.push(`color-scheme: ${theme.colorScheme}`); continue; }
            if (!/rgb|#|\bwhite\b|\bblack\b/.test(value)) continue;
            let next;
            if (textProps.has(prop)) {
              if (keepText) continue;
              next = whiteBg && /rgb\((7, 26, 51|12, 43, 80|11, 31, 58)\)/.test(value) ? value.replace(/rgb\([^)]*\)/, "#ffffff") : mapValue(value, T);
            } else next = mapValue(value, S);
            if (next !== value && next !== named(value)) decls.push(`${prop}: ${next}${imp}`);
          }
          if (decls.length) out.push(`${indent}${prefix(rule.selectorText)} { ${decls.join("; ")}; }`);
        }
      };
      walk(document.styleSheets[0].cssRules, "");
      return out.join("\n");
    }, { name, theme });
    const header = `/* ${theme.title}. Generated by tools/build-themes.js from styles.css; don't edit by hand.\n   Each rule that uses a dark-theme color is repeated under html[data-theme="${name}"] with this theme's color. */\n`;
    fs.writeFileSync(path.join(site, `theme-${name}.css`), header + css + "\n");
    console.log(`theme-${name}.css`, css.split("\n").length, "rules");
  }

  // NFL team themes (and Neon): one stylesheet for all of them. Every NBNFL navy/blue color becomes a variable
  // (--tm-RRGGBB holding "r g b") that teams.js fills in from the chosen team's colors.
  const team = await page.evaluate(() => {
    const classify = (r, g, b) => {
      const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, l = (max + min) / 2, d = max - min;
      if (!d) return null;
      const s = d / (1 - Math.abs(2 * l - 1));
      const rr = r / 255, gg = g / 255, bb = b / 255;
      let h = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
      h = (h * 60 + 360) % 360;
      if (h < 196 || h > 218 || s < 0.14) return null;
      return [Math.round(h), +s.toFixed(3), +l.toFixed(3), s >= 0.9 && l < 0.85 ? "a" : l < 0.55 ? "s" : "t"];
    };
    const used = {};
    const hex2 = (n) => Number(n).toString(16).padStart(2, "0");
    const named = (v) => v.replace(/\bwhite\b/g, "rgb(255, 255, 255)").replace(/\bblack\b/g, "rgb(0, 0, 0)");
    const mapValue = (value) => named(value).replace(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/g, (m, r, g, b, a) => {
      const c = classify(+r, +g, +b);
      if (!c) return m;
      const key = hex2(r) + hex2(g) + hex2(b);
      used[key] = c;
      return a === undefined ? `rgb(var(--tm-${key}))` : `rgb(var(--tm-${key}) / ${a})`;
    });
    const scope = 'html:is([data-theme^="team-"], [data-theme="neon"])'; // Neon uses the same variables
    const prefix = (sel) => sel.split(",").map((s) => {
      s = s.trim();
      if (s.startsWith(":root")) return scope + s.slice(5);
      if (/^html\b/.test(s)) return scope + s.slice(4);
      return `${scope} ${s}`;
    }).join(", ");
    const out = [];
    const walk = (rules, indent) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.MEDIA_RULE) {
          const start = out.length;
          walk(rule.cssRules, indent + "  ");
          const block = out.splice(start);
          if (block.length) out.push(`${indent}@media ${rule.conditionText} {`, ...block, `${indent}}`);
          continue;
        }
        if (rule.type !== CSSRule.STYLE_RULE) continue;
        const st = rule.style; const decls = [];
        for (let i = 0; i < st.length; i++) {
          const prop = st[i]; const value = st.getPropertyValue(prop); const imp = st.getPropertyPriority(prop) ? " !important" : "";
          if (!/rgb|#|\bwhite\b|\bblack\b/.test(value)) continue;
          if (prop.startsWith("--") && !rule.selectorText.includes(":root")) continue;
          let v = value;
          if (prop.startsWith("--")) {
            const m = v.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
            if (!m) continue;
            let h = m[1]; if (h.length === 3) h = h.split("").map((c) => c + c).join("");
            v = `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4), 16)})`;
          }
          const next = mapValue(v);
          if (next !== named(v)) decls.push(`${prop}: ${next}${imp}`);
        }
        if (decls.length) out.push(`${indent}${prefix(rule.selectorText)} { ${decls.join("; ")}; }`);
      }
    };
    walk(document.styleSheets[0].cssRules, "");
    return { css: out.join("\n"), used };
  });
  fs.writeFileSync(path.join(site, "theme-team.css"), `/* NFL team themes. Generated by tools/build-themes.js from styles.css; don't edit by hand.\n   Each NBNFL blue is a --tm-RRGGBB variable ("r g b"); teams.js sets them from the chosen team's colors. */\n${team.css}\n`);
  console.log("theme-team.css", team.css.split("\n").length, "rules,", Object.keys(team.used).length, "colors");
  // teams.js needs the same color list (hue, saturation, lightness, a=accent / s=surface / t=text).
  const teamsPath = path.join(site, "teams.js");
  const teamsJs = fs.readFileSync(teamsPath, "utf8");
  const line = `const teamThemeColors = ${JSON.stringify(Object.fromEntries(Object.entries(team.used).sort()))}; // generated by tools/build-themes.js`;
  const marker = /^const teamThemeColors = .*\/\/ generated by tools\/build-themes\.js$/m;
  if (!marker.test(teamsJs)) throw new Error("teams.js is missing the teamThemeColors line");
  fs.writeFileSync(teamsPath, teamsJs.replace(marker, line));
  await browser.close();
})();

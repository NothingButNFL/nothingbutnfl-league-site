// Adds ?v=<content hash> to every local .js and .css link in the site's pages, so browsers (and GitHub Pages' cache)
// fetch the new copy as soon as a file changes instead of mixing a fresh page with old scripts.
// Run after changing any .js or .css file (after build-themes.js):   node tools/stamp-assets.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const site = path.join(__dirname, "..");
const hash = (file) => crypto.createHash("sha1").update(fs.readFileSync(path.join(site, file))).digest("hex").slice(0, 8);

// sample-admin.js downloads the sample files itself; stamp those links first (this changes sample-admin.js's hash).
const adminPath = path.join(site, "sample-admin.js");
let admin = fs.readFileSync(adminPath, "utf8");
admin = admin.replace(/load\("(sample-league|sample-midseason)\.js(\?v=\w+)?"\)/g, (_, name) => `load("${name}.js?v=${hash(`${name}.js`)}")`);
fs.writeFileSync(adminPath, admin);

let pages = 0;
for (const page of fs.readdirSync(site).filter((f) => f.endsWith(".html"))) {
  const file = path.join(site, page);
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(/\b(src|href)="([\w./-]+\.(?:js|css))(?:\?v=\w+)?"/g, (match, attr, ref) =>
    fs.existsSync(path.join(site, ref)) ? `${attr}="${ref}?v=${hash(ref)}"` : match);
  if (after !== before) { fs.writeFileSync(file, after); pages += 1; }
}
console.log(`Stamped asset versions in ${pages} page(s).`);

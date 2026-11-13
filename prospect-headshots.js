// Headshots for Draft Pool prospects before anyone (NFL or this league) drafts them: searches ESPN's football players
// for the name (preferring the same school), then uses the headshot ESPN lists for him (his NFL one once he's in the
// NFL, else his college one), checking that the picture really loads. Only a link is saved, as
// profile.photoUrl with profile.photoSource = "import", so Admin › Player Headshots can replace or remove it.
const phCollegePhoto = (id) => `https://a.espncdn.com/i/headshots/college-football/players/full/${id}.png`;
const phNflPhoto = (id) => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
const phNameKey = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, "").replace(/[^a-z]/g, "");
const phSchoolKey = (s) => String(s || "").toLowerCase().replace(/\bst\.?(?=\s|$)/g, "state").replace(/\buniversity( of)?\b/g, "").replace(/[^a-z]/g, "");

async function phJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

// Every football athlete in an ESPN search response, college (league 23) or NFL (league 28; ESPN keeps the same
// athlete id when a college player reaches the NFL): [{ id, name, league, image, text }].
function phEspnAthletes(json) {
  const out = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const name = node.displayName || node.name;
    const uid = String(node.uid || "");
    const slug = `${node.league || ""} ${node.defaultLeagueSlug || ""} ${node.link?.web || node.link || ""}`;
    const league = /~l:23(~|$)/.test(uid) || /college-football/.test(slug) ? "college" : /~l:28(~|$)/.test(uid) || /\bnfl\b/.test(slug) ? "nfl" : "";
    const id = (uid.match(/~a:(\d+)/) || [])[1] || "";
    if (typeof name === "string" && id && league && /^s:20~/.test(uid)) {
      const image = typeof node.image?.default === "string" && /^https:\/\/a\.espncdn\.com\//.test(node.image.default) ? node.image.default : "";
      out.push({ id, name, league, image, text: JSON.stringify(node) });
    } else Object.values(node).forEach(walk);
  };
  walk(json);
  return out;
}

// Resolves true when the picture really loads (ESPN answers missing headshots with an error or a 1×1 image).
function phImageLoads(url, wait = 10000) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => { clearTimeout(timer); img.onload = img.onerror = null; resolve(ok); };
    const timer = setTimeout(() => done(false), wait);
    img.onload = () => done(img.naturalWidth > 2 && img.naturalHeight > 2);
    img.onerror = () => done(false);
    img.src = url;
  });
}

// { url, espnId } for one prospect, or null when ESPN has no player or no picture for him. Throws when ESPN's
// search can't be reached at all, so callers can say so instead of reporting "not found".
async function findProspectHeadshot(prospect) {
  const want = phNameKey(prospect.name);
  const school = phSchoolKey(prospect.college);
  const q = encodeURIComponent(prospect.name);
  let found = [], reached = false;
  for (const url of [
    `https://site.web.api.espn.com/apis/search/v2?query=${q}&limit=25`,
    `https://site.web.api.espn.com/apis/common/v3/search?query=${q}&limit=25&type=player&sport=football&league=college-football`,
  ]) {
    try { found = phEspnAthletes(await phJson(url)).filter((p) => phNameKey(p.name) === want); reached = true; } catch { found = []; }
    if (found.length) break;
  }
  if (!reached) throw new Error("ESPN couldn't be reached");
  // Same school first (the college entry's team, e.g. "Texas Longhorns"); with no school match, only trust a name
  // ESPN has once (one athlete id, which may show up as both his college and NFL entry).
  const sameSchool = school ? found.filter((p) => p.league === "college" && phSchoolKey(p.text).includes(school)) : [];
  const unique = [...new Set(found.map((p) => p.id))];
  const ids = sameSchool.length ? [...new Set(sameSchool.map((p) => p.id))].slice(0, 2) : unique.length === 1 ? unique : [];
  for (const id of ids) {
    const listed = found.filter((p) => p.id === id && p.image).sort((a, b) => (a.league === "nfl" ? -1 : 1) - (b.league === "nfl" ? -1 : 1)).map((p) => p.image);
    for (const url of [...new Set([...listed, phCollegePhoto(id), phNflPhoto(id)])]) {
      if (await phImageLoads(url)) return { url, espnId: id };
    }
  }
  return null;
}

// Looks up every prospect in the list (a few at a time). Skips anyone who already has a photo unless `replace`;
// photos set by hand (not "import") are never replaced. onProgress(done, total) after each one.
// Returns { found: Map(prospectId → url), missing: [names], unreachable: boolean, checked }.
async function findPoolHeadshots(prospects, { replace = false, onProgress } = {}) {
  const todo = prospects.filter((p) => {
    const profile = p.profile || {};
    const has = profile.photoUrl || profile.photoData;
    return !has || (replace && profile.photoSource === "import");
  });
  const found = new Map(), missing = [];
  let unreachable = 0, done = 0, next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const p = todo[next++];
      try {
        const hit = await findProspectHeadshot(p);
        if (hit) found.set(p.id, hit.url); else missing.push(p.name);
      } catch { unreachable += 1; missing.push(p.name); }
      done += 1;
      onProgress?.(done, todo.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
  return { found, missing, unreachable: todo.length > 0 && unreachable === todo.length, checked: todo.length };
}

// Writes found headshots into data.draftPool (by prospect id). Returns how many were set.
function applyPoolHeadshots(data, found) {
  let set = 0;
  for (const p of data.draftPool || []) {
    const url = found.get(p.id);
    if (!url) continue;
    const profile = { ...(p.profile || {}) };
    if ((profile.photoUrl || profile.photoData) && profile.photoSource !== "import") continue;
    profile.photoUrl = url;
    profile.photoSource = "import";
    delete profile.photoData;
    p.profile = profile;
    set += 1;
  }
  return set;
}

// Admin › Player Headshots: matches every player on the salary sheets and in Player Contracts against Sleeper's public
// NFL player list (https://api.sleeper.app/v1/players/nfl) by name, team and position, then saves a link to his ESPN
// headshot (Sleeper's own picture when he has no ESPN id) as profile.photoUrl, marked profile.photoSource = "import".
// Draft Pool prospects are matched too (by name, college, position and years in the NFL, since their league team
// isn't their NFL team), so their profiles and the draft room show a headshot.
// The list itself (~15 MB) is kept in memory only.
const hsStatus = document.querySelector("#hs-status");
const hsInfo = document.querySelector("#hs-list-info");
const hsRun = document.querySelector("#hs-run");
let hsList = null; // [{ id, name, key, team, position, espnId, active, college, height, weight, exp }]

// Sleeper's team codes that differ from the site's.
const hsTeamAliases = { JAC: "JAX", WSH: "WAS", LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };
const hsEspnPhoto = (id) => `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`;
const hsSleeperPhoto = (id) => `https://sleepercdn.com/content/nfl/players/${id}.jpg`;

function hsUseList(raw) {
  const players = Object.values(raw && typeof raw === "object" ? raw : {});
  hsList = players.filter((p) => p && typeof p === "object" && p.player_id && (p.full_name || (p.first_name && p.last_name)) && p.position !== "DEF")
    .map((p) => {
      const name = p.full_name || `${p.first_name} ${p.last_name}`;
      return { id: String(p.player_id), name, key: normalizePlayerName(name), team: hsTeamAliases[p.team] || p.team || "",
        position: p.position || "", espnId: p.espn_id ? String(p.espn_id) : "", active: p.active === true,
        college: typeof p.college === "string" ? p.college : "", height: Number(p.height) || 0, weight: Number(p.weight) || 0,
        exp: Number.isInteger(p.years_exp) ? p.years_exp : null };
    });
  if (!hsList.length) { hsList = null; throw new Error("that file doesn't look like Sleeper's NFL player list"); }
  hsInfo.textContent = `${hsList.length.toLocaleString("en-US")} players loaded (${hsList.filter((p) => p.espnId).length.toLocaleString("en-US")} with an ESPN id).`;
  hsRun.disabled = false;
}

document.querySelector("#hs-fetch").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  hsStatus.textContent = "Downloading Sleeper's player list (about 15 MB)…";
  try {
    const response = await fetch("https://api.sleeper.app/v1/players/nfl");
    if (!response.ok) throw new Error(`Sleeper answered ${response.status}`);
    hsUseList(await response.json());
    hsStatus.textContent = "Player list downloaded. Choose your options and import.";
  } catch (error) {
    hsStatus.textContent = `The download didn't work here (${error.message || "blocked"}). Use the link below to save the list, then upload it.`;
  }
  button.disabled = false;
});

document.querySelector("#hs-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  hsStatus.textContent = "Reading the file…";
  try {
    hsUseList(JSON.parse(await file.text()));
    hsStatus.textContent = "Player list loaded. Choose your options and import.";
  } catch (error) {
    hsStatus.textContent = `Couldn't use that file: ${error.message}.`;
  }
});

// Best Sleeper match for one of our players, or null (none, or more than one we can't tell apart).
function hsMatch(index, name, teamId, position) {
  const all = index.get(normalizePlayerName(name)) || [];
  if (all.length <= 1) return all[0] || null;
  const narrow = (list, test) => { const kept = list.filter(test); return kept.length ? kept : list; };
  let list = narrow(all, (p) => p.team === teamId);
  if (list.length > 1 && position) list = narrow(list, (p) => positionGroupFor(p.position) === positionGroupFor(position));
  if (list.length > 1) list = narrow(list, (p) => p.active);
  if (list.length > 1) list = narrow(list, (p) => p.espnId);
  return list.length === 1 ? list[0] : null;
}

// A Draft Pool prospect: same name, then the same school, position group and NFL experience for his draft class.
const hsSchool = (text) => String(text || "").toLowerCase().replace(/\b(university|college|of|the)\b|[^a-z]/g, "");
function hsMatchProspect(index, prospect) {
  const all = index.get(normalizePlayerName(prospect.name)) || [];
  if (!all.length) return null;
  const narrow = (list, test) => { const kept = list.filter(test); return kept.length ? kept : list; };
  const expected = Math.max(0, hsNflSeason() - prospect.year);
  let list = all.filter((p) => p.exp === null || Math.abs(p.exp - expected) <= 1);
  if (!list.length) return null;
  if (prospect.college) list = narrow(list, (p) => p.college && hsSchool(p.college) === hsSchool(prospect.college));
  if (list.length > 1 && prospect.position) list = narrow(list, (p) => positionGroupFor(p.position) === positionGroupFor(prospect.position));
  if (list.length > 1) list = narrow(list, (p) => p.exp === expected);
  if (list.length > 1) list = narrow(list, (p) => p.espnId);
  return list.length === 1 ? list[0] : null;
}
// Sleeper's years_exp counts the current NFL season (it rolls over when the season starts in September).
function hsNflSeason() { const now = new Date(); return now.getMonth() >= 2 ? now.getFullYear() : now.getFullYear() - 1; }

const hsHeightText = (inches) => (inches >= 60 && inches <= 90 ? `${Math.floor(inches / 12)}'${inches % 12}"` : "");

function hsEveryPlayer(data) {
  const year = currentLeagueYear();
  return [
    ...nflTeams.flatMap(({ id }) => data.teams[id].roster.map((player) => ({ player, teamId: id,
      position: (seasonEntry(player, year)?.position || player.activeSeasons.map((y) => seasonEntry(player, y)?.position).find(Boolean) || "") }))),
    ...(data.contractPlayers || []).map((player) => ({ player, teamId: player.team, position: player.position || "" })),
    ...(data.draftPool || []).map((player) => ({ player, teamId: "", position: player.position || "", prospect: true }))
  ];
}

hsRun.addEventListener("click", () => {
  if (!hsList) return;
  let data;
  try { data = readStoredOffice() || emptyOfficeData(); } catch { hsStatus.textContent = "Saved league data couldn't be read, so nothing was imported."; return; }
  const replace = document.querySelector("#hs-replace").checked;
  const details = document.querySelector("#hs-details").checked;
  const index = new Map();
  for (const p of hsList) { if (!index.has(p.key)) index.set(p.key, []); index.get(p.key).push(p); }
  let added = 0, kept = 0, filled = 0;
  const unmatched = [], shown = [];
  let prospects = 0;
  for (const { player, teamId, position, prospect } of hsEveryPlayer(data)) {
    const match = prospect ? hsMatchProspect(index, player) : hsMatch(index, player.name, teamId, position);
    const where = prospect ? `${player.year} Draft Pool` : teamId;
    if (!match) { unmatched.push(`${player.name} (${[position, where].filter(Boolean).join(", ")})`); continue; }
    const profile = { ...(player.profile || {}) };
    const own = (profile.photoUrl || profile.photoData) && profile.photoSource !== "import";
    if (own && !replace) kept += 1;
    else {
      profile.photoUrl = match.espnId ? hsEspnPhoto(match.espnId) : hsSleeperPhoto(match.id);
      profile.photoSource = "import";
      delete profile.photoData;
      added += 1;
      if (prospect) prospects += 1;
      if (shown.length < 24) shown.push({ name: player.name, teamId: prospect ? `${player.year} prospect` : teamId, src: profile.photoUrl });
    }
    if (details) {
      if (!prospect && !profile.college && match.college) { profile.college = match.college.slice(0, profileTextLimits.college); filled += 1; }
      if (!profile.height && hsHeightText(match.height)) profile.height = hsHeightText(match.height);
      if (!profile.weight && match.weight >= 100 && match.weight <= 500) profile.weight = Math.round(match.weight);
    }
    player.profile = profile;
  }
  try {
    writeStoredOffice(data);
  } catch (error) {
    hsStatus.textContent = /quota/i.test(`${error.name} ${error.message}`)
      ? "Browser storage is full, so the headshots weren't saved. Nothing was changed."
      : `Couldn't save: ${error.message}. Nothing was changed.`;
    return;
  }
  hsStatus.textContent = `Imported ${added.toLocaleString("en-US")} headshot${added === 1 ? "" : "s"}${prospects ? ` (${prospects.toLocaleString("en-US")} for Draft Pool prospects)` : ""}${kept ? `; kept ${kept} photo${kept === 1 ? "" : "s"} you set yourself` : ""}${details ? `; filled in details for ${filled.toLocaleString("en-US")} player${filled === 1 ? "" : "s"}` : ""}. ${unmatched.length ? `${unmatched.length} not matched (listed below).` : "Every player matched."}`;
  hsShowReport(shown, unmatched);
});

function hsShowReport(shown, unmatched) {
  document.querySelector("#hs-report").hidden = false;
  document.querySelector("#hs-preview").replaceChildren(...shown.map(({ name, teamId, src }) => {
    const card = document.createElement("figure");
    card.className = "hs-card";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.addEventListener("error", () => card.classList.add("is-missing"), { once: true });
    const cap = document.createElement("figcaption");
    cap.textContent = `${name} · ${teamId}`;
    card.append(img, cap);
    return card;
  }));
  document.querySelector("#hs-unmatched-wrap").hidden = !unmatched.length;
  document.querySelector("#hs-unmatched-title").textContent = `Not matched (${unmatched.length})`;
  document.querySelector("#hs-unmatched").replaceChildren(...unmatched.sort().map((text) => Object.assign(document.createElement("li"), { textContent: text })));
}

document.querySelector("#hs-clear").addEventListener("click", async () => {
  if (!(await confirmAction("Remove every imported headshot? Photos you set yourself on a player's page stay.", { confirmLabel: "Remove imported headshots", danger: true }))) return;
  let data;
  try { data = readStoredOffice() || emptyOfficeData(); } catch { hsStatus.textContent = "Saved league data couldn't be read."; return; }
  let removed = 0;
  for (const { player } of hsEveryPlayer(data)) {
    if (player.profile?.photoSource !== "import") continue;
    delete player.profile.photoUrl;
    delete player.profile.photoSource;
    removed += 1;
  }
  try { writeStoredOffice(data); hsStatus.textContent = `Removed ${removed.toLocaleString("en-US")} imported headshot${removed === 1 ? "" : "s"}.`; }
  catch (error) { hsStatus.textContent = `Couldn't save: ${error.message}.`; }
  document.querySelector("#hs-report").hidden = true;
});

// Draft Pool prospects before they're drafted: ESPN college headshots (prospect-headshots.js).
const hsPoolStatus = document.querySelector("#hs-pool-status");
function hsPoolInfo() {
  let data;
  try { data = readStoredOffice() || emptyOfficeData(); } catch { return; }
  const pool = data.draftPool || [];
  const without = pool.filter((p) => !(p.profile?.photoUrl || p.profile?.photoData)).length;
  document.querySelector("#hs-pool-info").textContent = pool.length ? `${pool.length} in the pool, ${without} without a headshot.` : "The Draft Pool is empty.";
}
hsPoolInfo();
document.querySelector("#hs-pool-run").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  let data;
  try { data = readStoredOffice() || emptyOfficeData(); } catch { hsPoolStatus.textContent = "Saved league data couldn't be read."; return; }
  const pool = data.draftPool || [];
  if (!pool.length) { hsPoolStatus.textContent = "The Draft Pool is empty. Add prospects on the Draft page first."; return; }
  button.disabled = true;
  try {
    const result = await findPoolHeadshots(pool, { replace: document.querySelector("#hs-pool-replace").checked,
      onProgress: (done, total) => { hsPoolStatus.textContent = `Searching ESPN… ${done} of ${total}`; } });
    if (!result.checked) { hsPoolStatus.textContent = "Every prospect already has a headshot."; return; }
    if (result.unreachable) { hsPoolStatus.textContent = "ESPN couldn't be reached from this browser, so nothing was found. Try again later."; return; }
    try { data = readStoredOffice() || data; } catch { /* keep the copy above */ }
    const set = applyPoolHeadshots(data, result.found);
    try { writeStoredOffice(data); } catch (error) { hsPoolStatus.textContent = `Couldn't save: ${error.message}.`; return; }
    const miss = result.missing.length;
    hsPoolStatus.textContent = `Found ${set} headshot${set === 1 ? "" : "s"}.${miss ? ` None on ESPN for ${miss}: ${result.missing.slice(0, 12).join(", ")}${miss > 12 ? ", …" : ""}.` : ""}`;
    hsPoolInfo();
  } finally { button.disabled = false; }
});

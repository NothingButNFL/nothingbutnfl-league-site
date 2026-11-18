// Team sheet › Team Actions › Player Ratings: every player on the roster with his Madden overall week by week.
// Click a waiting change to use one of the week's 3 updates on him; "Enter rating changes" turns the cells into inputs
// (and opens a paste box) for typing each week's Madden roster-update changes. Uses front-office.js globals.
const rtTable = document.querySelector("#rt-table");
const rtEditBtn = document.querySelector("#rt-edit");
const rtStatus = document.querySelector("#rt-status");
let rtEditing = false;

const rtSeason = () => (seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0]);
const rtRoster = () => officeData.teams[activeTeamId].roster.filter((p) => isPlayerOnSeason(p, rtSeason()) && !isRetiredPlayer(p));
const rtSigned = (v) => (v > 0 ? `+${v}` : String(v));

// Weeks shown: through the latest week with anything entered, plus the next one (all 18 while entering changes).
function rtWeeksShown() {
  return rtEditing ? ratingWeeks : Math.min(ratingWeeks, Math.max(1, ratingLatestWeek(officeData, rtSeason()) + 1));
}

function rtSave(message) {
  saveOfficeData();
  rtStatus.textContent = message || "";
  renderRatings();
}

function rtCellTitle(player, row, picked) {
  const bits = [];
  if (row.change) bits.push(`${ratingWeekLabel(row.week)}: ${rtSigned(row.change)}${row.note ? ` (${row.note})` : ""}`);
  if (row.state === "elected") bits.push("Applied by an update the team picked.");
  else if (row.state === "auto") bits.push("Applied automatically (a change of 3 or more).");
  else if (row.state === "pending") bits.push("Waiting to be applied.");
  if (picked) bits.push(`Picked to update in ${ratingWeekLabel(row.week)}.`);
  if (row.overall !== null) bits.push(`League overall after ${ratingWeekLabel(row.week)}: ${row.overall}${row.pending ? ` (Madden ${row.madden}, ${rtSigned(row.pending)} waiting)` : ""}`);
  return bits.join("\n");
}

function renderRatings() {
  if (!rtTable) return;
  const season = rtSeason();
  const weeks = rtWeeksShown();
  const latest = ratingLatestWeek(officeData, season);
  rtEditBtn.setAttribute("aria-pressed", String(rtEditing));
  rtEditBtn.textContent = rtEditing ? "Done entering changes" : "Enter rating changes";
  document.querySelector("#rt-paste").hidden = !rtEditing;
  const pasteCol = document.querySelector("#rt-paste-col");
  if (pasteCol.options.length !== ratingWeeks + 1) {
    pasteCol.replaceChildren(new Option("Starting overall", "0"), ...Array.from({ length: ratingWeeks }, (_, i) => new Option(`${ratingWeekLabel(i + 1)} change`, String(i + 1))));
    pasteCol.value = String(Math.min(ratingWeeks, latest));
  }

  rtRenderLock(season, latest);
  const players = rtRoster().map((p) => ({ p, rows: ratingTimeline(officeData, season, p.id), pos: seasonEntry(p, season).position || "" }));
  const nowWeek = Math.max(0, latest);
  players.sort((a, b) => (b.rows[nowWeek].overall ?? -1) - (a.rows[nowWeek].overall ?? -1) || a.p.name.localeCompare(b.p.name));

  const thead = rtTable.createTHead();
  thead.replaceChildren();
  const hr = thead.insertRow();
  const th = (text, cls = "") => { const c = document.createElement("th"); c.scope = "col"; c.textContent = text; if (cls) c.className = cls; hr.append(c); return c; };
  th("POS", "rt-pos"); th("PLAYER", "rt-name"); th("START", "rt-num"); th("OVERALL", "rt-num rt-overall");
  for (let w = 1; w <= weeks; w += 1) {
    const c = th((w > regularSeasonWeeks ? ["WILD CARD", "DIVISIONAL", "CONF CHAMP", "SUPER BOWL"][w - regularSeasonWeeks - 1] : ratingWeekLabel(w)).toUpperCase(), "rt-week");
    const used = ratingTeamPicks(officeData, season, activeTeamId, w).length;
    const count = document.createElement("span");
    count.className = `rt-used${used >= ratingUpgradesPerWeek ? " is-full" : ""}`;
    count.textContent = `${used}/${ratingUpgradesPerWeek}`;
    count.title = `${used} of ${ratingUpgradesPerWeek} updates used in ${ratingWeekLabel(w)}`;
    if (upgradeLockFor(officeData, season, activeTeamId, w)) { count.textContent = `🔒 ${count.textContent}`; count.title += " · locked in"; count.classList.add("is-locked"); }
    c.append(count);
  }

  const tbody = rtTable.tBodies[0] || rtTable.createTBody();
  tbody.replaceChildren(...players.map(({ p, rows, pos }) => {
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    tr.insertCell().textContent = pos || "—";
    const name = tr.insertCell();
    name.className = "rt-name";
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(p.id);
    link.textContent = p.name;
    name.append(link);
    const start = tr.insertCell();
    start.className = "rt-num";
    if (rtEditing) start.append(rtInput(rows[0].overall, `${p.name} starting overall`, p.id, 0));
    else start.textContent = rows[0].overall ?? "—";
    const overall = tr.insertCell();
    overall.className = "rt-num rt-overall";
    overall.textContent = rows[nowWeek].overall ?? "—";
    if (rows[nowWeek].pending) overall.title = `Madden ${rows[nowWeek].madden} · ${rtSigned(rows[nowWeek].pending)} waiting`;
    const picksByWeek = (w) => ratingTeamPicks(officeData, season, activeTeamId, w).includes(p.id);
    for (let w = 1; w <= weeks; w += 1) {
      const row = rows[w];
      const cell = tr.insertCell();
      cell.className = "rt-cell";
      const picked = picksByWeek(w);
      if (rtEditing) {
        cell.append(rtInput(row.change || "", `${p.name} ${ratingWeekLabel(w)} change`, p.id, w));
        continue;
      }
      const kind = !row.change ? "" : row.state === "pending" ? (row.change > 0 ? "is-pending" : "is-pending-down")
        : row.change < 0 ? "is-down" : row.state === "auto" ? "is-auto" : "is-elected";
      if (kind) cell.classList.add(kind);
      if (picked) cell.classList.add("is-picked");
      // Pickable while he has a net upgrade waiting in that week (what's waiting from before + this week's change).
      const weekFull = ratingTeamPicks(officeData, season, activeTeamId, w).length >= ratingUpgradesPerWeek;
      const locked = Boolean(upgradeLockFor(officeData, season, activeTeamId, w));
      const canPick = !locked && (picked || (!weekFull && row.overall !== null && rows[w - 1].pending + row.change > 0));
      const label = row.change ? rtSigned(row.change) : "0";
      if (canPick && storageIsAvailable && Math.abs(row.change) < ratingAutoThreshold) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rt-pick";
        cell.classList.add("can-pick");
        b.dataset.week = String(w);
        b.textContent = label;
        b.setAttribute("aria-pressed", String(picked));
        b.setAttribute("aria-label", `${p.name} ${ratingWeekLabel(w)}: ${label}. ${picked ? "Picked to update; click to undo." : "Click to update him this week."}`);
        cell.append(b);
      } else cell.textContent = label;
      if (row.note) cell.classList.add("has-note");
      cell.title = rtCellTitle(p, row, picked);
    }
    return tr;
  }));
  if (!players.length) {
    const tr = tbody.insertRow();
    const c = tr.insertCell();
    c.colSpan = weeks + 4;
    c.className = "empty-state";
    c.textContent = `No players on the ${season} sheet.`;
  }
}

function rtInput(value, label, playerId, week) {
  const input = document.createElement("input");
  input.type = "number";
  input.className = "rt-input";
  input.value = value === null || value === undefined ? "" : String(value);
  input.min = week ? "-99" : "0";
  input.max = "99";
  input.step = "1";
  input.dataset.playerId = playerId;
  input.dataset.week = String(week);
  input.setAttribute("aria-label", label);
  return input;
}

// Saves one typed value: week 0 = starting overall, otherwise that week's change.
function rtSetValue(playerId, week, raw) {
  const season = rtSeason();
  const text = String(raw).trim();
  const value = text === "" ? null : Math.round(Number(text));
  if (value !== null && (!Number.isFinite(value) || (week === 0 ? value < 0 || value > 99 : Math.abs(value) > 99))) return false;
  const r = ratingRecord(officeData, season, playerId, true);
  if (week === 0) { if (value === null) delete r.base; else r.base = value; }
  else {
    r.d ||= {};
    if (!value) delete r.d[week]; else r.d[week] = value;
  }
  return true;
}

rtTable?.addEventListener("click", (event) => {
  const b = event.target.closest(".rt-pick");
  if (!b) return;
  const playerId = b.closest("tr").dataset.playerId;
  const week = Number(b.dataset.week);
  const player = officeData.teams[activeTeamId].roster.find((p) => p.id === playerId);
  const wasPicked = ratingTeamPicks(officeData, rtSeason(), activeTeamId, week).includes(playerId);
  const problem = toggleRatingUpgrade(officeData, rtSeason(), activeTeamId, playerId, week);
  if (problem) { rtStatus.textContent = `${player?.name}: ${problem}`; return; }
  rtSave(`${player?.name} ${wasPicked ? "is no longer picked" : "will be updated"} in ${ratingWeekLabel(week)}.`);
});

rtTable?.addEventListener("change", (event) => {
  const input = event.target.closest(".rt-input");
  if (!input) return;
  if (!rtSetValue(input.dataset.playerId, Number(input.dataset.week), input.value)) { rtStatus.textContent = "Enter a whole number (starting overalls 0–99)."; return; }
  saveOfficeData();
  rtStatus.textContent = "Saved.";
});

rtEditBtn?.addEventListener("click", () => { rtEditing = !rtEditing; rtStatus.textContent = ""; renderRatings(); });

// Paste: "Name, number[, note]" per line (commas or tabs), into the starting overall or one week's change.
document.querySelector("#rt-paste-go")?.addEventListener("click", () => {
  const week = Number(document.querySelector("#rt-paste-col").value);
  const lines = document.querySelector("#rt-paste-text").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const roster = rtRoster();
  // "Last, First" or "First Last", any case or punctuation: compare the name's words in sorted order.
  const key = (n) => String(n).toLowerCase().normalize("NFD").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  let done = 0;
  const missed = [];
  for (const line of lines) {
    const parts = line.includes("\t") ? line.split("\t") : line.split(",");
    const numAt = parts.findIndex((x, i) => i > 0 && /^\s*[+-]?\d+\s*$/.test(x));
    if (numAt < 1) { missed.push(line); continue; }
    const name = parts.slice(0, numAt).join(" ").trim();
    const player = roster.find((p) => key(p.name) === key(name)) || roster.find((p) => key(p.name).includes(key(name)) || key(name).includes(key(p.name)));
    if (!player || !rtSetValue(player.id, week, parts[numAt])) { missed.push(name || line); continue; }
    const note = parts.slice(numAt + 1).join(",").trim();
    if (week && note) { const r = ratingRecord(officeData, rtSeason(), player.id, true); (r.n ||= {})[week] = note.slice(0, 300); }
    done += 1;
  }
  saveOfficeData();
  document.querySelector("#rt-paste-note").textContent = `${done} player${done === 1 ? "" : "s"} updated${missed.length ? `; not matched: ${missed.slice(0, 8).join(", ")}${missed.length > 8 ? "…" : ""}` : ""}.`;
  if (done) document.querySelector("#rt-paste-text").value = "";
  renderRatings();
});

// "Lock in upgrades": freezes the team's picks for a week and sends them to Admin › Stream Updates › Player Upgrades.
const rtLockWeek = document.querySelector("#rt-lock-week");
const rtLockBtn = document.querySelector("#rt-lock");
function rtRenderLock(season, latest) {
  if (!rtLockWeek) return;
  const keep = rtLockWeek.value;
  const last = Math.min(ratingWeeks, Math.max(1, latest));
  rtLockWeek.replaceChildren(...Array.from({ length: last }, (_, i) => last - i).map((w) => new Option(ratingWeekLabel(w), String(w))));
  rtLockWeek.value = keep && Number(keep) <= last ? keep : String(last);
  const week = Number(rtLockWeek.value);
  const lock = upgradeLockFor(officeData, season, activeTeamId, week);
  const picks = ratingTeamPicks(officeData, season, activeTeamId, week).length;
  rtLockBtn.disabled = Boolean(lock) || !storageIsAvailable;
  rtLockBtn.textContent = lock ? `🔒 ${ratingWeekLabel(week)} locked in` : `Lock in ${ratingWeekLabel(week)} upgrades (${picks}/${ratingUpgradesPerWeek})`;
}
rtLockWeek?.addEventListener("change", () => renderRatings());
rtLockBtn?.addEventListener("click", async () => {
  const season = rtSeason();
  const week = Number(rtLockWeek.value);
  const picks = ratingTeamPicks(officeData, season, activeTeamId, week).length;
  const message = `Lock in ${picks ? `these ${picks} upgrade${picks === 1 ? "" : "s"}` : "no upgrades"} for ${ratingWeekLabel(week)}? The commissioner gets them for the stream, and they can't be changed unless the commissioner unlocks them.`;
  if (!await confirmAction(message, { confirmLabel: "Lock in" })) return;
  const result = lockRatingUpgrades(officeData, season, activeTeamId, week);
  if (result.error) { rtStatus.textContent = result.error; return; }
  rtSave(`${ratingWeekLabel(week)} upgrades locked in and sent to the commissioner's stream updates.`);
});

globalThis.renderRatings = renderRatings;
if (typeof activeTab !== "undefined" && activeTab === "ratings") renderRatings(); // opened straight to #ratings

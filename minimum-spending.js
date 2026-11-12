// Season Information › Minimum Spending Window (Article 8, Minimum Spending Floor). Every team's rostered cap spending
// as a share of its cap space for each league year: years entered by hand (before the salary sheets) and the site's
// seasons up to the current league year, worked out live from the sheets. Below 76.5% is short, with the Section 4
// penalty. Also each team's dead cap, which doesn't count. Uses league-core.js and teams.js.
let officeData = emptyOfficeData();
let msfCanSave = true;
try { officeData = readStoredOffice() || emptyOfficeData(); } catch { msfCanSave = false; }

const msfEl = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const msfYearLabel = (y) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
const msfPct = (v) => `${v.toFixed(2)}%`;

// The compliance window on screen (its first league year): the current one unless another is picked.
let msfWindow = spendingWindowFor(currentLeagueYear());
const msfWindowYears = (start) => Array.from({ length: spendingWindowYears }, (_, i) => start + i);
const msfWindowLabel = (start) => `${msfYearLabel(start)} to ${msfYearLabel(start + spendingWindowYears - 1)}`;
// Windows with any data: entered years, plus the site's seasons through the current league year.
function msfWindows() {
  const now = currentLeagueYear();
  const set = new Set([spendingWindowFor(now)]);
  for (const y of Object.keys(officeData.spendingHistory || {}).map(Number)) if (y >= spendingWindowStart) set.add(spendingWindowFor(y));
  return [...set].filter((w) => w <= now).sort((a, b) => a - b);
}
function msfTeamCell(id) {
  const td = msfEl("td", "msf-team");
  const pal = typeof teamThemePalettes === "object" ? teamThemePalettes[id] : null;
  const tag = msfEl("a", "msf-team-tag", id);
  tag.href = `team.html?team=${encodeURIComponent(id)}`;
  tag.title = teamName(id);
  if (pal) { tag.style.background = pal[0]; tag.style.color = pal[1]; }
  td.append(tag);
  return td;
}

function msfRender() {
  const now = currentLeagueYear();
  const windows = msfWindows();
  if (!windows.includes(msfWindow)) msfWindow = windows[windows.length - 1];
  const years = msfWindowYears(msfWindow);
  const windowDone = msfWindow + spendingWindowYears - 1 < now;
  document.querySelector("#msf-window-label").textContent = `${windowDone ? "WINDOW" : "CURRENT WINDOW"} · ${msfWindowLabel(msfWindow)}`;
  const tabs = document.querySelector("#msf-windows");
  tabs.hidden = windows.length < 2;
  tabs.replaceChildren(...windows.map((w) => {
    const b = msfEl("button", `tab-button${w === msfWindow ? " is-active" : ""}`, msfWindowLabel(w));
    b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-selected", String(w === msfWindow));
    b.addEventListener("click", () => { msfWindow = w; msfRender(); });
    return b;
  }));
  const head = document.querySelector("#msf-head");
  head.replaceChildren(msfEl("th", "", "TEAM"), ...years.map((y) => {
    const th = msfEl("th", "", msfYearLabel(y));
    if (y === now) { th.append(msfEl("small", "msf-live", "LIVE")); th.title = "Current league year: live from the salary sheets"; }
    else if (y > now) { th.append(msfEl("small", "msf-live is-later", "TO COME")); }
    return th;
  }), msfEl("th", "", "WINDOW AVG"), msfEl("th", "msf-status-h", "STATUS"));
  const sums = Object.fromEntries(years.map((y) => [y, []]));
  const all = [];
  const rows = nflTeams.map(({ id }) => {
    const tr = document.createElement("tr");
    tr.append(msfTeamCell(id));
    const values = [];
    for (const y of years) {
      const s = spendingFor(officeData, id, y);
      const td = tr.insertCell();
      if (!s || y > now) { td.textContent = "—"; td.className = "msf-none"; td.title = y > now ? "This league year hasn't started." : seasons.includes(y) ? `Set the ${y} base cap in Admin to work this out.` : "Not entered (Commissioner › Past league years)"; continue; }
      values.push(s.pct); sums[y].push(s.pct);
      const short = s.pct < spendingFloorPct;
      td.textContent = msfPct(s.pct);
      td.className = `msf-cell ${short ? "is-short" : "is-ok"}${y === now ? " is-live" : ""}`;
      td.title = s.source === "sheets"
        ? `${teamName(id)} ${msfYearLabel(y)}: ${formatCurrency(s.spent)} in rostered cap hits of ${formatCurrency(s.cap)} cap space${short ? ` · ${(spendingFloorPct - s.pct).toFixed(2)}% short` : ""}`
        : `${teamName(id)} ${msfYearLabel(y)}: entered by the commissioner${short ? ` · ${(spendingFloorPct - s.pct).toFixed(2)}% short` : ""}`;
    }
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    if (avg !== null) all.push(avg);
    const a = tr.insertCell();
    a.textContent = avg === null ? "—" : msfPct(avg);
    a.className = `msf-avg${avg !== null && avg < spendingFloorPct ? " is-short" : ""}`;
    // Status: the window average against the floor (the window is judged as a whole); a repeat when the team also
    // missed the previous window.
    const st = tr.insertCell();
    st.className = "msf-status";
    if (avg !== null) {
      const shortfall = spendingFloorPct - avg;
      const prev = msfWindow - spendingWindowYears;
      const prevVals = msfWindowYears(prev).map((y) => spendingFor(officeData, id, y)).filter(Boolean).map((v) => v.pct);
      const prevShort = prevVals.length && prevVals.reduce((a, b) => a + b, 0) / prevVals.length < spendingFloorPct;
      if (shortfall > 0) {
        const pick = prevShort ? "1st-round pick + next year's 3rd (repeat)" : spendingPenalty(shortfall);
        st.append(msfEl("b", "msf-flag is-short", windowDone ? "MISSED" : "ON PACE TO MISS"), ` ${shortfall.toFixed(2)}% short · ${pick}`);
      } else st.append(msfEl("b", "msf-flag is-ok", windowDone ? "MET" : "ON PACE"), ` ${(avg - spendingFloorPct).toFixed(2)}% above`);
    }
    return tr;
  });
  document.querySelector("#msf-rows").replaceChildren(...rows);
  const foot = document.querySelector("#msf-foot");
  const avgRow = document.createElement("tr");
  avgRow.append(msfEl("th", "", "Average"), ...years.map((y) => msfEl("td", "", sums[y].length ? msfPct(sums[y].reduce((a, b) => a + b, 0) / sums[y].length) : "—")),
    msfEl("td", "", all.length ? msfPct(all.reduce((a, b) => a + b, 0) / all.length) : "—"), msfEl("td", "", ""));
  const minRow = document.createElement("tr");
  minRow.className = "msf-min";
  const minCell = msfEl("td", "", `${spendingFloorPct}%`);
  minCell.colSpan = years.length + 2;
  minRow.append(msfEl("th", "", "Minimum"), minCell);
  foot.replaceChildren(avgRow, minRow);

  // Dead cap: this league year and next.
  const deadYears = [now, now + 1].filter((y) => seasons.includes(y));
  document.querySelector("#msf-dead-head").replaceChildren(msfEl("th", "", "TEAM"), ...deadYears.map((y) => msfEl("th", "", String(y))));
  document.querySelector("#msf-dead-rows").replaceChildren(...nflTeams.map(({ id }) => {
    const tr = document.createElement("tr");
    tr.append(msfTeamCell(id));
    for (const y of deadYears) tr.insertCell().textContent = formatCurrency(seasonCapFigures(id, y, officeData).deadCap);
    return tr;
  }));
}

// ---- Commissioner: past league years ----
function msfTeamFrom(text) {
  const t = String(text || "").trim().toLowerCase();
  const hit = nflTeams.find(({ id, name }) => id.toLowerCase() === t || name.toLowerCase() === t || name.toLowerCase().endsWith(` ${t}`));
  return hit ? hit.id : null;
}
document.querySelector("#msf-save").addEventListener("click", () => {
  const status = document.querySelector("#msf-status");
  if (!msfCanSave) { status.textContent = "Saved league data couldn't be read, so nothing can be saved here."; return; }
  const lines = document.querySelector("#msf-paste").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const split = (l) => (l.includes("\t") ? l.split("\t") : l.split(/,(?!\d{3}\b)/)).map((c) => c.trim());
  const header = lines.length ? split(lines[0]) : [];
  const years = header.slice(1).map((c) => Number((c.match(/(19|20)\d{2}/) || [])[0]));
  if (!years.length || years.some((y) => !y)) { status.textContent = "Start with a header row of league years, like: Team, 2024-25, 2025-26"; return; }
  const add = {};
  const skipped = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const id = msfTeamFrom(cells[0]);
    if (!id) { if (!/^(average|minimum)/i.test(cells[0])) skipped.push(cells[0]); continue; }
    years.forEach((y, i) => {
      const v = Number(String(cells[i + 1] ?? "").replace(/[%\s]/g, ""));
      if (cells[i + 1] !== undefined && cells[i + 1] !== "" && Number.isFinite(v) && v >= 0 && v <= 500) (add[y] ||= {})[id] = Math.round(v * 100) / 100;
    });
  }
  const count = Object.values(add).reduce((n, row) => n + Object.keys(row).length, 0);
  if (!count) { status.textContent = "No team percentages were found under the header row."; return; }
  const history = JSON.parse(JSON.stringify(officeData.spendingHistory || {}));
  for (const [y, row] of Object.entries(add)) history[y] = { ...(history[y] || {}), ...row };
  officeData.spendingHistory = history;
  try { writeStoredOffice(officeData); } catch (error) { status.textContent = `Could not save: ${error.message}.`; return; }
  document.querySelector("#msf-paste").value = "";
  status.textContent = `Saved ${count} percentage${count === 1 ? "" : "s"} for ${Object.keys(add).map((y) => msfYearLabel(Number(y))).join(", ")}.${skipped.length ? ` Skipped (team not recognized): ${skipped.join(", ")}.` : ""}`;
  msfRender();
});
document.querySelector("#msf-clear").addEventListener("click", async () => {
  const status = document.querySelector("#msf-status");
  if (!officeData.spendingHistory || !Object.keys(officeData.spendingHistory).length) { status.textContent = "There are no past years entered."; return; }
  if (!(await confirmAction("Clear every league year entered by hand? Years worked out from the salary sheets stay.", { confirmLabel: "Clear past years", danger: true }))) return;
  delete officeData.spendingHistory;
  try { writeStoredOffice(officeData); } catch (error) { status.textContent = `Could not save: ${error.message}.`; return; }
  status.textContent = "Past league years cleared.";
  msfRender();
});
window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try { officeData = readStoredOffice() || emptyOfficeData(); msfRender(); } catch { /* keep the last view */ }
});
msfRender();

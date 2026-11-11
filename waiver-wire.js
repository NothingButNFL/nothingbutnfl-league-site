// Waiver Wire (Front Office). Players a team releases (fewer than 4 accrued seasons) sit here for 24 hours;
// teams put in claims and the claim from the team highest in the waiver order wins. Logic lives in league-core.js
// (releaseToWaiversOrFreeAgency, waiverPriority, processWaiver).
const wwStatus = document.querySelector("#ww-status");
const wwNotice = document.querySelector("#ww-notice");
const wwOpen = document.querySelector("#ww-open");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  wwNotice.hidden = false;
  wwNotice.textContent = error instanceof SyntaxError
    ? "Saved league data could not be read, so claims can't be saved. It has not been overwritten."
    : `${error.message || "Browser storage is unavailable."} Claims can't be saved.`;
}
if (!Array.isArray(officeData.waivers)) officeData.waivers = [];

const wwEl = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };

function wwSave(message) {
  try {
    writeStoredOffice(officeData);
    wwStatus.textContent = message;
    return true;
  } catch (error) {
    wwStatus.textContent = `Could not save: ${error.message}. Nothing was changed.`;
    officeData = readStoredOffice() || emptyOfficeData();
    if (!Array.isArray(officeData.waivers)) officeData.waivers = [];
    return false;
  }
}

function wwLogo(teamId) {
  const team = nflTeams.find(({ id }) => id === teamId);
  const wrap = wwEl("span", "leader-logo");
  if (!team) return wrap;
  const img = document.createElement("img");
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => { img.remove(); wrap.textContent = teamId; }, { once: true });
  wrap.append(img);
  return wrap;
}

function wwTimeLeft(entry) {
  const ms = Date.parse(entry.clearsAt) - Date.now();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}

function wwCard(entry, order) {
  const card = wwEl("article", "management-panel ww-card");
  card.dataset.waiver = entry.id;
  // Head: photo, name, position / experience, waived by
  const head = wwEl("div", "ww-card-head");
  const photo = wwEl("span", "ww-photo");
  const src = entry.profile ? profilePhotoSrc(playerProfile({ profile: entry.profile })) : "";
  if (src) { const img = document.createElement("img"); img.src = src; img.alt = ""; img.addEventListener("error", () => { img.remove(); photo.append(wwLogo(entry.fromTeam)); }, { once: true }); photo.append(img); }
  else photo.append(wwLogo(entry.fromTeam));
  const who = wwEl("div", "ww-who");
  who.append(wwEl("strong", "ww-name", entry.playerName));
  const meta = [entry.position, entry.experience === null || entry.experience === undefined ? "" : `${entry.experience} accrued season${entry.experience === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
  if (meta) who.append(wwEl("span", "ww-meta", meta));
  const by = wwEl("span", "ww-by");
  by.append("Waived by ", wwLogo(entry.fromTeam), ` ${teamName(entry.fromTeam)}`);
  who.append(by);
  const left = wwTimeLeft(entry);
  const clock = wwEl("span", `ww-clock${left ? "" : " is-ready"}`, left ? `Clears in ${left}` : "Waiver period over");
  clock.title = `Released ${new Date(entry.releasedAt).toLocaleString()} · clears ${new Date(entry.clearsAt).toLocaleString()}`;
  head.append(photo, who, clock);

  // Contract a claiming team takes on
  const contract = wwEl("div", "ww-contract");
  const rows = entry.seasons.filter((s) => s.baseSalary || s.rosterBonus);
  if (rows.length) {
    const table = wwEl("table", "ww-contract-table");
    const thead = table.createTHead().insertRow();
    for (const label of ["SEASON", "BASE", "ROSTER BONUS", "CAP HIT", "GUARANTEED"]) thead.append(wwEl("th", "", label));
    const body = table.createTBody();
    for (const s of rows) {
      const tr = body.insertRow();
      for (const v of [String(s.year), formatCurrency(s.baseSalary), formatCurrency(s.rosterBonus), formatCurrency(s.baseSalary + s.rosterBonus), formatCurrency(s.guaranteedSalary)]) tr.insertCell().textContent = v;
    }
    contract.append(wwEl("p", "ww-contract-note", "A claiming team takes on this contract. His prorated signing bonus stays on the old team's books."), table);
  } else contract.append(wwEl("p", "ww-contract-note", "No salary left on his contract."));

  // Claims, in waiver order
  const claimsBox = wwEl("div", "ww-claims");
  const sorted = [...entry.claims].sort((a, b) => order.indexOf(a.teamId) - order.indexOf(b.teamId));
  claimsBox.append(wwEl("h4", "", `Claims (${sorted.length})`));
  if (sorted.length) {
    const list = wwEl("ol", "ww-claim-list");
    sorted.forEach((c, i) => {
      const li = wwEl("li", i === 0 ? "is-leading" : "");
      li.append(wwEl("b", "ww-claim-rank", `#${order.indexOf(c.teamId) + 1}`), wwLogo(c.teamId), wwEl("span", "", teamName(c.teamId)));
      if (i === 0) li.append(wwEl("small", "ww-lead-tag", "LEADING"));
      const remove = wwEl("button", "ww-claim-remove", "×");
      remove.type = "button";
      remove.dataset.action = "withdraw";
      remove.dataset.team = c.teamId;
      remove.title = `Withdraw ${c.teamId}'s claim`;
      remove.setAttribute("aria-label", remove.title);
      remove.disabled = !canSave;
      li.append(remove);
      list.append(li);
    });
    claimsBox.append(list);
  } else claimsBox.append(wwEl("p", "ww-no-claims", "No claims yet."));
  // Put in a claim
  const form = wwEl("div", "ww-claim-form");
  const select = document.createElement("select");
  select.className = "ww-team-select";
  select.setAttribute("aria-label", `Team claiming ${entry.playerName}`);
  select.append(new Option("Choose your team", ""), ...order.filter((id) => id !== entry.fromTeam && !entry.claims.some((c) => c.teamId === id))
    .map((id) => new Option(`#${order.indexOf(id) + 1} · ${teamName(id)}`, id)));
  const claim = wwEl("button", "button button-lime", "Put in claim");
  claim.type = "button";
  claim.dataset.action = "claim";
  claim.disabled = !canSave;
  form.append(select, claim);
  claimsBox.append(form);

  // Commissioner
  const admin = wwEl("div", "ww-admin");
  const process = wwEl("button", "workspace-button", sorted.length ? `Award to ${sorted[0].teamId}` : "Clear to free agency");
  process.type = "button";
  process.dataset.action = "process";
  process.disabled = !canSave;
  process.title = left ? `The waiver period has ${left} left. You can still process it now.` : "";
  const cancel = wwEl("button", "workspace-button ww-cancel", "Remove from wire");
  cancel.type = "button";
  cancel.dataset.action = "remove";
  cancel.disabled = !canSave;
  cancel.title = "Takes him off waivers without sending him anywhere (e.g. the release was a mistake).";
  admin.append(wwEl("span", "panel-index", "COMMISSIONER"), process, cancel);

  card.append(head, contract, claimsBox, admin);
  return card;
}

function wwRender() {
  const order = waiverPriority(officeData).map(({ id }) => id);
  const open = openWaivers(officeData).sort((a, b) => Date.parse(a.clearsAt) - Date.parse(b.clearsAt));
  wwOpen.replaceChildren(...open.map((entry) => wwCard(entry, order)));
  document.querySelector("#ww-empty").hidden = open.length > 0;
  const expired = open.filter((w) => waiverExpired(w));
  const all = document.querySelector("#ww-process-all");
  all.hidden = !expired.length || !canSave;
  all.textContent = `Process all expired waivers (${expired.length})`;

  // Waiver order
  const claimsFor = new Map();
  for (const w of open) for (const c of w.claims) claimsFor.set(c.teamId, (claimsFor.get(c.teamId) || 0) + 1);
  document.querySelector("#ww-order").replaceChildren(...waiverPriority(officeData).map(({ id, record }) => {
    const li = wwEl("li");
    li.append(wwLogo(id), wwEl("span", "ww-order-team", teamName(id)), wwEl("span", "ww-order-record", `${record.w}-${record.l}${record.t ? `-${record.t}` : ""}`));
    if (claimsFor.get(id)) li.append(wwEl("small", "ww-order-claims", `${claimsFor.get(id)} claim${claimsFor.get(id) === 1 ? "" : "s"}`));
    return li;
  }));

  // History
  const done = officeData.waivers.filter((w) => w.status === "claimed" || w.status === "cleared")
    .sort((a, b) => String(b.processedAt).localeCompare(String(a.processedAt))).slice(0, 25);
  const history = document.querySelector("#ww-history");
  history.replaceChildren(...done.map((w) => {
    const li = wwEl("li", `is-${w.status}`);
    li.append(wwLogo(w.status === "claimed" ? w.awardedTo : w.fromTeam));
    const text = wwEl("span");
    text.append(wwEl("b", "", w.playerName), w.position ? ` (${w.position})` : "",
      w.status === "claimed" ? ` claimed by ${teamName(w.awardedTo)} from ${w.fromTeam}` : ` cleared waivers (released by ${w.fromTeam}) · free agent`);
    li.append(text, wwEl("small", "", w.processedAt ? new Date(w.processedAt).toLocaleDateString() : ""));
    return li;
  }));
  if (!done.length) history.append(wwEl("li", "ww-none", "No waiver results yet."));
}

wwOpen.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const card = button?.closest("[data-waiver]");
  if (!button || !card || !canSave) return;
  const entry = officeData.waivers.find((w) => w.id === card.dataset.waiver && w.status === "open");
  if (!entry) return;
  const action = button.dataset.action;
  if (action === "claim") {
    const teamId = card.querySelector(".ww-team-select").value;
    if (!teamId) { wwStatus.textContent = "Choose the team putting in the claim."; card.querySelector(".ww-team-select").focus(); return; }
    entry.claims.push({ teamId, at: new Date().toISOString() });
    const order = waiverPriority(officeData).map(({ id }) => id);
    wwSave(`${teamName(teamId)} put in a claim for ${entry.playerName} (#${order.indexOf(teamId) + 1} in the waiver order).`);
  } else if (action === "withdraw") {
    entry.claims = entry.claims.filter((c) => c.teamId !== button.dataset.team);
    wwSave(`${teamName(button.dataset.team)} withdrew their claim for ${entry.playerName}.`);
  } else if (action === "process") {
    const left = wwTimeLeft(entry);
    const leader = [...entry.claims].sort((a, b) => { const o = waiverPriority(officeData).map(({ id }) => id); return o.indexOf(a.teamId) - o.indexOf(b.teamId); })[0];
    const what = leader ? `Award ${entry.playerName} to the ${teamName(leader.teamId)}? He goes on their salary sheet with his remaining contract.` : `No team claimed ${entry.playerName}. Clear him to free agency?`;
    if (!await confirmAction(`${what}${left ? ` His waiver period still has ${left} left.` : ""}`, { confirmLabel: leader ? `Award to ${leader.teamId}` : "Clear to free agency" })) return;
    wwSave(processWaiver(officeData, entry));
  } else if (action === "remove") {
    if (!await confirmAction(`Take ${entry.playerName} off waivers? He won't go to any team or to free agency. His release (and its dead cap) stays recorded.`, { confirmLabel: "Remove from wire", danger: true })) return;
    entry.status = "removed";
    entry.processedAt = new Date().toISOString();
    wwSave(`${entry.playerName} was taken off waivers.`);
  }
  wwRender();
});

document.querySelector("#ww-process-all").addEventListener("click", async () => {
  const expired = openWaivers(officeData).filter((w) => waiverExpired(w));
  if (!expired.length || !canSave) return;
  if (!await confirmAction(`Process ${expired.length} expired waiver${expired.length === 1 ? "" : "s"}? Each goes to the claiming team highest in the waiver order, or clears to free agency.`, { confirmLabel: "Process all" })) return;
  const messages = expired.map((w) => processWaiver(officeData, w));
  wwSave(messages.join(" "));
  wwRender();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    if (!Array.isArray(officeData.waivers)) officeData.waivers = [];
    wwRender();
  } catch { wwStatus.textContent = "An update from another tab could not be read."; }
});

// Keep the countdowns current.
// Skipped while someone is choosing a team, so a half-made claim isn't wiped.
setInterval(() => {
  const busy = wwOpen.contains(document.activeElement) || [...wwOpen.querySelectorAll(".ww-team-select")].some((s) => s.value) || document.querySelector("dialog[open]");
  if (!document.hidden && !busy) wwRender();
}, 60000);
wwRender();

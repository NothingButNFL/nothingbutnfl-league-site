// Admin › Extension Offers. Offers live in officeData.extensionOffers (league-core.js); approving one applies it
// with applyExtension (new seasons on the salary sheet, void dead cap, Transaction Log).
const exaPending = document.querySelector("#rsa-pending");
const exaStatus = document.querySelector("#rsa-status");
const exaNotice = document.querySelector("#rsa-storage-notice");
const exaFilterTeam = document.querySelector("#rsa-filter-team");
const exaFilterStatus = document.querySelector("#rsa-filter-status");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  exaNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const signedMoney = (v) => v < 0 ? `−${formatCurrency(Math.abs(v))}` : formatCurrency(v);
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };
const playerFor = (o) => officeData.teams[o.teamId]?.roster.find((p) => p.id === o.playerId) || null;

function problemWith(o) {
  const player = playerFor(o);
  if (!player) return `${o.playerName} is no longer on the ${o.teamId} salary sheet.`;
  if (!isExtensionEligible(player)) return `${o.playerName} already has seasons after this one on his sheet.`;
  return minimumProblem(officeData, player, o, o.startYear);
}

function contractTable(o) {
  const table = el("table", "fao-contract");
  const head = table.createTHead().insertRow();
  for (const label of ["AGE", "YEAR", "BASE SALARY", "SIGNING BONUS", "ROSTER BONUS", "GTD SALARY", "CAP HIT"]) head.append(el("th", "", label));
  const body = table.createTBody();
  // His age each season: today's age, plus one for each season after the current one.
  const player = playerFor(o);
  const age = player ? playerAge(player) : null;
  const nowYear = seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
  for (const r of contractSeasonBreakdown(o, o.startYear)) {
    const tr = body.insertRow();
    tr.insertCell().textContent = age === null ? "—" : String(age + r.year - nowYear);
    tr.insertCell().textContent = String(r.year);
    for (const v of [r.baseSalary, r.proratedBonus, r.rosterBonus || 0, r.guaranteedSalary, breakdownCapHit(r)]) tr.insertCell().textContent = formatCurrency(v);
  }
  const voided = voidBonusFor(o, o.startYear);
  if (voided) {
    const tr = body.insertRow();
    tr.className = "fao-void-note";
    const cell = tr.insertCell();
    cell.colSpan = 7;
    cell.textContent = `${formatCurrency(voided.amount)} on ${voided.voidYears} void year${voided.voidYears === 1 ? "" : "s"} becomes ${voided.year} dead cap after his final season.`;
  }
  return table;
}

function render() {
  const pending = pendingExtensions(officeData).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  exaPending.replaceChildren(...pending.map((o) => {
    const card = el("article", "rsa-card exa-card");
    card.dataset.offerId = o.id;
    const head = el("div", "fao-group-head");
    const team = el("a", "fao-team");
    team.href = `team.html?team=${encodeURIComponent(o.teamId)}#extend`;
    team.append(el("b", "", o.teamId), teamName(o.teamId));
    head.append(team, el("strong", "rsa-player", `${o.position ? `${o.position} ` : ""}${o.playerName}`), el("span", "fao-group-meta", `Sent ${when(o.createdAt)}`));
    card.append(head);
    const body = el("div", "rsa-body");
    body.append(el("p", "fa-offer-terms", `${faOfferTerms(o)}${o.includesCurrent ? " in new money" : ""} · through ${o.startYear + o.yearsDetail.length - 1}`));
    if (o.notes) body.append(el("p", "fa-offer-notes-text", `“${o.notes}”`));
    const problem = problemWith(o);
    if (problem) body.append(el("p", "fao-warning", `Can't be approved: ${problem}`));
    else {
      const first = contractSeasonBreakdown(o, o.startYear)[0];
      const room = seasonCapFigures(o.teamId, o.startYear, officeData).remaining;
      // Extensions that rework this season change its cap hit rather than adding a new one.
      const before = o.includesCurrent ? capHitFor(seasonEntry(playerFor(o), o.startYear)) : 0;
      if (first) body.append(el("p", "fa-offer-meta", `${o.includesCurrent ? `${o.startYear} cap hit ${formatCurrency(before)} → ${formatCurrency(breakdownCapHit(first))} · ` : ""}${room === null ? `${o.startYear} cap room: base cap not set` : `${o.startYear} cap room ${signedMoney(room)} → ${signedMoney(room + before - breakdownCapHit(first))} after`}`));
    }
    body.append(contractTable(o));
    card.append(body);
    if (canSave) {
      const actions = el("div", "fao-actions");
      const approve = el("button", "button button-lime", "Approve");
      approve.type = "button";
      approve.dataset.action = "approve";
      approve.disabled = Boolean(problem);
      const decline = el("button", "workspace-button", "Decline");
      decline.type = "button";
      decline.dataset.action = "decline";
      actions.append(approve, decline);
      card.append(actions);
    }
    return card;
  }));
  if (!pending.length) exaPending.append(el("p", "empty-state", "No extension offers are waiting for approval."));
  renderLog();
  refreshNavNotifications();
}

function renderLog() {
  const keep = exaFilterTeam.value;
  exaFilterTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  exaFilterTeam.value = keep;
  const all = (officeData.extensionOffers || []).filter((o) => o.status !== "pending")
    .sort((a, b) => (b.decidedAt || b.createdAt).localeCompare(a.decidedAt || a.createdAt));
  const shown = all.filter((o) => (!exaFilterTeam.value || o.teamId === exaFilterTeam.value) && (!exaFilterStatus.value || o.status === exaFilterStatus.value));
  document.querySelector("#rsa-log").replaceChildren(...shown.map((o) => {
    const tr = document.createElement("tr");
    tr.dataset.offerId = o.id;
    tr.insertCell().textContent = when(o.decidedAt || o.createdAt);
    const team = tr.insertCell();
    const link = el("a", "txn-team", o.teamId);
    link.href = `team.html?team=${encodeURIComponent(o.teamId)}`;
    link.title = teamName(o.teamId);
    team.append(link);
    tr.insertCell().textContent = `${o.position ? `${o.position} ` : ""}${o.playerName}`;
    tr.insertCell().textContent = faOfferTerms(o);
    const last = o.startYear + o.yearsDetail.length - 1;
    tr.insertCell().textContent = `${o.startYear}${last > o.startYear ? `–${last}` : ""}`;
    tr.insertCell().append(el("span", `rsa-status is-${o.status}`, { approved: "Approved", declined: "Declined", withdrawn: "Withdrawn" }[o.status]));
    tr.insertCell().textContent = o.decisionNote || "";
    const copyCell = tr.insertCell();
    if (o.status === "approved") {
      const copy = el("button", "workspace-button", "Copy announcement");
      copy.type = "button";
      copy.dataset.action = "copy-announcement";
      copyCell.append(copy);
    }
    return tr;
  }));
  const empty = document.querySelector("#rsa-log-empty");
  empty.hidden = shown.length > 0;
  empty.textContent = all.length ? "No extensions match these filters." : "No extension decisions yet.";
}
exaFilterTeam.addEventListener("change", renderLog);
exaFilterStatus.addEventListener("change", renderLog);

function save(message) {
  try {
    writeStoredOffice(officeData);
    exaStatus.textContent = message;
    return true;
  } catch (error) {
    exaStatus.textContent = `Could not save: ${error.message}.`;
    return false;
  }
}

exaPending.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const id = button?.closest("[data-offer-id]")?.dataset.offerId;
  if (!id || !canSave) return;
  try { officeData = readStoredOffice() || officeData; } catch { exaStatus.textContent = "Saved data could not be read. No changes were made."; return; }
  const offer = pendingExtensions(officeData).find((o) => o.id === id);
  if (!offer) { exaStatus.textContent = "That offer was already decided or withdrawn."; render(); return; }
  const now = new Date().toISOString();
  if (button.dataset.action === "decline") {
    const ok = await confirmAction(`Decline the ${teamName(offer.teamId)} extension for ${offer.playerName}?`, { confirmLabel: "Decline", danger: true });
    if (!ok) return;
    Object.assign(offer, { status: "declined", decidedAt: now, decisionNote: "Declined by the commissioner" });
    save(`${offer.playerName}'s extension was declined.`);
    render();
    return;
  }
  const ok = await confirmAction(`Approve ${offer.playerName}'s extension with the ${teamName(offer.teamId)}: ${faOfferTerms(offer)}, starting ${offer.startYear}?`, { confirmLabel: "Approve extension" });
  if (!ok) return;
  const before = JSON.stringify(officeData);
  const txn = applyExtension(officeData, offer);
  if (txn?.error) { exaStatus.textContent = txn.error; officeData = loadStoredOfficeData(JSON.parse(before)); render(); return; }
  Object.assign(offer, { status: "approved", decidedAt: now, decisionNote: "Approved by the commissioner" });
  if (!save(`${offer.playerName}'s extension was approved and added to the ${offer.teamId} salary sheet.`)) {
    officeData = loadStoredOfficeData(JSON.parse(before));
    render();
    return;
  }
  render();
  const box = document.querySelector("#rsa-announcement");
  box.hidden = false;
  box.dataset.offerId = offer.id;
  box.querySelector("pre").textContent = extensionAnnouncement(offer);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="copy-announcement"]');
  if (!button) return;
  const id = button.closest("[data-offer-id]")?.dataset.offerId;
  const offer = (officeData.extensionOffers || []).find((o) => o.id === id);
  if (!offer) return;
  const ok = await copyText(extensionAnnouncement(offer));
  const label = button.textContent;
  button.textContent = ok ? "Copied ✓" : "Couldn't copy";
  setTimeout(() => { button.textContent = label; }, 1800);
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    render();
  } catch {
    exaStatus.textContent = "An update from another tab could not be read.";
  }
});

render();

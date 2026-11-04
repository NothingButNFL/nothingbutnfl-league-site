// Admin › Restructure Requests. Requests live in officeData.restructureRequests (league-core.js);
// approving one re-checks it against the current salary sheet and applies it with applyRestructure.
const rsaPending = document.querySelector("#rsa-pending");
const rsaStatus = document.querySelector("#rsa-status");
const rsaNotice = document.querySelector("#rsa-storage-notice");
const rsaFilterTeam = document.querySelector("#rsa-filter-team");
const rsaFilterStatus = document.querySelector("#rsa-filter-status");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  rsaNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const signedMoney = (v) => v < 0 ? `−${formatCurrency(Math.abs(v))}` : formatCurrency(v);
const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };

function findPlayer(request) {
  return officeData.teams[request.teamId]?.roster.find((p) => p.id === request.playerId) || null;
}
function planFor(request) {
  const player = findPlayer(request);
  if (!player) return { player: null, plan: { error: `${request.playerName} is no longer on the ${request.teamId} salary sheet.` } };
  return { player, plan: restructurePlan(officeData, request.teamId, player, { newBase: request.newBase, newRoster: request.newRoster, addVoid: request.addVoid }) };
}

// Before/after table for one request.
function beforeAfter(plan) {
  const table = el("table", "fao-contract rsa-contract");
  const head = table.createTHead().insertRow();
  for (const label of ["YEAR", "BASE SALARY", "SIGNING BONUS", "ROSTER BONUS", "CAP HIT"]) head.append(el("th", "", label));
  const body = table.createTBody();
  const pair = (before, after) => before === after ? formatCurrency(after) : `${formatCurrency(before)} → ${formatCurrency(after)}`;
  for (const r of plan.rows) {
    const tr = body.insertRow();
    if (r.before.capHit !== r.after.capHit) tr.className = "is-changed";
    tr.insertCell().textContent = String(r.season);
    tr.insertCell().textContent = pair(r.before.baseSalary, r.after.baseSalary);
    tr.insertCell().textContent = pair(r.before.proratedBonus, r.after.proratedBonus);
    tr.insertCell().textContent = pair(r.before.rosterBonus, r.after.rosterBonus);
    tr.insertCell().textContent = pair(r.before.capHit, r.after.capHit);
  }
  if (plan.voidAfter) {
    const tr = body.insertRow();
    tr.className = "is-void";
    tr.insertCell().textContent = `${plan.voidSeason} VOID`;
    tr.insertCell().textContent = "—";
    tr.insertCell().textContent = pair(plan.voidBefore, plan.voidAfter);
    tr.insertCell().textContent = "—";
    tr.insertCell().textContent = `dead cap ${plan.voidSeason}`;
  }
  return table;
}

function render() {
  const pending = pendingRestructures(officeData).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  rsaPending.replaceChildren(...pending.map((request) => {
    const { player, plan } = planFor(request);
    const card = el("article", "rsa-card");
    card.dataset.requestId = request.id;
    const head = el("div", "fao-group-head");
    const team = el("a", "fao-team");
    team.href = `team.html?team=${encodeURIComponent(request.teamId)}#restructure`;
    team.append(el("b", "", request.teamId), teamName(request.teamId));
    const who = el("strong", "rsa-player", `${request.position ? `${request.position} ` : ""}${request.playerName}`);
    head.append(team, who, el("span", "fao-group-meta", `Sent ${when(request.createdAt)}`));
    card.append(head);
    const body = el("div", "rsa-body");
    body.append(el("p", "fa-offer-terms", restructureSummary(request)));
    if (request.notes) body.append(el("p", "fa-offer-notes-text", `“${request.notes}”`));
    if (plan.error) {
      body.append(el("p", "fao-warning", `Can't be applied as sent: ${plan.error} Decline it or ask the team to send a new one.`));
    } else {
      const room = seasonCapFigures(request.teamId, plan.year, officeData).remaining;
      body.append(el("p", "fa-offer-meta", room === null ? `${plan.year} cap room: base cap not set` : `${plan.year} cap room ${signedMoney(room)} → ${signedMoney(room + plan.capSavings)} after`));
      if (plan.amount !== request.amount) body.append(el("p", "fao-warning", `His contract changed since this was sent: it would now convert ${formatCurrency(plan.amount)}.`));
      body.append(beforeAfter(plan));
    }
    card.append(body);
    if (canSave) {
      const actions = el("div", "fao-actions");
      const approve = el("button", "button button-lime", "Approve");
      approve.type = "button";
      approve.dataset.action = "approve";
      approve.disabled = Boolean(plan.error) || !plan.amount;
      const decline = el("button", "workspace-button", "Decline");
      decline.type = "button";
      decline.dataset.action = "decline";
      actions.append(approve, decline);
      card.append(actions);
    }
    return card;
  }));
  if (!pending.length) rsaPending.append(el("p", "empty-state", "No restructures are waiting for approval."));
  renderLog();
  refreshNavNotifications();
}

function renderLog() {
  const keep = rsaFilterTeam.value;
  rsaFilterTeam.replaceChildren(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));
  rsaFilterTeam.value = keep;
  const all = (officeData.restructureRequests || []).filter((r) => r.status !== "pending")
    .sort((a, b) => (b.decidedAt || b.createdAt).localeCompare(a.decidedAt || a.createdAt));
  const shown = all.filter((r) => (!rsaFilterTeam.value || r.teamId === rsaFilterTeam.value) && (!rsaFilterStatus.value || r.status === rsaFilterStatus.value));
  document.querySelector("#rsa-log").replaceChildren(...shown.map((r) => {
    const tr = document.createElement("tr");
    tr.dataset.requestId = r.id;
    tr.insertCell().textContent = when(r.decidedAt || r.createdAt);
    const team = tr.insertCell();
    const link = el("a", "txn-team", r.teamId);
    link.href = `team.html?team=${encodeURIComponent(r.teamId)}`;
    link.title = teamName(r.teamId);
    team.append(link);
    tr.insertCell().textContent = `${r.position ? `${r.position} ` : ""}${r.playerName}`;
    tr.insertCell().textContent = `${formatCurrency(r.amount)} of ${r.year}`;
    tr.insertCell().textContent = `${r.spread} season${r.spread === 1 ? "" : "s"}${r.addVoid ? ` (+${r.addVoid} void)` : ""}`;
    tr.insertCell().textContent = formatCurrency(r.capSavings);
    const status = tr.insertCell();
    status.append(el("span", `rsa-status is-${r.status}`, { approved: "Approved", declined: "Declined", withdrawn: "Withdrawn" }[r.status]));
    tr.insertCell().textContent = r.decisionNote || "";
    const copyCell = tr.insertCell();
    if (r.status === "approved") {
      const copy = el("button", "workspace-button", "Copy announcement");
      copy.type = "button";
      copy.dataset.action = "copy-announcement";
      copyCell.append(copy);
    }
    return tr;
  }));
  const empty = document.querySelector("#rsa-log-empty");
  empty.hidden = shown.length > 0;
  empty.textContent = all.length ? "No restructures match these filters." : "No restructure decisions yet.";
}
rsaFilterTeam.addEventListener("change", renderLog);
rsaFilterStatus.addEventListener("change", renderLog);

function save(message) {
  try {
    writeStoredOffice(officeData);
    rsaStatus.textContent = message;
    return true;
  } catch (error) {
    rsaStatus.textContent = `Could not save: ${error.message}.`;
    return false;
  }
}

function announcementFor(request) {
  const player = findPlayer(request) || { name: request.playerName };
  return restructureAnnouncement(request.teamId, player, { position: request.position, amount: request.amount, year: request.year, spread: request.spread, addVoid: request.addVoid, capSavings: request.capSavings });
}

rsaPending.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const id = button?.closest("[data-request-id]")?.dataset.requestId;
  if (!id || !canSave) return;
  try { officeData = readStoredOffice() || officeData; } catch { rsaStatus.textContent = "Saved data could not be read. No changes were made."; return; }
  const request = pendingRestructures(officeData).find((r) => r.id === id);
  if (!request) { rsaStatus.textContent = "That request was already decided or withdrawn."; render(); return; }
  const now = new Date().toISOString();
  if (button.dataset.action === "decline") {
    const ok = await confirmAction(`Decline the ${teamName(request.teamId)} restructure for ${request.playerName}?`, { confirmLabel: "Decline", danger: true });
    if (!ok) return;
    Object.assign(request, { status: "declined", decidedAt: now, decisionNote: "Declined by the commissioner" });
    save(`${request.playerName}'s restructure was declined.`);
    render();
    return;
  }
  const { player, plan } = planFor(request);
  if (plan.error) { rsaStatus.textContent = plan.error; render(); return; }
  const ok = await confirmAction(`Approve ${request.playerName}'s restructure? ${formatCurrency(plan.amount)} of ${plan.year} salary becomes signing bonus over ${plan.spread} season${plan.spread === 1 ? "" : "s"}, creating ${formatCurrency(plan.capSavings)} of ${plan.year} cap space for the ${teamName(request.teamId)}.`, { confirmLabel: "Approve restructure" });
  if (!ok) return;
  const before = JSON.stringify(officeData);
  applyRestructure(officeData, request.teamId, player, plan);
  Object.assign(request, { status: "approved", decidedAt: now, decisionNote: "Approved by the commissioner", amount: plan.amount, capSavings: plan.capSavings, spread: plan.spread });
  if (!save(`${request.playerName}'s restructure was approved: ${formatCurrency(plan.capSavings)} of ${plan.year} cap space for the ${teamName(request.teamId)}.`)) {
    officeData = loadStoredOfficeData(JSON.parse(before));
    render();
    return;
  }
  render();
  const box = document.querySelector("#rsa-announcement");
  box.hidden = false;
  box.dataset.requestId = request.id;
  box.querySelector("pre").textContent = announcementFor(request);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="copy-announcement"]');
  if (!button) return;
  const id = button.closest("[data-request-id]")?.dataset.requestId;
  const request = (officeData.restructureRequests || []).find((r) => r.id === id);
  if (!request) return;
  const ok = await copyText(announcementFor(request));
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
    rsaStatus.textContent = "An update from another tab could not be read.";
  }
});

render();

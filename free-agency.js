// Free Agency: directory players on team "FA" (Player Contracts), and signing them.
const faRows = document.querySelector("#fa-rows");
const faStatus = document.querySelector("#fa-status");
const faNotice = document.querySelector("#fa-storage-notice");
const faEmpty = document.querySelector("#fa-empty");
const faSearch = document.querySelector("#fa-search");
const faFilterPos = document.querySelector("#fa-filter-pos");
const faFilterType = document.querySelector("#fa-filter-type");
const signPanel = document.querySelector("#fa-sign-panel");
const signForm = document.querySelector("#fa-sign-form");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  faNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}
let signingId = null;

function save(message) {
  try {
    writeStoredOffice(officeData);
    faStatus.textContent = message;
    return true;
  } catch (error) {
    faStatus.textContent = `Could not save: ${error.message}.`;
    return false;
  }
}

const money = parseMoneyText;
const shortMoney = (v) => (v >= 1e6 ? `$${String(Number((v / 1e6).toFixed(2)))}M` : formatCurrency(v));

const freeAgents = () => (officeData.contractPlayers || []).filter((p) => p.team === freeAgentTeamId);

function lastContract(player) {
  const c = playerContract(player);
  if (!c.length && c.totalValue === null) return "—";
  const aav = contractAav(c);
  return [c.length ? `${c.length} yr${c.length === 1 ? "" : "s"}` : "", c.totalValue !== null ? shortMoney(c.totalValue) : "", aav !== null ? `${shortMoney(aav)} AAV` : ""].filter(Boolean).join(" · ");
}

function renderFreeAgents() {
  const all = freeAgents();
  const keep = [faFilterPos.value, faFilterType.value];
  const groups = [...new Set(all.map((p) => positionGroupFor(p.position)))];
  faFilterPos.replaceChildren(new Option("All positions", ""), ...rosterPositionGroups.filter(([k]) => groups.includes(k)).map(([k, label]) => new Option(label, k)), ...(groups.includes("OTHER") ? [new Option("Other / not set", "OTHER")] : []));
  const types = [...new Set(all.map((p) => p.faType).filter(Boolean))].sort();
  faFilterType.replaceChildren(new Option("All types", ""), ...types.map((t) => new Option(t, t)));
  faFilterPos.value = groups.includes(keep[0]) ? keep[0] : "";
  faFilterType.value = types.includes(keep[1]) ? keep[1] : "";
  const query = faSearch.value.trim().toLowerCase();
  const shown = all.filter((p) => (!faFilterPos.value || positionGroupFor(p.position) === faFilterPos.value) &&
    (!faFilterType.value || p.faType === faFilterType.value) && (!query || p.name.toLowerCase().includes(query)))
    .sort((a, b) => (contractAav(playerContract(b)) ?? -1) - (contractAav(playerContract(a)) ?? -1) || a.name.localeCompare(b.name));
  faRows.replaceChildren(...shown.map((p) => {
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    const name = tr.insertCell();
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(p.id);
    link.textContent = p.name;
    name.append(link);
    tr.insertCell().textContent = p.position || "—";
    const age = playerAge(p);
    tr.insertCell().textContent = age === null ? "—" : String(age);
    tr.insertCell().textContent = p.experience == null ? "—" : String(p.experience);
    tr.insertCell().textContent = p.faType || "—";
    tr.insertCell().textContent = lastContract(p);
    const offers = pendingFaOffers(officeData).filter((o) => o.playerId === p.id);
    const offerCell = tr.insertCell();
    if (offers.length) {
      const badge = document.createElement("span");
      badge.className = "fa-offer-count";
      badge.textContent = `${offers.length} open`;
      badge.title = offers.map((o) => o.teamId).join(", ");
      offerCell.append(badge);
    } else offerCell.textContent = "—";
    const action = tr.insertCell();
    const sign = document.createElement("button");
    sign.type = "button";
    sign.className = "row-transaction";
    sign.dataset.action = "sign";
    sign.textContent = "Make offer";
    sign.setAttribute("aria-label", `Make an offer to ${p.name}`);
    sign.disabled = !canSave;
    action.append(sign);
    return tr;
  }));
  document.querySelector("#fa-count").textContent = String(shown.length);
  faEmpty.hidden = shown.length > 0;
  faEmpty.textContent = all.length ? "No free agents match these filters." : "No free agents yet. On Player Contracts, set a player's team to FA to list him here.";

  renderOffers();

  // Recent signings from the Transaction Log.
  const signings = [...(officeData.transactions || [])].filter((t) => t.type === "signing")
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 10);
  const list = document.querySelector("#fa-signings");
  if (!signings.length) {
    const li = document.createElement("li");
    li.className = "recent-empty";
    li.textContent = "No signings yet.";
    list.replaceChildren(li);
  } else {
    list.replaceChildren(...signings.map((t) => {
      const li = document.createElement("li");
      li.className = "recent-item txn-signing fa-signing";
      const [y, m, d] = t.date.split("-").map(Number);
      const when = document.createElement("time");
      when.className = "tb-date";
      when.textContent = new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const team = t.teams.find((id) => id !== freeAgentTeamId);
      const who = document.createElement("strong");
      who.textContent = t.player || "Signing";
      const body = document.createElement("div");
      body.className = "recent-body";
      const detail = document.createElement("p");
      detail.textContent = `${team ? `${teamName(team)} · ` : ""}${String(t.details || "").replace(/\*\*/g, "")}`;
      body.append(who, detail);
      li.append(when, body);
      return li;
    }));
  }
}

faSearch.addEventListener("input", renderFreeAgents);
faFilterPos.addEventListener("change", renderFreeAgents);
faFilterType.addEventListener("change", renderFreeAgents);

faRows.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="sign"]');
  const tr = button?.closest("tr");
  const player = tr && freeAgents().find((p) => p.id === tr.dataset.playerId);
  if (!player || !canSave) return;
  signingId = player.id;
  document.querySelector("#fa-sign-title").textContent = `Offer ${player.name} a contract`;
  signForm.reset();
  const home = new URLSearchParams(location.search).get("team");
  if (nflTeams.some(({ id }) => id === home)) signForm.elements.team.value = home;
  signPanel.hidden = false;
  signPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  signForm.elements.team.focus({ preventScroll: true });
});

document.querySelector("#fa-sign-cancel").addEventListener("click", () => { signPanel.hidden = true; signingId = null; });

signForm.elements.team.append(new Option("Choose a team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));

signForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !signForm.reportValidity()) return;
  try { officeData = readStoredOffice() || officeData; } catch { /* keep the copy we have */ }
  const player = freeAgents().find((p) => p.id === signingId);
  if (!player) { faStatus.textContent = "That player is no longer a free agent."; signPanel.hidden = true; renderFreeAgents(); return; }
  const f = signForm.elements;
  const values = {};
  for (const field of ["totalValue", "signingBonus", "guaranteed"]) {
    const v = money(f[field].value);
    if (v === undefined) { faStatus.textContent = `Enter ${field === "totalValue" ? "the total value" : field === "signingBonus" ? "the signing bonus" : "the guaranteed amount"} as dollars, like 12,500,000 or 12.5M.`; f[field].focus(); return; }
    values[field] = v;
  }
  if (values.totalValue === null) { faStatus.textContent = "Enter the contract's total value."; return; }
  const teamId = f.team.value;
  const result = submitFaOffer(officeData, player, teamId, { years: Number(f.years.value), ...values, notes: f.notes.value });
  if (!save(`${result.replaced ? "Updated offer" : "Offer"} sent: the ${teamName(teamId)} offered ${player.name} ${faOfferTerms(result.offer)}. It's waiting for the commissioner.`)) {
    undoFaOffer(officeData, result);
    return;
  }
  refreshNavNotifications();
  signPanel.hidden = true;
  signingId = null;
  renderFreeAgents();
});

function offerCard(offer, { withdraw = false } = {}) {
  const card = document.createElement("article");
  card.className = `fa-offer is-${offer.status}`;
  card.dataset.offerId = offer.id;
  const head = document.createElement("div");
  head.className = "fa-offer-head";
  const who = document.createElement("strong");
  const link = document.createElement("a");
  link.className = "player-name-link";
  link.href = profileUrl(offer.playerId);
  link.textContent = offer.playerName;
  who.append(link);
  const team = document.createElement("a");
  team.className = "txn-team";
  team.href = `team.html?team=${encodeURIComponent(offer.teamId)}`;
  team.textContent = offer.teamId;
  team.title = teamName(offer.teamId);
  const status = document.createElement("span");
  status.className = "fa-offer-status";
  status.textContent = { pending: "Waiting", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" }[offer.status];
  head.append(who, team, status);
  const terms = document.createElement("p");
  terms.className = "fa-offer-terms";
  terms.textContent = faOfferTerms(offer);
  const meta = document.createElement("p");
  meta.className = "fa-offer-meta";
  const when = new Date(offer.decidedAt || offer.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  meta.textContent = [`${offer.status === "pending" ? "Sent" : "Decided"} ${when}`, offer.decisionNote || ""].filter(Boolean).join(" · ");
  card.append(head, terms);
  if (offer.notes) {
    const notes = document.createElement("p");
    notes.className = "fa-offer-notes-text";
    notes.textContent = `“${offer.notes}”`;
    card.append(notes);
  }
  card.append(meta);
  if (withdraw && canSave) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-button fa-offer-withdraw";
    button.dataset.action = "withdraw";
    button.textContent = "Withdraw";
    button.setAttribute("aria-label", `Withdraw the ${offer.teamId} offer to ${offer.playerName}`);
    card.append(button);
  }
  return card;
}

function renderOffers() {
  const open = pendingFaOffers(officeData).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openBox = document.querySelector("#fa-open-offers");
  openBox.replaceChildren(...open.map((o) => offerCard(o, { withdraw: true })));
  if (!open.length) { const p = document.createElement("p"); p.className = "empty-state"; p.textContent = "No open offers."; openBox.append(p); }
  const decided = (officeData.faOffers || []).filter((o) => o.status !== "pending")
    .sort((a, b) => (b.decidedAt || b.createdAt).localeCompare(a.decidedAt || a.createdAt)).slice(0, 15);
  const decidedBox = document.querySelector("#fa-decided-offers");
  decidedBox.replaceChildren(...decided.map((o) => offerCard(o)));
  if (!decided.length) { const p = document.createElement("p"); p.className = "empty-state"; p.textContent = "No decisions yet."; decidedBox.append(p); }
}

document.querySelector("#fa-open-offers").addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="withdraw"]');
  const id = button?.closest("[data-offer-id]")?.dataset.offerId;
  if (!id || !canSave) return;
  try { officeData = readStoredOffice() || officeData; } catch { /* keep the copy we have */ }
  const offer = pendingFaOffers(officeData).find((o) => o.id === id);
  if (!offer) { faStatus.textContent = "That offer has already been decided."; renderFreeAgents(); return; }
  const ok = await confirmAction(`Withdraw the ${teamName(offer.teamId)} offer to ${offer.playerName}?`, { confirmLabel: "Withdraw offer", danger: true });
  if (!ok) return;
  withdrawFaOffer(offer);
  save(`The ${teamName(offer.teamId)} offer to ${offer.playerName} was withdrawn.`);
  refreshNavNotifications();
  renderFreeAgents();
});

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    renderFreeAgents();
  } catch {
    faStatus.textContent = "An update from another tab could not be read.";
  }
});

renderFreeAgents();

// Team sheet "Offer Free Agent" tab: this team's offers on current free agents (league-core.js submitFaOffer).
// Offers go to Admin › Free Agent Offers. Uses front-office.js globals (officeData, activeTeamId, saveOfficeData).
const teamFaRows = document.querySelector("#team-fa-rows");
const teamFaSearch = document.querySelector("#team-fa-search");
const teamFaPos = document.querySelector("#team-fa-pos");
const teamFaFormPanel = document.querySelector("#team-fa-form-panel");
const teamFaForm = document.querySelector("#team-fa-form");
let teamFaPlayerId = null;
const teamFaEditor = createContractEditor(document.querySelector("#team-fa-contract"), { getData: () => officeData });

const teamFaYear = () => seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
const teamFaMoney = (v) => v < 0 ? `−${formatCurrency(Math.abs(v))}` : formatCurrency(v);
const teamFaShort = (v) => (v >= 1e6 ? `$${String(Number((v / 1e6).toFixed(2)))}M` : formatCurrency(v));
const currentFreeAgents = () => (officeData.contractPlayers || []).filter((p) => p.team === freeAgentTeamId);

function teamFaLastContract(player) {
  const c = playerContract(player);
  if (!c.length && c.totalValue === null) return "—";
  const aav = contractAav(c);
  return [c.length ? `${c.length} yr${c.length === 1 ? "" : "s"}` : "", c.totalValue !== null ? teamFaShort(c.totalValue) : "", aav !== null ? `${teamFaShort(aav)} AAV` : ""].filter(Boolean).join(" · ");
}

function teamCapRoom() {
  return seasonCapFigures(activeTeamId, teamFaYear()).remaining;
}

function renderTeamFaCap() {
  const room = teamCapRoom();
  const open = pendingFaOffers(officeData).filter((o) => o.teamId === activeTeamId);
  const firstHit = (o) => { const b = contractSeasonBreakdown(o)[0]; return b ? b.baseSalary + b.proratedBonus + (b.rosterBonus || 0) : 0; };
  const committed = open.reduce((sum, o) => sum + firstHit(o), 0);
  const cards = [
    [`${teamFaYear()} cap room`, room === null ? "Set base cap" : teamFaMoney(room), room === null ? "" : room < 0 ? "is-negative" : "is-positive"],
    ["Open offers", String(open.length), ""],
    [`${teamFaYear()} cap hits of open offers`, formatCurrency(committed), ""],
    ["Room if all were accepted", room === null ? "—" : teamFaMoney(room - committed), room === null ? "" : room - committed < 0 ? "is-negative" : "is-positive"]
  ];
  document.querySelector("#team-fa-cap").replaceChildren(...cards.map(([label, value, tone]) => {
    const card = document.createElement("article");
    card.className = "cap-stat";
    const l = document.createElement("span");
    l.textContent = label.toUpperCase();
    const v = document.createElement("strong");
    v.textContent = value;
    if (tone) v.className = tone;
    card.append(l, v);
    return card;
  }));
}

function teamFaOfferCard(offer) {
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
  const status = document.createElement("span");
  status.className = "fa-offer-status";
  status.textContent = { pending: "Waiting", accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" }[offer.status];
  head.append(who, status);
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
  if (offer.status === "pending" && storageIsAvailable) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-button fa-offer-withdraw";
    button.dataset.action = "withdraw";
    button.textContent = "Withdraw";
    button.setAttribute("aria-label", `Withdraw the offer to ${offer.playerName}`);
    card.append(button);
  }
  return card;
}

function renderTeamFreeAgents() {
  renderTeamFaCap();
  const all = currentFreeAgents();
  const keep = teamFaPos.value;
  const groups = [...new Set(all.map((p) => positionGroupFor(p.position)))];
  teamFaPos.replaceChildren(new Option("All positions", ""), ...rosterPositionGroups.filter(([k]) => groups.includes(k)).map(([k, label]) => new Option(label, k)), ...(groups.includes("OTHER") ? [new Option("Other / not set", "OTHER")] : []));
  teamFaPos.value = groups.includes(keep) ? keep : "";
  const query = teamFaSearch.value.trim().toLowerCase();
  const mine = new Map(pendingFaOffers(officeData).filter((o) => o.teamId === activeTeamId).map((o) => [o.playerId, o]));
  const shown = all.filter((p) => (!teamFaPos.value || positionGroupFor(p.position) === teamFaPos.value) && (!query || p.name.toLowerCase().includes(query)))
    .sort((a, b) => (mine.has(b.id) ? 1 : 0) - (mine.has(a.id) ? 1 : 0) || (contractAav(playerContract(b)) ?? -1) - (contractAav(playerContract(a)) ?? -1) || a.name.localeCompare(b.name));
  teamFaRows.replaceChildren(...shown.map((p) => {
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
    tr.insertCell().textContent = teamFaLastContract(p);
    const offerCell = tr.insertCell();
    const offer = mine.get(p.id);
    if (offer) {
      const badge = document.createElement("span");
      badge.className = "fa-offer-count";
      badge.textContent = `${offer.years} yr · ${teamFaShort(offer.totalValue)}`;
      badge.title = `Waiting: ${faOfferTerms(offer)}`;
      offerCell.append(badge);
    } else offerCell.textContent = "—";
    const action = tr.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-transaction";
    button.dataset.action = "offer";
    button.textContent = offer ? "Change offer" : "Make offer";
    button.setAttribute("aria-label", `${offer ? "Change the offer to" : "Make an offer to"} ${p.name}`);
    button.disabled = !storageIsAvailable;
    action.append(button);
    return tr;
  }));
  document.querySelector("#team-fa-count").textContent = String(shown.length);
  const empty = document.querySelector("#team-fa-empty");
  empty.hidden = shown.length > 0;
  empty.textContent = all.length ? "No free agents match these filters." : "There are no free agents right now. Players marked FA on Player Contracts show up here.";

  const offers = (officeData.faOffers || []).filter((o) => o.teamId === activeTeamId)
    .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || (b.decidedAt || b.createdAt).localeCompare(a.decidedAt || a.createdAt)).slice(0, 20);
  const list = document.querySelector("#team-fa-offers");
  list.replaceChildren(...offers.map(teamFaOfferCard));
  if (!offers.length) {
    const note = document.createElement("p");
    note.className = "empty-state";
    note.textContent = "This team hasn't made any free agent offers yet.";
    list.append(note);
  }
  if (teamFaPlayerId && !currentFreeAgents().some((p) => p.id === teamFaPlayerId)) { teamFaFormPanel.hidden = true; teamFaPlayerId = null; }
}

function updateTeamFaPreview() {
  const preview = document.querySelector("#team-fa-preview");
  const capHit = teamFaEditor.firstYearCapHit();
  if (!capHit) { preview.textContent = ""; preview.className = "team-fa-preview"; return; }
  const room = teamCapRoom();
  preview.textContent = `${teamFaYear()} cap hit ${formatCurrency(capHit)}.${room === null ? "" : ` ${teamFaYear()} cap room would go from ${teamFaMoney(room)} to ${teamFaMoney(room - capHit)}.`}`;
  preview.className = `team-fa-preview${room !== null && room - capHit < 0 ? " is-over" : ""}`;
}

teamFaSearch.addEventListener("input", renderTeamFreeAgents);
teamFaPos.addEventListener("change", renderTeamFreeAgents);
teamFaForm.addEventListener("input", updateTeamFaPreview);
teamFaForm.addEventListener("contractchange", updateTeamFaPreview);
teamFaForm.elements.contractType.addEventListener("change", () => {
  const player = currentFreeAgents().find((p) => p.id === teamFaPlayerId);
  const result = applyContractType(teamFaForm, officeData, player, teamFaEditor);
  if (result?.error) workspaceStatus.textContent = result.error;
  updateTeamFaPreview();
});

teamFaRows.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="offer"]');
  const player = button && currentFreeAgents().find((p) => p.id === button.closest("tr").dataset.playerId);
  if (!player || !storageIsAvailable) return;
  teamFaPlayerId = player.id;
  const existing = pendingFaOffers(officeData).find((o) => o.playerId === player.id && o.teamId === activeTeamId);
  document.querySelector("#team-fa-form-title").textContent = `Offer ${player.name} a contract`;
  document.querySelector("#team-fa-form-note").textContent = existing
    ? `The ${teamName(activeTeamId)} already have an open offer (${faOfferTerms(existing)}). Sending this replaces it.`
    : `This offer is sent from the ${teamName(activeTeamId)}.`;
  teamFaForm.reset();
  teamFaEditor.reset(player);
  if (existing) {
    const f = teamFaForm.elements;
    teamFaEditor.load(existing);
    if (existing.notes) f.notes.value = existing.notes;
    if (existing.minimum) { f.contractType.value = "minimum"; applyContractType(teamFaForm, officeData, player, teamFaEditor); }
  }
  updateTeamFaPreview();
  teamFaFormPanel.hidden = false;
  teamFaFormPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  teamFaForm.querySelector(".ce-years input, [data-ce]")?.focus({ preventScroll: true });
});

document.querySelector("#team-fa-cancel").addEventListener("click", () => { teamFaFormPanel.hidden = true; teamFaPlayerId = null; });

teamFaForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!storageIsAvailable || !teamFaForm.reportValidity()) return;
  const player = currentFreeAgents().find((p) => p.id === teamFaPlayerId);
  if (!player) { workspaceStatus.textContent = "That player is no longer a free agent."; teamFaFormPanel.hidden = true; renderTeamFreeAgents(); return; }
  const terms = readOfferForm(teamFaForm, officeData, player, teamFaEditor);
  if (terms.error) { workspaceStatus.textContent = terms.error; return; }
  const result = submitFaOffer(officeData, player, activeTeamId, terms);
  saveOfficeData(`${result.replaced ? "Updated offer" : "Offer"} sent to the commissioner: ${player.name}, ${faOfferTerms(result.offer)}.`);
  if (!storageIsAvailable) { undoFaOffer(officeData, result); return; }
  refreshNavNotifications();
  teamFaFormPanel.hidden = true;
  teamFaPlayerId = null;
  renderTeamFreeAgents();
});

document.querySelector("#team-fa-offers").addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="withdraw"]');
  const id = button?.closest("[data-offer-id]")?.dataset.offerId;
  const offer = id && pendingFaOffers(officeData).find((o) => o.id === id && o.teamId === activeTeamId);
  if (!offer) return;
  const ok = await confirmAction(`Withdraw the offer to ${offer.playerName} (${faOfferTerms(offer)})?`, { confirmLabel: "Withdraw offer", danger: true });
  if (!ok) return;
  withdrawFaOffer(offer);
  saveOfficeData(`Offer to ${offer.playerName} withdrawn.`);
  refreshNavNotifications();
  renderTeamFreeAgents();
});

globalThis.renderTeamFreeAgents = renderTeamFreeAgents;
if (!document.querySelector("#team-fa-panel").hidden) renderTeamFreeAgents();

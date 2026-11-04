// Team sheet Team Actions › Extensions: offer an extension to players in the final year of their deal. The offer is built with the
// contract builder (starting next season) and goes to Admin › Extension Offers. Uses front-office.js globals.
const extRows = document.querySelector("#ext-rows");
const extFormPanel = document.querySelector("#ext-form-panel");
const extForm = document.querySelector("#ext-form");
const extEditor = createContractEditor(document.querySelector("#ext-contract"), { getData: () => officeData, extension: true, title: "Contract Extension Template" });
let extPlayerId = null;

const extYear = () => seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
const extShort = (v) => (v >= 1e6 ? `$${String(Number((v / 1e6).toFixed(2)))}M` : formatCurrency(v));
const extEligible = () => officeData.teams[activeTeamId].roster.filter(isExtensionEligible)
  .sort((a, b) => capHitFor(seasonEntry(b, extYear())) - capHitFor(seasonEntry(a, extYear())) || a.name.localeCompare(b.name));

function extCard(o) {
  const card = document.createElement("article");
  card.className = `fa-offer is-${o.status === "approved" ? "accepted" : o.status}`;
  card.dataset.offerId = o.id;
  const label = { pending: "Waiting", approved: "Approved", declined: "Declined", withdrawn: "Withdrawn" }[o.status];
  const when = new Date(o.decidedAt || o.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  card.innerHTML = '<div class="fa-offer-head"><strong></strong><span class="fa-offer-status"></span></div><p class="fa-offer-terms"></p><p class="fa-offer-meta"></p>';
  card.querySelector("strong").textContent = o.playerName;
  card.querySelector(".fa-offer-status").textContent = label;
  card.querySelector(".fa-offer-terms").textContent = `${faOfferTerms(o)} · through ${o.startYear + o.yearsDetail.length - 1}`;
  card.querySelector(".fa-offer-meta").textContent = [`${o.status === "pending" ? "Sent" : "Decided"} ${when}`, o.decisionNote || ""].filter(Boolean).join(" · ");
  if (o.status === "pending" && storageIsAvailable) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-button fa-offer-withdraw";
    button.dataset.action = "withdraw-extension";
    button.textContent = "Withdraw";
    card.append(button);
  }
  return card;
}

function renderExtensions() {
  const year = extYear();
  document.querySelector("#ext-cap-head").textContent = `${year} CAP HIT`;
  const mine = (officeData.extensionOffers || []).filter((o) => o.teamId === activeTeamId);
  const pending = mine.filter((o) => o.status === "pending").sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const past = mine.filter((o) => o.status !== "pending").sort((a, b) => (b.decidedAt || b.createdAt).localeCompare(a.decidedAt || a.createdAt)).slice(0, 20);
  const note = (text) => { const p = document.createElement("p"); p.className = "empty-state"; p.textContent = text; return p; };
  document.querySelector("#ext-pending").replaceChildren(...(pending.length ? pending.map(extCard) : [note("No pending extensions.")]));
  document.querySelector("#ext-pending-count").textContent = String(pending.length);
  document.querySelector("#ext-pending-box").classList.toggle("has-offers", pending.length > 0);
  document.querySelector("#ext-past").replaceChildren(...(past.length ? past.map(extCard) : [note("No approved, declined or withdrawn extensions yet.")]));

  const open = new Map(pending.map((o) => [o.playerId, o]));
  const players = extEligible();
  extRows.replaceChildren(...players.map((p) => {
    const tr = document.createElement("tr");
    tr.dataset.playerId = p.id;
    const entry = seasonEntry(p, year);
    const name = tr.insertCell();
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(p.id);
    link.textContent = p.name;
    name.append(link);
    tr.insertCell().textContent = entry.position || "—";
    const age = playerAge(p);
    tr.insertCell().textContent = age === null ? "—" : String(age);
    tr.insertCell().textContent = p.experience == null ? "—" : String(p.experience);
    tr.insertCell().textContent = formatCurrency(capHitFor(entry));
    const offerCell = tr.insertCell();
    const offer = open.get(p.id);
    if (offer) {
      const badge = document.createElement("span");
      badge.className = "fa-offer-count";
      badge.textContent = `${offer.years} yr · ${extShort(offer.totalValue)}`;
      offerCell.append(badge);
    } else offerCell.textContent = "—";
    const action = tr.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "row-transaction";
    button.dataset.action = "extend";
    button.textContent = offer ? "Change offer" : "Offer extension";
    button.disabled = !storageIsAvailable;
    action.append(button);
    return tr;
  }));
  const empty = document.querySelector("#ext-empty");
  empty.hidden = players.length > 0;
  empty.textContent = seasons.includes(year + 1)
    ? `No players are in the last year of their deal. Players show here when ${year} is their final season on the sheet.`
    : `${year} is the last salary sheet, so extensions can't be added.`;
  if (extPlayerId && !players.some((p) => p.id === extPlayerId)) { extFormPanel.hidden = true; extPlayerId = null; }
}

// This season's cap hit changes too, since the extension reworks it.
function extPreview() {
  const preview = document.querySelector("#ext-preview");
  const player = extEligible().find((p) => p.id === extPlayerId);
  if (!player) { preview.textContent = ""; return; }
  const year = extYear();
  const before = capHitFor(seasonEntry(player, year));
  const after = extEditor.firstYearCapHit();
  const room = seasonCapFigures(activeTeamId, year).remaining;
  const signed = (v) => `${v < 0 ? "−" : ""}${formatCurrency(Math.abs(v))}`;
  const newRoom = room === null ? null : room + before - after;
  preview.textContent = `${year} cap hit ${formatCurrency(before)} → ${formatCurrency(after)}.${room === null ? "" : ` ${year} cap room would go from ${signed(room)} to ${signed(newRoom)}.`}`;
  preview.className = `team-fa-preview${newRoom !== null && newRoom < 0 ? " is-over" : ""}`;
}
extForm.addEventListener("input", extPreview);
extForm.addEventListener("contractchange", extPreview);

extRows.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="extend"]');
  const player = button && extEligible().find((p) => p.id === button.closest("tr").dataset.playerId);
  if (!player) return;
  extPlayerId = player.id;
  const existing = pendingExtensions(officeData).find((o) => o.playerId === player.id && o.teamId === activeTeamId);
  document.querySelector("#ext-form-title").textContent = `Offer ${player.name} an extension`;
  document.querySelector("#ext-form-note").textContent = existing
    ? `There's already a pending extension (${faOfferTerms(existing)}). Sending this replaces it.`
    : `His deal ends after ${extYear()}. Rework his ${extYear()} salary if you like, then add the new years. The signing bonus spreads over ${extYear()} and the extension years, up to 5 seasons.`;
  extForm.reset();
  extEditor.reset(player);
  if (existing) { extEditor.load(existing); if (existing.notes) extForm.elements.notes.value = existing.notes; }
  extPreview();
  extFormPanel.hidden = false;
  extFormPanel.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.querySelector("#ext-cancel").addEventListener("click", () => { extFormPanel.hidden = true; extPlayerId = null; });

extForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!storageIsAvailable) return;
  const player = extEligible().find((p) => p.id === extPlayerId);
  if (!player) { workspaceStatus.textContent = "That player can't be extended any more."; extFormPanel.hidden = true; renderExtensions(); return; }
  const terms = extEditor.read();
  if (terms.error) { workspaceStatus.textContent = terms.error; return; }
  terms.notes = extForm.elements.notes.value;
  const result = submitExtension(officeData, activeTeamId, player, terms);
  saveOfficeData(`${result.replaced ? "Updated extension" : "Extension"} for ${player.name} sent to the commissioner: ${faOfferTerms(result.offer)} in new money, through ${result.offer.startYear + result.offer.yearsDetail.length - 1}.`);
  if (!storageIsAvailable) { undoExtension(officeData, result); return; }
  refreshNavNotifications();
  extFormPanel.hidden = true;
  extPlayerId = null;
  renderExtensions();
  document.querySelector("#ext-pending-box").scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.querySelector("#ext-pending").addEventListener("click", async (event) => {
  const id = event.target.closest('[data-action="withdraw-extension"]')?.closest("[data-offer-id]")?.dataset.offerId;
  const offer = id && pendingExtensions(officeData).find((o) => o.id === id && o.teamId === activeTeamId);
  if (!offer) return;
  const ok = await confirmAction(`Withdraw the extension offer to ${offer.playerName}?`, { confirmLabel: "Withdraw", danger: true });
  if (!ok) return;
  Object.assign(offer, { status: "withdrawn", decidedAt: new Date().toISOString(), decisionNote: "Withdrawn by the team" });
  saveOfficeData(`Extension offer to ${offer.playerName} withdrawn.`);
  refreshNavNotifications();
  renderExtensions();
});

globalThis.renderExtensions = renderExtensions;
if (!document.querySelector("#extend-panel").hidden) renderExtensions();

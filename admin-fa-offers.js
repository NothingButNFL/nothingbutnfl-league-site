// Admin › Free Agent Offers. Offers live in officeData.faOffers (league-core.js); accepting one signs the player.
const faoOpen = document.querySelector("#fao-open");
const faoHistory = document.querySelector("#fao-history");
const faoStatus = document.querySelector("#fao-status");
const faoNotice = document.querySelector("#fao-storage-notice");

let officeData = emptyOfficeData();
let canSave = true;
try {
  officeData = readStoredOffice() || emptyOfficeData();
} catch (error) {
  canSave = false;
  faoNotice.textContent = error instanceof SyntaxError
    ? "Saved front-office data could not be read. It has not been overwritten; restore a valid backup from a team sheet."
    : `${error.message || "Browser storage is unavailable."} No saved data was changed.`;
}

const capYear = () => seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
const signedMoney = (v) => v < 0 ? `−${formatCurrency(Math.abs(v))}` : formatCurrency(v);
const when = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function emptyNote(text) {
  const note = document.createElement("p");
  note.className = "empty-state";
  note.textContent = text;
  return note;
}

function textEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

// Year-by-year view of an offer, like the Contract Offer Template.
function contractTable(offer) {
  const start = seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
  const table = document.createElement("table");
  table.className = "fao-contract";
  const head = table.createTHead().insertRow();
  for (const label of ["YEAR", "BASE SALARY", "SIGNING BONUS", "ROSTER BONUS", "GTD SALARY", "CAP HIT"]) head.append(textEl("th", "", label));
  const body = table.createTBody();
  const rows = contractSeasonBreakdown(offer, start);
  for (const r of rows) {
    const tr = body.insertRow();
    tr.insertCell().textContent = String(r.year);
    for (const v of [r.baseSalary, r.proratedBonus, r.rosterBonus || 0, r.guaranteedSalary, r.baseSalary + r.proratedBonus + (r.rosterBonus || 0)]) tr.insertCell().textContent = formatCurrency(v);
    if (offer.vmbCapBase !== undefined) tr.cells[1].textContent = `${formatCurrency(r.actualSalary)} paid · ${formatCurrency(r.baseSalary)} on the cap`;
  }
  if (offer.voidYears && Array.isArray(offer.yearsDetail)) {
    const shares = prorationShares(Math.min(offer.signingBonus || 0, offer.totalValue), offer.years + offer.voidYears);
    for (let i = offer.years; i < offer.years + offer.voidYears; i++) {
      const tr = body.insertRow();
      tr.className = "is-void";
      tr.insertCell().textContent = `${start + i} VOID`;
      for (const v of ["—", formatCurrency(shares[i] || 0), "—", "—", "—"]) tr.insertCell().textContent = v;
    }
    const voided = voidBonusFor(offer, start);
    if (voided) {
      const tr = body.insertRow();
      tr.className = "fao-void-note";
      const cell = tr.insertCell();
      cell.colSpan = 6;
      cell.textContent = `${formatCurrency(voided.amount)} on void years becomes ${voided.year} dead cap after his final season.`;
    }
  }
  return table;
}

function offerRow(offer) {
  const row = document.createElement("article");
  row.className = "fao-offer";
  row.dataset.offerId = offer.id;
  const team = document.createElement("a");
  team.className = "fao-team";
  team.href = `team.html?team=${encodeURIComponent(offer.teamId)}`;
  team.append(textEl("b", "", offer.teamId), teamName(offer.teamId));
  const terms = textEl("p", "fa-offer-terms", faOfferTerms(offer));
  const aav = Math.round(offer.totalValue / offer.years);
  const first = contractSeasonBreakdown(offer)[0];
  const firstHit = first ? first.baseSalary + first.proratedBonus + (first.rosterBonus || 0) : aav;
  const facts = document.createElement("p");
  facts.className = "fa-offer-meta";
  const year = capYear();
  const room = seasonCapFigures(offer.teamId, year, officeData).remaining;
  facts.textContent = [`${formatCurrency(aav)} per year`, `Sent ${when(offer.createdAt)}`,
    `${year} cap hit ${formatCurrency(firstHit)}`,
    room === null ? `${year} cap room: base cap not set` : `${year} cap room ${signedMoney(room)} → ${signedMoney(room - firstHit)} after`].join(" · ");
  if (room !== null && room - firstHit < 0) facts.classList.add("is-over");
  const body = document.createElement("div");
  body.className = "fao-offer-body";
  body.append(team, terms);
  if (offer.notes) body.append(textEl("p", "fa-offer-notes-text", `“${offer.notes}”`));
  body.append(facts, contractTable(offer));
  row.append(body);
  if (canSave) {
    const actions = document.createElement("div");
    actions.className = "fao-actions";
    const accept = textEl("button", "button button-lime", "Accept");
    accept.type = "button";
    accept.dataset.action = "accept";
    accept.setAttribute("aria-label", `Accept the ${offer.teamId} offer to ${offer.playerName}`);
    const decline = textEl("button", "workspace-button", "Decline");
    decline.type = "button";
    decline.dataset.action = "decline";
    decline.setAttribute("aria-label", `Decline the ${offer.teamId} offer to ${offer.playerName}`);
    actions.append(accept, decline);
    row.append(actions);
  }
  return row;
}

function render() {
  const open = pendingFaOffers(officeData);
  // Group by player, oldest offer first.
  const groups = new Map();
  for (const offer of [...open].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (!groups.has(offer.playerId)) groups.set(offer.playerId, []);
    groups.get(offer.playerId).push(offer);
  }
  faoOpen.replaceChildren(...[...groups.entries()].map(([playerId, offers]) => {
    const player = (officeData.contractPlayers || []).find((p) => p.id === playerId);
    const group = document.createElement("section");
    group.className = "fao-group";
    const head = document.createElement("div");
    head.className = "fao-group-head";
    const name = document.createElement("a");
    name.className = "player-name-link";
    name.href = profileUrl(playerId);
    name.textContent = offers[0].playerName;
    const details = [player?.position, player && playerAge(player) !== null ? `Age ${playerAge(player)}` : "", player?.faType].filter(Boolean).join(" · ");
    head.append(name, textEl("span", "fao-group-meta", details), textEl("span", "fa-offer-count", `${offers.length} offer${offers.length === 1 ? "" : "s"}`));
    if (player && player.team !== freeAgentTeamId) head.append(textEl("span", "fao-warning", `No longer a free agent (now ${player.team})`));
    group.append(head, ...offers.map(offerRow));
    return group;
  }));
  if (!groups.size) faoOpen.append(emptyNote("No free agent offers are waiting."));

  const history = (officeData.faOffers || []).filter((o) => o.status !== "pending")
    .sort((a, b) => (b.decidedAt || b.createdAt).localeCompare(a.decidedAt || a.createdAt)).slice(0, 30);
  faoHistory.replaceChildren(...history.map((offer) => {
    const card = document.createElement("article");
    card.className = `fa-offer is-${offer.status}`;
    const head = document.createElement("div");
    head.className = "fa-offer-head";
    const who = document.createElement("strong");
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(offer.playerId);
    link.textContent = offer.playerName;
    who.append(link);
    const team = textEl("span", "txn-team", offer.teamId);
    team.title = teamName(offer.teamId);
    head.append(who, team, textEl("span", "fa-offer-status", { accepted: "Accepted", declined: "Declined", withdrawn: "Withdrawn" }[offer.status]));
    card.append(head, textEl("p", "fa-offer-terms", faOfferTerms(offer)),
      textEl("p", "fa-offer-meta", [`Decided ${when(offer.decidedAt || offer.createdAt)}`, offer.decisionNote || ""].filter(Boolean).join(" · ")));
    return card;
  }));
  if (!history.length) faoHistory.append(emptyNote("No decisions yet."));
  refreshNavNotifications();
}

faoOpen.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  const id = button?.closest("[data-offer-id]")?.dataset.offerId;
  if (!id || !canSave) return;
  // Re-read storage so a decision never overwrites changes made in another tab.
  try { officeData = readStoredOffice() || officeData; } catch { faoStatus.textContent = "Saved data could not be read. No changes were made."; return; }
  const offer = pendingFaOffers(officeData).find((o) => o.id === id);
  if (!offer) { faoStatus.textContent = "That offer was already decided or withdrawn."; render(); return; }
  const now = new Date().toISOString();

  if (button.dataset.action === "decline") {
    const ok = await confirmAction(`Decline the ${teamName(offer.teamId)} offer to ${offer.playerName}?`, { confirmLabel: "Decline offer", danger: true });
    if (!ok) return;
    Object.assign(offer, { status: "declined", decidedAt: now, decisionNote: "Declined by the commissioner" });
    save(`The ${teamName(offer.teamId)} offer to ${offer.playerName} was declined.`);
    render();
    return;
  }

  const others = pendingFaOffers(officeData).filter((o) => o.playerId === offer.playerId && o.id !== offer.id);
  const ok = await confirmAction(`Accept the ${teamName(offer.teamId)} offer and sign ${offer.playerName} (${faOfferTerms(offer)})?${others.length ? ` ${others.length} other open offer${others.length === 1 ? "" : "s"} for him will be declined.` : ""}`, { confirmLabel: "Accept and sign" });
  if (!ok) return;
  const before = JSON.stringify(officeData);
  const txn = signFreeAgent(officeData, offer.playerId, offer.teamId, offer, localDateString(), " (free agent offer accepted)");
  if (!txn) {
    faoStatus.textContent = `${offer.playerName} is no longer a free agent, so the offer can't be accepted. Decline it instead.`;
    officeData = JSON.parse(before);
    return;
  }
  Object.assign(offer, { status: "accepted", decidedAt: now, decisionNote: "Accepted by the commissioner" });
  for (const other of others) Object.assign(other, { status: "declined", decidedAt: now, decisionNote: `${offer.playerName} signed with ${offer.teamId}` });
  if (!save(`${offer.playerName} signed with the ${teamName(offer.teamId)}: ${faOfferTerms(offer)}.${others.length ? ` ${others.length} other offer${others.length === 1 ? " was" : "s were"} declined.` : ""} He's on the ${offer.teamId} salary sheet with these cap hits: ${contractSeasonBreakdown(offer, seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0]).map((b) => `${b.year} ${formatCurrency(b.baseSalary + b.proratedBonus + (b.rosterBonus || 0))}`).join(", ")}${voidBonusFor(offer, seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0]) ? `, plus ${formatCurrency(voidBonusFor(offer, seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0]).amount)} void-year dead cap in ${voidBonusFor(offer, seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0]).year}` : ""}.`)) {
    officeData = loadStoredOfficeData(JSON.parse(before));
  }
  render();
});

function save(message) {
  try {
    writeStoredOffice(officeData);
    faoStatus.textContent = message;
    return true;
  } catch (error) {
    faoStatus.textContent = `Could not save: ${error.message}.`;
    return false;
  }
}

window.addEventListener("storage", (event) => {
  if (event.key !== officeStorageKey) return;
  try {
    officeData = event.newValue ? loadStoredOfficeData(JSON.parse(event.newValue)) : emptyOfficeData();
    render();
  } catch {
    faoStatus.textContent = "An update from another tab could not be read.";
  }
});

render();

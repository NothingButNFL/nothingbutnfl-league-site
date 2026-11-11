// Free Agency: practice squad players share the free-agent table (with a PS badge; the "Practice Squad" box shows only
// them). Any team can sign another team's practice squad player to its active roster; his team has 24 hours to match
// from its salary sheet. Uses free-agency.js globals (officeData, save, faStatus, faRows, canSave, renderFreeAgents)
// and league-core.js (makePsOffer, processExpiredPsOffers, psActiveContract …).
const psmEl = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };

function psmLogo(teamId) {
  const team = nflTeams.find(({ id }) => id === teamId);
  const wrap = psmEl("span", "leader-logo");
  if (!team) return wrap;
  const img = document.createElement("img");
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => { img.remove(); }, { once: true });
  wrap.append(img);
  return wrap;
}

// Every practice squad player in the league: [{ player, teamId, entry, year }]
function psMarketPlayers() {
  const year = psOfferYear();
  return nflTeams.flatMap(({ id }) => officeData.teams[id].roster
    .filter((p) => isPlayerOnSeason(p, year) && isPracticeSquad(seasonEntry(p, year)))
    .map((player) => ({ player, teamId: id, entry: seasonEntry(player, year), year })))
    .sort((a, b) => a.player.name.localeCompare(b.player.name));
}

// One row in the free-agent table (same columns): player + PS badge, pos, age, exp, type, what he'd sign for, offer, sign.
function psMarketRow({ player, teamId, entry, year }) {
  const tr = document.createElement("tr");
  tr.className = "fa-ps-row";
  tr.dataset.psPlayer = player.id;
  tr.dataset.psTeam = teamId;
  const action = tr.insertCell();
  action.className = "fa-action-cell";
  const name = tr.insertCell();
  const link = psmEl("a", "player-name-link", player.name);
  link.href = profileUrl(player.id);
  const badge = psmEl("span", "fa-ps-badge");
  badge.append(psmLogo(teamId), `PS · ${teamId}`);
  badge.title = `On the ${teamName(teamId)} practice squad${isPsElevated(entry) ? " (elevated for game day)" : ""}`;
  name.append(link, badge);
  tr.insertCell().textContent = entry.position || "—";
  const age = typeof playerAge === "function" ? playerAge(player) : null;
  tr.insertCell().textContent = age === null || age === undefined ? "—" : String(age);
  tr.insertCell().textContent = player.experience == null ? "—" : String(player.experience);
  tr.insertCell().textContent = "Practice squad";
  const contract = psActiveContract(officeData, player, entry, year, { includeEarned: false });
  const pay = tr.insertCell();
  pay.textContent = contract.amount === null ? "Minimum not set" : `Signs for ${formatCurrency(contract.prorated)}`;
  pay.title = `1-year minimum: ${contract.math}`;
  const offer = pendingPsOffers(officeData).find((o) => o.playerId === player.id && o.fromTeam === teamId);
  const offerCell = tr.insertCell();
  if (offer) {
    const tag = psmEl("span", "fa-offer-count fa-ps-offer", `${offer.toTeam} · ${psOfferTimeLeft(offer) || "time's up"}`);
    tag.title = `The ${teamName(offer.toTeam)} want to sign him; the ${teamName(teamId)} have until then to match.`;
    offerCell.append(tag);
  } else offerCell.textContent = "—";
  if (offer) { action.textContent = "Waiting on a match"; action.classList.add("fa-ps-waiting"); return tr; }
  const select = document.createElement("select");
  select.className = "psm-team-select";
  select.setAttribute("aria-label", `Team signing ${player.name}`);
  select.append(new Option("Your team", ""), ...nflTeams.filter(({ id }) => id !== teamId).map(({ id }) => new Option(id, id)));
  const home = new URLSearchParams(location.search).get("team");
  if (home && home !== teamId && nflTeams.some(({ id }) => id === home)) select.value = home;
  const button = psmEl("button", "row-transaction", "Sign");
  button.type = "button";
  button.dataset.action = "ps-offer";
  button.title = `Sign ${player.name} to your active roster`;
  button.disabled = !canSave;
  action.append(select, button);
  return tr;
}

function renderPsOffers() {
  const list = document.querySelector("#psm-offers");
  if (!list) return;
  const pending = pendingPsOffers(officeData).sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
  const recent = (officeData.psOffers || []).filter((o) => o.status !== "pending").sort((a, b) => String(b.resolvedAt).localeCompare(String(a.resolvedAt))).slice(0, 10);
  list.replaceChildren(...pending.map((o) => {
    const li = psmEl("li", "is-pending");
    li.dataset.offer = o.id;
    li.append(psmLogo(o.toTeam), psmEl("span", "", `${teamName(o.toTeam)} want ${o.playerName}${o.position ? ` (${o.position})` : ""} from the ${teamName(o.fromTeam)} practice squad`),
      psmEl("small", "", `${psOfferTimeLeft(o) || "time's up"} left to match`));
    const withdraw = psmEl("button", "workspace-button", "Withdraw");
    withdraw.type = "button";
    withdraw.dataset.action = "withdraw";
    withdraw.disabled = !canSave;
    li.append(withdraw);
    return li;
  }), ...recent.map((o) => {
    const li = psmEl("li", `is-${o.status}`);
    const what = o.status === "signed" ? `${o.playerName} signed with the ${teamName(o.toTeam)} (from ${o.fromTeam})`
      : o.status === "matched" ? `${teamName(o.fromTeam)} matched and kept ${o.playerName}` : `${teamName(o.toTeam)} withdrew their offer to ${o.playerName}`;
    li.append(psmLogo(o.status === "signed" ? o.toTeam : o.fromTeam), psmEl("span", "", what), psmEl("small", "", o.resolvedAt ? new Date(o.resolvedAt).toLocaleDateString() : ""));
    return li;
  }));
  if (!pending.length && !recent.length) list.append(psmEl("li", "psm-none", "No practice squad offers yet."));
}

faRows.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="ps-offer"]');
  const row = button?.closest("[data-ps-player]");
  if (!row || !canSave) return;
  const toTeam = row.querySelector(".psm-team-select").value;
  if (!toTeam) { faStatus.textContent = "Choose the team signing him."; row.querySelector(".psm-team-select").focus(); return; }
  const fromTeam = row.dataset.psTeam;
  const player = officeData.teams[fromTeam].roster.find((p) => p.id === row.dataset.psPlayer);
  if (!player) return;
  const year = psOfferYear();
  const contract = psActiveContract(officeData, player, seasonEntry(player, year), year, { includeEarned: false });
  if (!await confirmAction(`Sign ${player.name} to the ${teamName(toTeam)} active roster? He'd get a 1-year minimum: ${contract.math}. ` +
    `The ${teamName(fromTeam)} get ${psMatchHours} hours to match; if they don't, he joins your team.`, { confirmLabel: "Send offer" })) return;
  const offer = makePsOffer(officeData, fromTeam, player.id, toTeam);
  if (offer.error) { faStatus.textContent = offer.error; return; }
  save(`Offer sent: the ${teamName(fromTeam)} have ${psMatchHours} hours to match for ${player.name}. They'll see it on their salary sheet.`);
  renderFreeAgents();
});

document.querySelector("#psm-offers")?.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="withdraw"]');
  const offer = button && (officeData.psOffers || []).find((o) => o.id === button.closest("[data-offer]")?.dataset.offer && o.status === "pending");
  if (!offer || !canSave) return;
  offer.status = "withdrawn";
  offer.resolvedAt = new Date().toISOString();
  save(`${teamName(offer.toTeam)} withdrew their offer to ${offer.playerName}.`);
  renderFreeAgents();
});

// Offers past their 24 hours go through when the page opens (and on a timer while it's open).
function psmTick() {
  const finished = canSave ? processExpiredPsOffers(officeData) : [];
  if (finished.length) save(finished.join(" "));
  renderFreeAgents();
}
psmTick();
setInterval(() => { if (!document.hidden && !document.querySelector(".confirm-overlay") && !faRows.contains(document.activeElement)) psmTick(); }, 60000);

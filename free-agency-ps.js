// Free Agency › Practice squad players: any team can try to sign another team's practice squad player to its active
// roster. His team has 24 hours to match (from its salary sheet). Uses free-agency.js globals (officeData, save,
// canSave) and league-core.js (makePsOffer, processExpiredPsOffers, psActiveContract …).
const psmRows = document.querySelector("#psm-rows");
const psmStatus = document.querySelector("#psm-status");
const psmSearch = document.querySelector("#psm-search");
const psmTeam = document.querySelector("#psm-team");
const psmPos = document.querySelector("#psm-pos");
const psmEl = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text !== undefined) e.textContent = text; return e; };

function psmSave(message) {
  const ok = save(message);
  psmStatus.textContent = ok ? message : faStatus.textContent;
  return ok;
}

function psmPlayers() {
  const year = psOfferYear();
  return nflTeams.flatMap(({ id }) => officeData.teams[id].roster
    .filter((p) => isPlayerOnSeason(p, year) && isPracticeSquad(seasonEntry(p, year)))
    .map((player) => ({ player, teamId: id, entry: seasonEntry(player, year), year })));
}

function psmLogo(teamId) {
  const team = nflTeams.find(({ id }) => id === teamId);
  const wrap = psmEl("span", "leader-logo");
  if (!team) return wrap;
  const img = document.createElement("img");
  img.src = `https://a.espncdn.com/i/teamlogos/nfl/500/${team.logo}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.addEventListener("error", () => { img.remove(); wrap.textContent = teamId; }, { once: true });
  wrap.append(img);
  return wrap;
}

function renderPsMarket() {
  const all = psmPlayers();
  const q = psmSearch.value.trim().toLowerCase();
  const positions = [...new Set(all.map(({ entry }) => entry.position).filter(Boolean))].sort();
  const keepPos = psmPos.value;
  psmPos.replaceChildren(new Option("All", ""), ...positions.map((p) => new Option(p, p)));
  psmPos.value = positions.includes(keepPos) ? keepPos : "";
  const shown = all.filter(({ player, teamId, entry }) => (!q || player.name.toLowerCase().includes(q)) && (!psmTeam.value || teamId === psmTeam.value) && (!psmPos.value || entry.position === psmPos.value))
    .sort((a, b) => a.player.name.localeCompare(b.player.name));
  document.querySelector("#psm-count").textContent = String(all.length);
  document.querySelector("#psm-empty").hidden = shown.length > 0;
  const pending = pendingPsOffers(officeData);
  psmRows.replaceChildren(...shown.map(({ player, teamId, entry, year }) => {
    const tr = document.createElement("tr");
    tr.dataset.player = player.id;
    tr.dataset.team = teamId;
    const cell = (label) => { const td = tr.insertCell(); td.dataset.label = label; return td; };
    const name = cell("Player");
    const link = psmEl("a", "player-name-link", player.name);
    link.href = profileUrl(player.id);
    name.append(link);
    const team = cell("Team");
    team.className = "psm-team";
    const logo = psmLogo(teamId);
  logo.querySelector("img")?.addEventListener("error", () => { logo.textContent = ""; }, { once: true });
  team.append(logo, ` ${teamId}`);
    cell("Pos").textContent = entry.position || "—";
    const exp = player.experience;
    cell("Yrs exp").textContent = exp === null || exp === undefined ? "—" : String(exp);
    const contract = psActiveContract(officeData, player, entry, year, { includeEarned: false });
    const pay = cell("Would sign for");
    pay.textContent = contract.amount === null ? "Minimum not set" : formatCurrency(contract.prorated);
    pay.title = contract.math;
    const offer = pending.find((o) => o.playerId === player.id && o.fromTeam === teamId);
    const status = cell("Status");
    status.textContent = offer ? `Offer from ${offer.toTeam} · ${psOfferTimeLeft(offer) || "time's up"} to match` : isPsElevated(entry) ? "Elevated" : "Practice squad";
    if (offer) status.className = "psm-has-offer";
    const act = cell("Sign");
    if (offer) { act.textContent = "—"; return tr; }
    const select = document.createElement("select");
    select.className = "psm-team-select";
    select.setAttribute("aria-label", `Team signing ${player.name}`);
    select.append(new Option("Your team", ""), ...nflTeams.filter(({ id }) => id !== teamId).map(({ id, name: n }) => new Option(n, id)));
    const button = psmEl("button", "button button-lime", "Sign");
    button.type = "button";
    button.dataset.action = "offer";
    button.disabled = !canSave;
    act.append(select, button);
    return tr;
  }));
  renderPsOffers();
}

function renderPsOffers() {
  const list = document.querySelector("#psm-offers");
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

psmRows.addEventListener("click", async (event) => {
  const button = event.target.closest('[data-action="offer"]');
  const row = button?.closest("[data-player]");
  if (!row || !canSave) return;
  const toTeam = row.querySelector(".psm-team-select").value;
  if (!toTeam) { psmStatus.textContent = "Choose the team signing him."; row.querySelector(".psm-team-select").focus(); return; }
  const player = officeData.teams[row.dataset.team].roster.find((p) => p.id === row.dataset.player);
  const year = psOfferYear();
  const contract = psActiveContract(officeData, player, seasonEntry(player, year), year, { includeEarned: false });
  if (!await confirmAction(`Offer ${player.name} a spot on the ${teamName(toTeam)} active roster? He'd sign a 1-year minimum: ${contract.math}. ` +
    `The ${teamName(row.dataset.team)} get ${psMatchHours} hours to match; if they don't, he joins your team.`, { confirmLabel: "Send offer" })) return;
  const offer = makePsOffer(officeData, row.dataset.team, row.dataset.player, toTeam);
  if (offer.error) { psmStatus.textContent = offer.error; return; }
  psmSave(`Offer sent: the ${teamName(row.dataset.team)} have ${psMatchHours} hours to match for ${player.name}. They'll see it on their salary sheet.`);
  renderPsMarket();
});

document.querySelector("#psm-offers").addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="withdraw"]');
  const offer = button && (officeData.psOffers || []).find((o) => o.id === button.closest("[data-offer]")?.dataset.offer && o.status === "pending");
  if (!offer || !canSave) return;
  offer.status = "withdrawn";
  offer.resolvedAt = new Date().toISOString();
  psmSave(`${teamName(offer.toTeam)} withdrew their offer to ${offer.playerName}.`);
  renderPsMarket();
});

psmTeam.append(new Option("All teams", ""), ...nflTeams.map(({ id, name }) => new Option(name, id)));
for (const el of [psmSearch, psmTeam, psmPos]) el.addEventListener(el === psmSearch ? "input" : "change", renderPsMarket);
window.addEventListener("storage", (event) => { if (event.key === officeStorageKey) setTimeout(renderPsMarket, 0); });

// Offers past their 24 hours go through when the page opens (and on a timer while it's open).
function psmTick() {
  const finished = canSave ? processExpiredPsOffers(officeData) : [];
  if (finished.length) psmSave(finished.join(" "));
  renderPsMarket();
}
psmTick();
setInterval(() => { if (!document.hidden && !document.querySelector(".confirm-overlay") && !psmRows.contains(document.activeElement)) psmTick(); }, 60000);

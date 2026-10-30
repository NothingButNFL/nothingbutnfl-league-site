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

const money = (text) => {
  const raw = String(text || "").trim().replace(/[$,\s]/g, "").toUpperCase();
  if (!raw) return null;
  const match = raw.match(/^(\d+(?:\.\d+)?)([KM]?)$/);
  if (!match) return undefined;
  const value = Math.round(Number(match[1]) * (match[2] === "M" ? 1e6 : match[2] === "K" ? 1e3 : 1));
  return isIntegerInRange(value, 0, 999999999) ? value : undefined;
};
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
    const action = tr.insertCell();
    const sign = document.createElement("button");
    sign.type = "button";
    sign.className = "row-transaction";
    sign.dataset.action = "sign";
    sign.textContent = "Sign";
    sign.setAttribute("aria-label", `Sign ${p.name}`);
    sign.disabled = !canSave;
    action.append(sign);
    return tr;
  }));
  document.querySelector("#fa-count").textContent = String(shown.length);
  faEmpty.hidden = shown.length > 0;
  faEmpty.textContent = all.length ? "No free agents match these filters." : "No free agents yet. On Player Contracts, set a player's team to FA to list him here.";

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
  document.querySelector("#fa-sign-title").textContent = `Sign ${player.name}`;
  signForm.reset();
  signForm.elements.date.value = localDateString();
  signPanel.hidden = false;
  signPanel.scrollIntoView({ behavior: "smooth", block: "center" });
  signForm.elements.team.focus({ preventScroll: true });
});

document.querySelector("#fa-sign-cancel").addEventListener("click", () => { signPanel.hidden = true; signingId = null; });

signForm.elements.team.append(new Option("Choose a team", ""), ...nflTeams.map(({ id, name }) => new Option(`${name} (${id})`, id)));

signForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canSave || !signForm.reportValidity()) return;
  const player = freeAgents().find((p) => p.id === signingId);
  if (!player) { faStatus.textContent = "That player is no longer a free agent."; signPanel.hidden = true; return; }
  const f = signForm.elements;
  const length = Number(f.years.value);
  const values = {};
  for (const field of ["totalValue", "signingBonus", "guaranteed"]) {
    const v = money(f[field].value);
    if (v === undefined) { faStatus.textContent = `Enter ${field === "totalValue" ? "the total value" : field === "signingBonus" ? "the signing bonus" : "the guaranteed amount"} as dollars, like 12,500,000 or 12.5M.`; f[field].focus(); return; }
    values[field] = v;
  }
  if (values.totalValue === null) { faStatus.textContent = "Enter the contract's total value."; return; }
  const before = JSON.parse(JSON.stringify(player));
  const teamId = f.team.value;
  player.team = teamId;
  player.contract = { length, totalValue: values.totalValue, signingBonus: values.signingBonus, guaranteed: values.guaranteed };
  delete player.faType;
  const terms = [`${length} year${length === 1 ? "" : "s"}, ${formatCurrency(values.totalValue)}`,
    values.signingBonus ? `${formatCurrency(values.signingBonus)} signing bonus` : "", values.guaranteed ? `${formatCurrency(values.guaranteed)} guaranteed` : ""].filter(Boolean).join(", ");
  logTransaction(officeData, { date: f.date.value, type: "signing", teams: [freeAgentTeamId, teamId], player: player.name, details: `Signed ${terms}` });
  if (!save(`${player.name} signed with the ${teamName(teamId)}: ${terms}. Add his cap hits on the ${teamId} salary sheet.`)) {
    Object.assign(player, before);
    officeData.transactions.pop();
    return;
  }
  signPanel.hidden = true;
  signingId = null;
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

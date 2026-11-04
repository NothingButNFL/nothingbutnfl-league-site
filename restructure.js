// Team sheet "Restructure" tab, laid out like the league's Restructure Template: the player's contract as it is now,
// the changes, and the restructured contract. Uses front-office.js globals (officeData, activeTeamId, saveOfficeData)
// and league-core.js restructurePlan / applyRestructure.
const rsPlayer = document.querySelector("#rs-player");
const rsBase = document.querySelector("#rs-base");
const rsRoster = document.querySelector("#rs-roster");
const rsVoid = document.querySelector("#rs-void");
const rsNote = document.querySelector("#rs-note");
let rsLastAnnouncement = "";

const rsYear = () => seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
const rsPlayers = () => officeData.teams[activeTeamId].roster
  .filter((p) => isPlayerOnSeason(p, rsYear()))
  .sort((a, b) => capHitFor(seasonEntry(b, rsYear())) - capHitFor(seasonEntry(a, rsYear())) || a.name.localeCompare(b.name));

function rsTable(title, player, rows, voidRows, totals) {
  const c = player.contract ? playerContract(player) : null;
  const year = rsYear();
  const position = seasonEntry(player, year).position || "—";
  const age = playerAge(player);
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0) + (key === "proratedBonus" ? voidRows.reduce((s, v) => s + v.amount, 0) : 0);
  const realLength = rows.length;
  const html = [];
  html.push(`<div class="ce-title"><strong>Restructure Template</strong><span class="ce-subtitle">${title}</span></div>`);
  html.push('<div class="management-table-wrap"><table class="ce-summary"><thead><tr><th>NAME</th><th>POSITION</th><th>CONTRACT LENGTH</th><th>TOTAL VALUE</th><th>SIGNING BONUS</th><th>TOTAL GTD</th></tr></thead><tbody><tr>');
  const totalValue = rows.reduce((s, r) => s + r.baseSalary + r.rosterBonus, 0) + sum("proratedBonus");
  const totalGtd = rows.reduce((s, r) => s + r.guaranteedSalary, 0) + sum("proratedBonus");
  html.push(`<td>${escapeHtml(player.name)}</td><td>${escapeHtml(position)}</td><td>${realLength}${voidRows.length ? ` + ${voidRows.length} void` : ""}</td><td>${formatCurrency(totalValue)}</td><td>${formatCurrency(sum("proratedBonus"))}</td><td>${formatCurrency(totalGtd)}</td>`);
  html.push('</tr></tbody></table></div>');
  html.push('<div class="management-table-wrap"><table class="ce-years"><thead><tr><th>YEAR</th><th>BASE SALARY</th><th>SIGNING BONUS</th><th>ROSTER BONUS</th><th>GTD SALARY</th><th>CAP HIT</th></tr></thead><tbody>');
  for (const r of rows) {
    html.push(`<tr${r.changed ? ' class="is-changed"' : ""}><td>${r.season}${age === null ? "" : ` <small>(age ${age + (r.season - year)})</small>`}</td><td>${formatCurrency(r.baseSalary)}</td><td>${formatCurrency(r.proratedBonus)}</td><td>${formatCurrency(r.rosterBonus)}</td><td>${formatCurrency(r.guaranteedSalary)}</td><td><strong>${formatCurrency(r.capHit)}</strong></td></tr>`);
  }
  for (const v of voidRows) {
    html.push(`<tr class="is-void"><td>${v.season} <span class="ce-void-tag">VOID</span></td><td>—</td><td>${formatCurrency(v.amount)}</td><td>—</td><td>—</td><td>${formatCurrency(v.amount)}</td></tr>`);
  }
  html.push(`</tbody><tfoot><tr><th scope="row">TOTALS:</th><td>${formatCurrency(sum("baseSalary"))}</td><td>${formatCurrency(sum("proratedBonus"))}</td><td>${formatCurrency(sum("rosterBonus"))}</td><td>${formatCurrency(sum("guaranteedSalary"))}</td><td>${formatCurrency(rows.reduce((s, r) => s + r.capHit, 0) + voidRows.reduce((s, v) => s + v.amount, 0))}</td></tr></tfoot></table></div>`);
  if (totals) html.push(`<p class="ce-void-note">${totals}</p>`);
  return html.join("");
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

// Void-year rows: the void dead cap is one amount; it's shown split evenly across the void seasons.
function rsVoidRows(amount, startSeason, count) {
  if (!amount || !count) return [];
  const shares = prorationShares(amount, count);
  return shares.map((v, i) => ({ season: startSeason + i, amount: v }));
}

function rsPlan() {
  const player = rsPlayers().find((p) => p.id === rsPlayer.value);
  if (!player) return { player: null };
  const entry = seasonEntry(player, rsYear());
  const base = rsBase.value.trim() ? parseMoneyText(rsBase.value) : entry.baseSalary;
  const roster = rsRoster.value.trim() ? parseMoneyText(rsRoster.value) : entry.rosterBonus;
  if (base === undefined || roster === undefined) return { player, error: "Enter amounts as dollars, like 26,000,000 or 26M." };
  return { player, plan: restructurePlan(officeData, activeTeamId, player, { newBase: base ?? 0, newRoster: roster ?? 0, addVoid: Number(rsVoid.value) || 0 }) };
}

function renderRestructure() {
  const year = rsYear();
  document.querySelectorAll(".rs-year").forEach((el) => { el.textContent = String(year); });
  const players = rsPlayers();
  const keep = rsPlayer.value;
  rsPlayer.replaceChildren(new Option("Choose a player", ""), ...players.map((p) => {
    const e = seasonEntry(p, year);
    return new Option(`${p.name} · ${e.position || "—"} · ${formatCurrency(capHitFor(e))}`, p.id);
  }));
  rsPlayer.value = players.some((p) => p.id === keep) ? keep : "";
  const empty = document.querySelector("#rs-empty");
  empty.hidden = players.length > 0;
  empty.textContent = `No players on the ${year} salary sheet.`;
  rsUpdate();
}

function rsUpdate() {
  const body = document.querySelector("#rs-body");
  const { player, plan, error } = rsPlan();
  body.hidden = !player;
  if (!player) return;
  const year = rsYear();
  const entry = seasonEntry(player, year);
  // Original
  const zero = restructurePlan(officeData, activeTeamId, player, { newBase: entry.baseSalary, newRoster: entry.rosterBonus, addVoid: 0 });
  const originalRows = zero.error ? [] : zero.rows.map((r) => ({ season: r.season, ...r.before }));
  const originalVoid = zero.error ? [] : rsVoidRows(zero.voidBefore, zero.voidSeason, zero.voidHave);
  document.querySelector("#rs-original").innerHTML = rsTable("Original", player, originalRows, originalVoid, "");
  // Void years select
  const maxAdd = zero.error ? 0 : zero.maxAddVoid;
  const keepVoid = Math.min(Number(rsVoid.value) || 0, maxAdd);
  rsVoid.replaceChildren(...Array.from({ length: maxAdd + 1 }, (_, i) => new Option(i ? `${i} void year${i === 1 ? "" : "s"}` : "None", String(i))));
  rsVoid.value = String(keepVoid);
  rsVoid.disabled = maxAdd === 0;
  rsBase.placeholder = formatCurrency(entry.baseSalary);
  rsRoster.placeholder = formatCurrency(entry.rosterBonus);
  const apply = document.querySelector("#rs-apply");
  const message = error || plan?.error;
  if (message) {
    rsNote.textContent = message;
    rsNote.className = "rs-note is-error";
    document.querySelector("#rs-after").innerHTML = "";
    apply.disabled = true;
    return;
  }
  const minNote = plan.floor ? `Base salary can go as low as ${formatCurrency(plan.floor)} (his league minimum).` : "His league minimum isn't set, so base salary can go to $0.";
  rsNote.className = "rs-note";
  rsNote.textContent = plan.amount
    ? `Converting ${formatCurrency(plan.amount)} to signing bonus: ${formatCurrency(plan.shares[0])} a season over ${plan.spread} season${plan.spread === 1 ? "" : "s"}. ${year} cap hit drops by ${formatCurrency(plan.capSavings)}. ${minNote}`
    : `Lower the ${year} base salary or roster bonus to convert it to signing bonus. ${minNote}${maxAdd ? ` You can add up to ${maxAdd} void year${maxAdd === 1 ? "" : "s"}.` : ""}`;
  const afterRows = plan.rows.map((r) => ({ season: r.season, ...r.after, changed: r.after.capHit !== r.before.capHit }));
  const afterVoid = rsVoidRows(plan.voidAfter, plan.voidSeason, plan.voidHave + plan.addVoid);
  const voidNote = plan.voidAfter
    ? `${formatCurrency(plan.voidAfter)} of signing bonus on void years becomes ${plan.voidSeason} dead cap after his final season${plan.voidTracked ? "" : " (past the last salary sheet, so it isn't tracked)"}.`
    : "";
  document.querySelector("#rs-after").innerHTML = rsTable("Restructured", player, afterRows, afterVoid, voidNote);
  apply.disabled = !plan.amount || !storageIsAvailable;
}

rsPlayer.addEventListener("change", () => {
  rsBase.value = ""; rsRoster.value = ""; rsVoid.value = "0";
  document.querySelector("#rs-announcement").hidden = true;
  rsUpdate();
});
for (const el of [rsBase, rsRoster]) {
  el.addEventListener("input", rsUpdate);
  el.addEventListener("change", () => { const v = parseMoneyText(el.value); if (v !== undefined && v !== null) el.value = formatCurrency(v); });
}
rsVoid.addEventListener("change", rsUpdate);

document.querySelector("#rs-apply").addEventListener("click", async () => {
  const { player, plan, error } = rsPlan();
  if (!player || error || plan.error || !plan.amount) return;
  const ok = await confirmAction(`Restructure ${player.name}? ${formatCurrency(plan.amount)} of ${plan.year} salary becomes signing bonus spread over ${plan.spread} season${plan.spread === 1 ? "" : "s"}${plan.addVoid ? ` (adding ${plan.addVoid} void year${plan.addVoid === 1 ? "" : "s"})` : ""}. His ${plan.year} cap hit goes from ${formatCurrency(plan.rows[0].before.capHit)} to ${formatCurrency(plan.rows[0].after.capHit)}.`, { confirmLabel: "Restructure" });
  if (!ok) return;
  const txn = applyRestructure(officeData, activeTeamId, player, plan);
  saveOfficeData(`${player.name} restructured: ${formatCurrency(plan.capSavings)} of ${plan.year} cap space created.`);
  rsLastAnnouncement = txn?.details || restructureAnnouncement(activeTeamId, player, plan);
  const box = document.querySelector("#rs-announcement");
  box.querySelector("pre").textContent = rsLastAnnouncement;
  box.hidden = false;
  rsBase.value = ""; rsRoster.value = ""; rsVoid.value = "0";
  updateCapOverview();
  rsUpdate();
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

document.querySelector("#rs-copy").addEventListener("click", async (event) => {
  const ok = await copyText(rsLastAnnouncement);
  event.target.textContent = ok ? "Copied ✓" : "Couldn't copy";
  setTimeout(() => { event.target.textContent = "Copy announcement"; }, 1800);
});

globalThis.renderRestructure = renderRestructure;
if (!document.querySelector("#restructure-panel").hidden) renderRestructure();

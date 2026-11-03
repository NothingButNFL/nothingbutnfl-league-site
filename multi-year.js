// Team sheet "Multi-Year" tab: this season's roster with each player's cap hit in every salary year,
// and the team's available cap space per season at the bottom. Uses front-office.js globals.
function renderMultiYear() {
  const current = seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
  const team = officeData.teams[activeTeamId];
  const money = (value) => value < 0 ? `−${formatCurrency(Math.abs(value))}` : formatCurrency(value);
  const players = team.roster
    .filter((player) => isPlayerOnSeason(player, current))
    .sort((a, b) => capHitFor(seasonEntry(b, current)) - capHitFor(seasonEntry(a, current)) || a.name.localeCompare(b.name));

  // Header
  const headRow = document.createElement("tr");
  for (const label of ["PLAYER", "POS", ...seasons.map(String)]) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    if (label === String(current)) th.className = "is-current";
    headRow.append(th);
  }
  document.querySelector("#multi-year-head").replaceChildren(headRow);

  // One row per player
  document.querySelector("#multi-year-rows").replaceChildren(...players.map((player) => {
    const tr = document.createElement("tr");
    const nameCell = tr.insertCell();
    nameCell.className = "my-player";
    const link = document.createElement("a");
    link.className = "player-name-link";
    link.href = profileUrl(player.id);
    link.textContent = player.name;
    nameCell.append(link);
    tr.insertCell().textContent = seasonEntry(player, current).position || "—";
    for (const year of seasons) {
      const cell = tr.insertCell();
      cell.className = `my-money${year === current ? " is-current" : ""}`;
      if (isPlayerOnSeason(player, year)) cell.textContent = formatCurrency(capHitFor(seasonEntry(player, year)));
      else { cell.textContent = "—"; cell.classList.add("is-empty"); }
    }
    return tr;
  }));
  document.querySelector("#multi-year-empty").hidden = players.length > 0;

  // Totals and available cap space
  const figures = seasons.map((year) => seasonCapFigures(activeTeamId, year));
  const listed = seasons.map((year) => players.reduce((sum, p) => sum + (isPlayerOnSeason(p, year) ? capHitFor(seasonEntry(p, year)) : 0), 0));
  const others = figures.map((f, i) => f.payroll - listed[i]);
  const footRows = [["Roster cap hits", listed.map(formatCurrency)]];
  if (others.some((v) => v !== 0)) footRows.push(["Players not on the " + current + " roster", others.map((v) => v ? formatCurrency(v) : "—")]);
  footRows.push(["Dead cap", figures.map((f) => f.deadCap ? formatCurrency(f.deadCap) : "—")]);
  footRows.push(["Total cap space", figures.map((f) => f.totalCap === null ? "Not set" : money(f.totalCap))]);
  const foot = footRows.map(([label, values]) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.colSpan = 2;
    th.textContent = label;
    tr.append(th);
    values.forEach((value, i) => {
      const td = tr.insertCell();
      td.className = `my-money${seasons[i] === current ? " is-current" : ""}`;
      td.textContent = value;
    });
    return tr;
  });
  const room = document.createElement("tr");
  room.className = "my-room";
  const roomLabel = document.createElement("th");
  roomLabel.scope = "row";
  roomLabel.colSpan = 2;
  roomLabel.textContent = "Available cap space";
  room.append(roomLabel);
  figures.forEach((f, i) => {
    const td = room.insertCell();
    td.className = `my-money${seasons[i] === current ? " is-current" : ""}${f.remaining === null ? "" : f.remaining < 0 ? " is-negative" : f.remaining > 0 ? " is-positive" : ""}`;
    td.textContent = f.remaining === null ? "Set base cap" : money(f.remaining);
  });
  foot.push(room);
  document.querySelector("#multi-year-foot").replaceChildren(...foot);
  document.querySelector("#multi-year-note").textContent =
    `Every player on the ${current} roster, with their cap hit in each salary year. Available cap space is total cap space minus every cap hit and dead cap for that season, including rollover.`;
}
globalThis.renderMultiYear = renderMultiYear;
if (!document.querySelector("#multi-year-panel").hidden) renderMultiYear();

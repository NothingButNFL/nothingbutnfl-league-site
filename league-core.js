// Shared Nothing But NFL front-office data model, cap math and trade logic.
// Loaded after teams.js on team.html, admin.html and admin-trades.html.
const firstSeason = 2026;
const seasonCount = 8;
const seasons = Array.from({ length: seasonCount }, (_, index) => firstSeason + index);
const deadCapSeasons = seasons.slice(0, 2); // only the first two salary sheets (2026, 2027) have dead-cap tables
const pendingTradeStatuses = ["awaiting-teams", "awaiting-admin", "approved", "rejected", "declined", "withdrawn"];

function emptySeasonData(position = "", rosterType = "") {
  return {
    position,
    rosterType,
    experience: null,
    baseSalary: 0,
    proratedBonus: 0,
    rosterBonus: 0,
    guaranteedSalary: 0,
    yearsRemaining: 0,
    tradePenalty: 0,
    tradeNetSavings: 0,
    releasePenalty: 0,
    releaseNetSavings: 0
  };
}

function seasonHasPlayerData(entry) {
  return Boolean(entry.position.trim() || entry.rosterType.trim() ||
    entry.baseSalary || entry.proratedBonus || entry.rosterBonus || entry.guaranteedSalary ||
    entry.yearsRemaining || entry.tradePenalty || entry.tradeNetSavings ||
    entry.releasePenalty || entry.releaseNetSavings);
}

function emptyOfficeData(selectedTeam = nflTeams[0].id) {
  return {
    schema: "nbf-front-office",
    version: 5,
    selectedTeam,
    leagueCaps: Object.fromEntries(seasons.map((year) => [year, null])),
    teams: Object.fromEntries(nflTeams.map(({ id }) => [id, {
      roster: [],
      deadCap: Object.fromEntries(seasons.map((year) => [year, []])),
      seasons: Object.fromEntries(seasons.map((year) => [year, { manualAdjustment: 0 }]))
    }])),
    picks: [],
    pendingTrades: [],
    contractPlayers: [],
    transactions: [],
    injuries: []
  };
}

function isIntegerInRange(value, min = 0, max = 999999999) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

function validateOfficeData(data) {
  if (!data || data.schema !== "nbf-front-office" || data.version !== 5 ||
      !data.leagueCaps || !data.teams || typeof data.teams !== "object" || !Array.isArray(data.picks) ||
      (data.selectedTeam !== undefined && !nflTeams.some(({ id }) => id === data.selectedTeam)) ||
      Object.keys(data.teams).length !== nflTeams.length || data.picks.length > 5000) return false;

  for (const year of seasons) {
    const cap = data.leagueCaps[year];
    if (cap !== null && !isIntegerInRange(cap)) return false;
  }

  const playerIds = new Set();
  for (const { id } of nflTeams) {
    const team = data.teams[id];
    if (!team || !Array.isArray(team.roster) || team.roster.length > 5000 || !team.seasons || !team.deadCap) return false;
    for (const year of seasons) {
      const adjustment = team.seasons[year]?.manualAdjustment;
      if (!Number.isSafeInteger(adjustment) || Math.abs(adjustment) > 999999999 ||
          !Array.isArray(team.deadCap[year]) || team.deadCap[year].length > 5000) return false;
      for (const record of team.deadCap[year]) {
        if (!record || typeof record.id !== "string" || !record.id ||
            typeof record.playerName !== "string" || !record.playerName.trim() || record.playerName.length > 70 ||
            (record.position !== undefined && (typeof record.position !== "string" || record.position.length > 8)) ||
            !["trade", "release", "import"].includes(record.transaction) ||
            !Number.isInteger(record.transactionYear) || !seasons.includes(record.transactionYear) ||
            !Number.isSafeInteger(record.amount) || record.amount < 0 ||
            typeof record.date !== "string" || !record.date) return false;
      }
    }
    for (const player of team.roster) {
      if (!player || typeof player.id !== "string" || !player.id || playerIds.has(player.id) ||
          typeof player.name !== "string" || !player.name.trim() || player.name.length > 70 ||
          !player.seasons || !Array.isArray(player.activeSeasons) || !player.activeSeasons.length ||
          player.activeSeasons.some((year) => !seasons.includes(year)) ||
          new Set(player.activeSeasons).size !== player.activeSeasons.length) return false;
      if (!validPlayerContractFields(player)) return false;
      playerIds.add(player.id);
      for (const year of seasons) {
        const entry = player.seasons[year];
        if (!entry || typeof entry.position !== "string" || entry.position.length > 8 ||
            typeof entry.rosterType !== "string" || entry.rosterType.length > 30 ||
            (entry.experience !== undefined && entry.experience !== null && !isIntegerInRange(entry.experience, 0, 40)) ||
            !isIntegerInRange(entry.baseSalary) || !isIntegerInRange(entry.proratedBonus) ||
            !isIntegerInRange(entry.rosterBonus) || !isIntegerInRange(entry.guaranteedSalary) ||
            !isIntegerInRange(entry.yearsRemaining, 0, 8) ||
            !isIntegerInRange(entry.tradePenalty) || !Number.isSafeInteger(entry.tradeNetSavings) ||
            Math.abs(entry.tradeNetSavings) > 999999999 || !isIntegerInRange(entry.releasePenalty) ||
            !Number.isSafeInteger(entry.releaseNetSavings) || Math.abs(entry.releaseNetSavings) > 999999999) return false;
      }
    }
  }

  const pickIds = new Set();
  for (const pick of data.picks) {
    if (!pick || typeof pick.id !== "string" || !pick.id || pickIds.has(pick.id) ||
        !Number.isInteger(pick.year) || pick.year < 2000 || pick.year > 2100 ||
        !Number.isInteger(pick.round) || pick.round < 1 || pick.round > 20 ||
        !nflTeams.some(({ id }) => id === pick.originalTeam) ||
        !nflTeams.some(({ id }) => id === pick.currentOwner) ||
        (pick.note !== undefined && (typeof pick.note !== "string" || pick.note.length > pickNoteMaxLength)) ||
        (pick.compensatory !== undefined && typeof pick.compensatory !== "boolean")) return false;
    pickIds.add(pick.id);
  }
  return validPendingTrades(data.pendingTrades) && validFreeAgents(data.freeAgents) &&
    validContractPlayers(data.contractPlayers) && validTransactions(data.transactions) && validStandings(data.standings) && validStats(data.stats) && validGames(data.games) && validInjuries(data.injuries) && validKeyDates(data.keyDates) && validMembers(data.members) && validMedia(data.media);
}

function migrateLegacyData(data) {
  if (!data || data.schema !== "nbf-front-office" || data.version !== 1 || !data.teams ||
      !Array.isArray(data.picks) || Object.keys(data.teams).length !== nflTeams.length) {
    throw new Error("This file is not a valid front-office backup. No changes were made.");
  }

  const migrated = emptyOfficeData();
  migrated.picks = data.picks;
  const oldCaps = nflTeams.map(({ id }) => data.teams[id]?.salaryCap).filter((cap) => Number.isSafeInteger(cap));
  const sharedLegacyCap = oldCaps.length ? Math.max(...oldCaps) : null;
  migrated.leagueCaps[firstSeason] = sharedLegacyCap;

  for (const { id } of nflTeams) {
    const oldTeam = data.teams[id];
    if (!oldTeam || !Array.isArray(oldTeam.roster)) {
      throw new Error("This file is not a valid front-office backup. No changes were made.");
    }
    const team = migrated.teams[id];
    if (oldTeam.salaryCap !== null && Number.isSafeInteger(oldTeam.salaryCap)) {
      team.seasons[firstSeason].manualAdjustment = oldTeam.salaryCap - sharedLegacyCap;
    }
    team.roster = oldTeam.roster.map((oldPlayer) => {
      if (!oldPlayer || typeof oldPlayer.name !== "string" || typeof oldPlayer.position !== "string" ||
          !Number.isSafeInteger(oldPlayer.capHit) || !Number.isInteger(oldPlayer.years)) {
        throw new Error("This file is not a valid front-office backup. No changes were made.");
      }
      const player = {
        id: oldPlayer.id,
        name: oldPlayer.name,
        activeSeasons: [firstSeason],
        seasons: Object.fromEntries(seasons.map((year) => [year, emptySeasonData(oldPlayer.position, "Active")]))
      };
      player.seasons[firstSeason].baseSalary = oldPlayer.capHit;
      player.seasons[firstSeason].yearsRemaining = Math.max(0, Math.min(8, oldPlayer.years));
      return player;
    });
  }
  if (!validateOfficeData(migrated)) {
    throw new Error("This file is not a valid front-office backup. No changes were made.");
  }
  return migrated;
}

function migrateVersionThreeData(data) {
  if (!data || data.schema !== "nbf-front-office" || data.version !== 3 || !data.teams ||
      !Array.isArray(data.picks) || Object.keys(data.teams).length !== nflTeams.length) {
    throw new Error("This file is not a valid front-office backup. No changes were made.");
  }

  const migrated = {
    ...data,
    version: 4,
    teams: Object.fromEntries(nflTeams.map(({ id }) => {
      const oldTeam = data.teams[id];
      if (!oldTeam || !Array.isArray(oldTeam.roster)) {
        throw new Error("This file is not a valid front-office backup. No changes were made.");
      }
      return [id, {
        ...oldTeam,
        roster: oldTeam.roster.map((oldPlayer) => {
          if (!oldPlayer?.seasons) {
            throw new Error("This file is not a valid front-office backup. No changes were made.");
          }
          const activeSeasons = seasons.filter((year) => {
            const entry = oldPlayer.seasons[year];
            return entry && seasonHasPlayerData(entry);
          });
          return {
            ...oldPlayer,
            activeSeasons: activeSeasons.length ? activeSeasons : [firstSeason]
          };
        })
      }];
    }))
  };
  return migrateVersionFourData(migrated);
}

function migrateVersionFourData(data) {
  if (!data || data.schema !== "nbf-front-office" || data.version !== 4 || !data.teams ||
      !Array.isArray(data.picks) || Object.keys(data.teams).length !== nflTeams.length) {
    throw new Error("This file is not a valid front-office backup. No changes were made.");
  }
  const migrated = {
    ...data,
    version: 5,
    teams: Object.fromEntries(nflTeams.map(({ id }) => {
      const oldTeam = data.teams[id];
      if (!oldTeam || !Array.isArray(oldTeam.roster) || !oldTeam.seasons) {
        throw new Error("This file is not a valid front-office backup. No changes were made.");
      }
      return [id, {
        ...oldTeam,
        deadCap: Object.fromEntries(seasons.map((year) => [year, []]))
      }];
    }))
  };
  if (!validateOfficeData(migrated)) {
    throw new Error("This file is not a valid front-office backup. No changes were made.");
  }
  return migrated;
}

function migrateVersionTwoData(data) {
  if (!data || data.schema !== "nbf-front-office" || data.version !== 2 || !data.teams ||
      !Array.isArray(data.picks) || Object.keys(data.teams).length !== nflTeams.length) {
    throw new Error("This file is not a valid front-office backup. No changes were made.");
  }

  const migrated = emptyOfficeData();
  migrated.selectedTeam = data.selectedTeam;
  migrated.leagueCaps = data.leagueCaps;
  migrated.picks = data.picks;
  for (const { id } of nflTeams) {
    const oldTeam = data.teams[id];
    if (!oldTeam || !Array.isArray(oldTeam.roster) || !oldTeam.seasons) {
      throw new Error("This file is not a valid front-office backup. No changes were made.");
    }
    migrated.teams[id] = {
      roster: oldTeam.roster.map((oldPlayer) => {
        if (!oldPlayer || typeof oldPlayer.position !== "string" || typeof oldPlayer.rosterType !== "string" ||
            !oldPlayer.seasons) {
          throw new Error("This file is not a valid front-office backup. No changes were made.");
        }
        const player = {
          id: oldPlayer.id,
          name: oldPlayer.name,
          seasons: Object.fromEntries(seasons.map((year) => [year, {
            ...oldPlayer.seasons[year],
            position: oldPlayer.position,
            rosterType: oldPlayer.rosterType
          }]))
        };
        player.activeSeasons = seasons.filter((year) => seasonHasPlayerData(player.seasons[year]));
        if (!player.activeSeasons.length) player.activeSeasons = [firstSeason];
        return player;
      }),
      deadCap: Object.fromEntries(seasons.map((year) => [year, []])),
      seasons: Object.fromEntries(seasons.map((year) => [year, oldTeam.seasons[year]]))
    };
  }
  if (!validateOfficeData(migrated)) {
    throw new Error("This file is not a valid front-office backup. No changes were made.");
  }
  return migrated;
}

function seasonEntry(player, year) {
  return player.seasons[year];
}

function isPlayerOnSeason(player, year) {
  return player.activeSeasons.includes(year);
}

function currentLeagueYear(date = new Date()) {
  const year = date.getFullYear();
  return date.getMonth() >= 2 ? year : year - 1;
}

function isEarlyLeagueWindow(date = new Date()) {
  return date.getMonth() >= 2 && date.getMonth() <= 4;
}

function yearsRemainingFor(player, year) {
  return seasons.filter((season) =>
    season >= year && isPlayerOnSeason(player, season) && seasonEntry(player, season).baseSalary > 0
  ).length;
}

function calculatedPenaltiesFor(player, year, date = new Date()) {
  if (year !== currentLeagueYear(date)) return null;
  const currentEntry = seasonEntry(player, year);
  const futureSeasons = seasons.filter((season) =>
    season > year && isPlayerOnSeason(player, season)
  );
  const includeFutureInCurrent = isEarlyLeagueWindow(date);
  return {
    tradePenalty: currentEntry.proratedBonus + (includeFutureInCurrent
      ? futureSeasons.reduce((total, season) => total + seasonEntry(player, season).proratedBonus, 0)
      : 0),
    releasePenalty: currentEntry.proratedBonus + currentEntry.guaranteedSalary + (includeFutureInCurrent
      ? futureSeasons.reduce((total, season) => {
        const entry = seasonEntry(player, season);
        return total + entry.proratedBonus + entry.guaranteedSalary;
      }, 0)
      : 0),
    futureTradeDeadCap: includeFutureInCurrent ? 0 : futureSeasons.reduce((total, season) =>
      total + seasonEntry(player, season).proratedBonus, 0),
    futureReleaseDeadCap: includeFutureInCurrent ? 0 : futureSeasons.reduce((total, season) => {
      const entry = seasonEntry(player, season);
      return total + entry.proratedBonus + entry.guaranteedSalary;
    }, 0)
  };
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatSignedCurrency(value) {
  if (value === 0) return formatCurrency(0);
  return value > 0 ? `+${formatCurrency(value)}` : formatCurrency(value);
}

function capHitFor(entry) {
  return entry.baseSalary + entry.proratedBonus + entry.rosterBonus;
}

function seasonCapFigures(teamId, year, data = officeData) {
  const team = data.teams[teamId];
  const payroll = team.roster.reduce((sum, player) =>
    sum + (isPlayerOnSeason(player, year) ? capHitFor(seasonEntry(player, year)) : 0), 0);
  const deadCap = team.deadCap[year].reduce((sum, record) => sum + record.amount, 0);
  const previous = year > firstSeason ? seasonCapFigures(teamId, year - 1, data) : null;
  const rollover = previous?.remaining ?? 0;
  const baseCap = data.leagueCaps[year];
  const totalCap = baseCap === null ? null : baseCap + rollover + team.seasons[year].manualAdjustment;
  return {
    payroll,
    deadCap,
    baseCap,
    rollover,
    totalCap,
    remaining: totalCap === null ? null : totalCap - payroll - deadCap
  };
}

function loadOfficeData(data) {
  if (data?.version === 1) return migrateLegacyData(data);
  if (data?.version === 2) return migrateVersionTwoData(data);
  if (data?.version === 3) return migrateVersionThreeData(data);
  if (data?.version === 4) return migrateVersionFourData(data);
  if (!validateOfficeData(data)) {
    throw new Error("The saved front-office data is invalid. Import a valid backup or reset local data to start fresh.");
  }
  return data;
}

function validPendingTrades(trades) {
  if (trades === undefined) return true;
  if (!Array.isArray(trades) || trades.length > 2000) return false;
  const teamIds = new Set(nflTeams.map(({ id }) => id));
  const tradeIds = new Set();
  for (const trade of trades) {
    if (!trade || typeof trade.id !== "string" || !trade.id || tradeIds.has(trade.id) ||
        !pendingTradeStatuses.includes(trade.status) || !teamIds.has(trade.proposedBy) ||
        !Array.isArray(trade.participants) || trade.participants.length < 2 || trade.participants.length > 3 ||
        trade.participants.some((id) => !teamIds.has(id)) ||
        new Set(trade.participants).size !== trade.participants.length ||
        !trade.participants.includes(trade.proposedBy) ||
        !Array.isArray(trade.acceptedBy) || trade.acceptedBy.some((id) => !trade.participants.includes(id)) ||
        !Array.isArray(trade.lines) || !trade.lines.length || trade.lines.length > 100 ||
        typeof trade.createdAt !== "string" ||
        (trade.resolvedAt !== undefined && typeof trade.resolvedAt !== "string") ||
        (trade.note !== undefined && (typeof trade.note !== "string" || trade.note.length > 300)) ||
        (trade.pickMoves !== undefined && (!Array.isArray(trade.pickMoves) || trade.pickMoves.some((move) => typeof move !== "string")))) return false;
    for (const line of trade.lines) {
      if (!line || !trade.participants.includes(line.fromTeamId) || !trade.participants.includes(line.destinationId) ||
          line.fromTeamId === line.destinationId || typeof line.assetKey !== "string" ||
          !/^(player|pick):.+/.test(line.assetKey)) return false;
    }
    tradeIds.add(trade.id);
  }
  return true;
}

function loadStoredOfficeData(raw) {
  const data = loadOfficeData(raw);
  if (!Array.isArray(data.pendingTrades)) data.pendingTrades = [];
  if (!Array.isArray(data.contractPlayers)) data.contractPlayers = [];
  // Older saves kept free agents in their own list; they are now directory players on team "FA".
  if (Array.isArray(data.freeAgents)) {
    data.contractPlayers.push(...data.freeAgents.map((player) => ({ ...player, team: freeAgentTeamId })));
    delete data.freeAgents;
  }
  moveExperienceToPlayers(data);
  if (!Array.isArray(data.transactions)) data.transactions = transactionsFromTradeHistory(data);
  upgradeTradeLogEntries(data);
  upgradeInjuries(data);
  mergeDirectoryIntoRosters(data);
  return data;
}

function newRecordId(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function teamName(teamId) {
  return nflTeams.find(({ id }) => id === teamId)?.name || teamId;
}

function tradeAssetLabel(data, assetKey, teamId, year) {
  const [kind, id] = assetKey.split(":");
  if (kind === "player") {
    const player = data.teams[teamId].roster.find((item) => item.id === id);
    if (!player || !isPlayerOnSeason(player, year)) return null;
    const entry = seasonEntry(player, year);
    return `Player · ${player.name} (${entry.position || "—"}) · ${formatCurrency(capHitFor(entry))}`;
  }
  if (kind === "pick") {
    const pick = data.picks.find((item) => item.id === id);
    if (!pick || pick.currentOwner !== teamId) return null;
    return `Pick · ${pick.year} Round ${pickRoundLabel(pick)} · ${pick.originalTeam}${pick.note ? ` (${pick.note})` : ""}`;
  }
  return null;
}

// Cap-space impact of a trade for each participant in the given league year.
// Prorated bonuses stay with the sending team as dead cap, so the receiving
// team only takes on the remaining (non-prorated) cap hit.
function calculateTradeImpacts(data, lines, participants, year = currentLeagueYear()) {
  const impacts = Object.fromEntries(participants.map((teamId) => [teamId, {
    incoming: 0,
    outgoing: 0,
    deadCap: 0,
    net: 0,
    remaining: seasonCapFigures(teamId, year, data).remaining
  }]));
  for (const line of lines) {
    if (!line.assetKey || !impacts[line.fromTeamId] || !impacts[line.destinationId]) continue;
    const [kind, id] = line.assetKey.split(":");
    if (kind !== "player") continue;
    const player = data.teams[line.fromTeamId].roster.find((item) => item.id === id);
    if (!player || !isPlayerOnSeason(player, year)) continue;
    const entry = seasonEntry(player, year);
    const capHit = capHitFor(entry);
    const penalty = calculatedPenaltiesFor(player, year)?.tradePenalty || 0;
    impacts[line.fromTeamId].outgoing += capHit;
    impacts[line.fromTeamId].deadCap += penalty;
    impacts[line.destinationId].incoming += capHit - entry.proratedBonus;
  }
  for (const impact of Object.values(impacts)) {
    impact.net = impact.outgoing - impact.deadCap - impact.incoming;
  }
  return impacts;
}

// Checks that every asset in a trade is still owned by its sending team.
// Returns { assets } on success or { error } describing the first problem.
function validateTradeAssets(data, lines, participants, year = currentLeagueYear()) {
  if (participants.length < 2 || participants.length > 3 || !lines.length || lines.length > 100) {
    return { error: "A trade needs one or two partner teams and between 1 and 100 assets." };
  }
  const seenAssets = new Set();
  const assets = [];
  const incomingPlayers = Object.fromEntries(participants.map((id) => [id, 0]));
  const deadCapAdds = Object.fromEntries(participants.map((id) => [id, { current: 0, next: 0 }]));
  for (const line of lines) {
    if (!line.assetKey || !participants.includes(line.fromTeamId) ||
        !participants.includes(line.destinationId) || line.fromTeamId === line.destinationId) {
      return { error: "Each trade item needs a valid asset and a different destination team." };
    }
    const key = `${line.fromTeamId}:${line.assetKey}`;
    if (seenAssets.has(key)) return { error: "An asset can only be included once in a trade." };
    seenAssets.add(key);
    const [kind, id] = line.assetKey.split(":");
    if (kind === "player") {
      const player = data.teams[line.fromTeamId].roster.find((item) => item.id === id);
      if (!player || !isPlayerOnSeason(player, year)) {
        return { error: `A player sent by ${teamName(line.fromTeamId)} is no longer on its ${year} salary sheet.` };
      }
      const penalties = calculatedPenaltiesFor(player, year);
      if (!penalties) return { error: `Could not calculate trade dead cap for ${player.name}.` };
      incomingPlayers[line.destinationId] += 1;
      deadCapAdds[line.fromTeamId].current += 1;
      if (penalties.futureTradeDeadCap > 0 && deadCapSeasons.includes(year + 1)) deadCapAdds[line.fromTeamId].next += 1;
      assets.push({ ...line, kind, id, player, penalties });
    } else if (kind === "pick") {
      const pick = data.picks.find((item) => item.id === id && item.currentOwner === line.fromTeamId);
      if (!pick) return { error: `A draft pick sent by ${teamName(line.fromTeamId)} is no longer owned by that team.` };
      assets.push({ ...line, kind, id, pick });
    } else {
      return { error: "A selected trade asset is invalid." };
    }
  }
  if (participants.some((id) => data.teams[id].roster.length + incomingPlayers[id] > 5000)) {
    return { error: "This trade would exceed a team's 5,000-player roster limit." };
  }
  if (participants.some((id) =>
    data.teams[id].deadCap[year].length + deadCapAdds[id].current > 5000 ||
    (seasons.includes(year + 1) && data.teams[id].deadCap[year + 1].length + deadCapAdds[id].next > 5000)
  )) {
    return { error: "This trade would exceed a team's 5,000-entry dead-cap limit." };
  }
  return { assets };
}

// Moves players and picks between teams. The sending team keeps all remaining
// prorated bonus money as dead cap (Mar 1–May 31: all of it this year;
// Jun 1–Feb 28: this year's portion now, future portions on next year's ledger).
function applyTradeAssets(data, assets, year = currentLeagueYear()) {
  const date = new Date().toISOString();
  for (const asset of assets) {
    const sourceTeam = data.teams[asset.fromTeamId];
    const destinationTeam = data.teams[asset.destinationId];
    if (asset.kind === "pick") {
      asset.pick.currentOwner = asset.destinationId;
      asset.pick.note = withTradeNote(asset.pick.note, asset.fromTeamId);
      continue;
    }
    sourceTeam.roster = sourceTeam.roster.filter(({ id }) => id !== asset.id);
    const position = seasonEntry(asset.player, year).position;
    for (const season of seasons) {
      if (season >= year && isPlayerOnSeason(asset.player, season)) {
        asset.player.seasons[season].proratedBonus = 0;
      }
    }
    destinationTeam.roster.push(asset.player);
    const record = (amount) => ({
      id: newRecordId("dead-cap"),
      playerName: asset.player.name,
      position,
      transaction: "trade",
      transactionYear: year,
      amount,
      date
    });
    sourceTeam.deadCap[year].push(record(asset.penalties.tradePenalty));
    if (asset.penalties.futureTradeDeadCap > 0 && deadCapSeasons.includes(year + 1)) {
      sourceTeam.deadCap[year + 1].push(record(asset.penalties.futureTradeDeadCap));
    }
  }
}

function tradesAwaitingTeam(data, teamId) {
  return (data.pendingTrades || []).filter((trade) =>
    trade.status === "awaiting-teams" && trade.participants.includes(teamId) && !trade.acceptedBy.includes(teamId));
}

function tradesAwaitingAdmin(data) {
  return (data.pendingTrades || []).filter((trade) => trade.status === "awaiting-admin");
}

function readStoredOffice() {
  const saved = localStorage.getItem(officeStorageKey);
  return saved ? loadStoredOfficeData(JSON.parse(saved)) : null;
}

function writeStoredOffice(data) {
  localStorage.setItem(officeStorageKey, JSON.stringify(data));
  globalThis.refreshNavNotifications?.();
}

const tradeStatusLabels = {
  "awaiting-teams": "Waiting on teams",
  "awaiting-admin": "Awaiting admin approval",
  approved: "Approved",
  rejected: "Rejected by admin",
  declined: "Declined",
  withdrawn: "Withdrawn"
};

function tradeActionButton(text, action, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = primary ? "button button-lime trade-offer-button" : "workspace-button trade-offer-button";
  button.dataset.tradeAction = action;
  button.textContent = text;
  return button;
}

// Card summarising one proposed trade: who sends what, where it is in the
// approval process and (optionally) each team's cap-space impact.
function buildTradeCard(data, trade, { showImpact = false, year = currentLeagueYear() } = {}) {
  const card = document.createElement("article");
  card.className = `trade-offer is-${trade.status}`;
  card.dataset.tradeId = trade.id;

  const head = document.createElement("div");
  head.className = "trade-offer-head";
  const title = document.createElement("h5");
  title.textContent = trade.participants.map((id) => id).join(" ⇄ ");
  const status = document.createElement("span");
  status.className = "trade-offer-status";
  status.textContent = tradeStatusLabels[trade.status] || trade.status;
  head.append(title, status);

  const meta = document.createElement("p");
  meta.className = "trade-offer-meta";
  meta.textContent = `Proposed by ${teamName(trade.proposedBy)} · ${new Date(trade.createdAt).toLocaleDateString()}`;

  const sides = document.createElement("div");
  sides.className = "trade-offer-sides";
  const isOpen = ["awaiting-teams", "awaiting-admin"].includes(trade.status);
  for (const teamId of trade.participants) {
    const side = document.createElement("div");
    side.className = "trade-offer-side";
    const sideTitle = document.createElement("h6");
    sideTitle.textContent = `${teamName(teamId)} sends`;
    const list = document.createElement("ul");
    const outgoing = trade.lines.filter((line) => line.fromTeamId === teamId);
    if (!outgoing.length) {
      const item = document.createElement("li");
      item.textContent = "Nothing";
      list.append(item);
    }
    for (const line of outgoing) {
      const item = document.createElement("li");
      const label = isOpen ? tradeAssetLabel(data, line.assetKey, teamId, year) : null;
      item.textContent = `${label || (isOpen ? "No longer available" : "Asset")} → ${line.destinationId}`;
      if (isOpen && !label) item.className = "is-unavailable";
      list.append(item);
    }
    side.append(sideTitle, list);
    sides.append(side);
  }

  const progress = document.createElement("p");
  progress.className = "trade-offer-progress";
  if (trade.status === "awaiting-teams") {
    const waitingOn = trade.participants.filter((id) => !trade.acceptedBy.includes(id)).map(teamName);
    progress.textContent = `Waiting on: ${waitingOn.join(", ")}`;
  } else if (trade.status === "awaiting-admin") {
    progress.textContent = "All teams accepted · waiting for commissioner approval";
  } else {
    progress.textContent = [trade.note, trade.resolvedAt ? new Date(trade.resolvedAt).toLocaleDateString() : ""]
      .filter(Boolean).join(" · ");
    if (trade.pickMoves?.length) progress.textContent += ` · Picks moved: ${trade.pickMoves.join("; ")}`;
  }

  card.append(head, meta, sides, progress);

  if (showImpact && isOpen) {
    const impacts = calculateTradeImpacts(data, trade.lines, trade.participants, year);
    const impactList = document.createElement("dl");
    impactList.className = "trade-offer-impact";
    for (const teamId of trade.participants) {
      const impact = impacts[teamId];
      const row = document.createElement("div");
      const term = document.createElement("dt");
      term.textContent = `${teamName(teamId)} · ${year} cap change`;
      const value = document.createElement("dd");
      value.textContent = `${formatSignedCurrency(impact.net)}` +
        (impact.remaining === null ? " · base cap not set" : ` · room after: ${formatSignedCurrency(impact.remaining + impact.net)}`);
      value.className = impact.net > 0 ? "is-positive-savings" : impact.net < 0 ? "is-negative-savings" : "";
      row.append(term, value);
      impactList.append(row);
    }
    card.append(impactList);
  }

  const actions = document.createElement("div");
  actions.className = "trade-offer-actions";
  card.append(actions);
  return card;
}

// ---- NFL experience lookup (data in nfl-experience.js) ----
function normalizePlayerName(name) {
  return String(name).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[.'’`]/g, "").replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, " ").replace(/\s+/g, " ").trim();
}

let nflExperienceIndex = null;
function experienceIndex() {
  if (nflExperienceIndex || typeof nflExperienceSnapshot === "undefined") return nflExperienceIndex;
  nflExperienceIndex = new Map();
  for (const [fullName, altName, team, position, experience, status, birthDate, college, height, weight, draftYear, draftRound, draftPick] of nflExperienceSnapshot.players) {
    const record = { fullName, team, position, experience, status, birthDate, college, height, weight, draftYear, draftRound, draftPick };
    for (const key of new Set([normalizePlayerName(fullName), altName && normalizePlayerName(altName)].filter(Boolean))) {
      if (!nflExperienceIndex.has(key)) nflExperienceIndex.set(key, []);
      nflExperienceIndex.get(key).push(record);
    }
  }
  return nflExperienceIndex;
}

const positionGroups = [
  ["QB"], ["RB", "HB", "FB"], ["WR"], ["TE"],
  ["OT", "T", "LT", "RT", "OG", "G", "LG", "RG", "C", "OL", "IOL"],
  ["DE", "DT", "NT", "DL", "IDL", "EDGE"], ["LB", "ILB", "OLB", "MLB", "EDGE"],
  ["CB", "S", "FS", "SS", "DB", "SAF"], ["K", "PK"], ["P"], ["LS"]
];
function samePositionGroup(a, b) {
  a = String(a || "").toUpperCase(); b = String(b || "").toUpperCase();
  return a === b || positionGroups.some((group) => group.includes(a) && group.includes(b));
}

// Finds a player's NFL experience by name, using position and team only to
// break ties between players who share a name.
function matchNflExperience(name, position, teamId) {
  const index = experienceIndex();
  if (!index) return { error: "unavailable" };
  let candidates = index.get(normalizePlayerName(name)) || [];
  if (!candidates.length) return { error: "not-found" };
  for (const narrow of [
    (c) => c.filter((p) => samePositionGroup(p.position, position)),
    (c) => c.filter((p) => p.team === teamId),
    (c) => c.filter((p) => !["CUT", "RET"].includes(p.status))
  ]) {
    if (candidates.length === 1) break;
    const narrowed = narrow(candidates);
    if (narrowed.length) candidates = narrowed;
  }
  if (new Set(candidates.map((p) => `${p.experience}|${p.birthDate}`)).size > 1) return { error: "ambiguous", candidates };
  return { experience: candidates[0].experience, record: candidates[0] };
}

// ---- Player-level contract details (Player Contracts page) ----
const contractMoneyFields = ["totalValue", "signingBonus", "guaranteed"];
const maxContractDollars = 9999999999;

function validPlayerContractFields(player) {
  if (player.age !== undefined && player.age !== null && !isIntegerInRange(player.age, 15, 60)) return false;
  if (player.birthDate !== undefined && player.birthDate !== null &&
      (typeof player.birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(player.birthDate))) return false;
  if (player.faType !== undefined && (typeof player.faType !== "string" || player.faType.length > 24)) return false;
  if (player.experience !== undefined && player.experience !== null && !isIntegerInRange(player.experience, 0, 40)) return false;
  if (player.profile !== undefined && !validPlayerProfile(player.profile)) return false;
  if (player.contract !== undefined) {
    const contract = player.contract;
    if (!contract || typeof contract !== "object") return false;
    if (contract.length !== null && contract.length !== undefined && !isIntegerInRange(contract.length, 0, 15)) return false;
    for (const field of contractMoneyFields) {
      const value = contract[field];
      if (value !== null && value !== undefined && !isIntegerInRange(value, 0, maxContractDollars)) return false;
    }
  }
  return true;
}

function ageFromBirthDate(birthDate, today = new Date()) {
  const [year, month, day] = birthDate.split("-").map(Number);
  let age = today.getFullYear() - year;
  if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age -= 1;
  return age;
}

function playerAge(player) {
  if (player.birthDate) return ageFromBirthDate(player.birthDate);
  return player.age ?? null;
}

function playerContract(player) {
  return { length: null, totalValue: null, signingBonus: null, guaranteed: null, ...(player.contract || {}) };
}

function contractAav(contract) {
  return contract.length > 0 && contract.totalValue !== null ? Math.round(contract.totalValue / contract.length) : null;
}

// Position shown for a player: the current league year's entry, else the latest season they are on.
function playerDisplayPosition(player, year = currentLeagueYear()) {
  const order = isPlayerOnSeason(player, year) ? [year] : [];
  order.push(...[...player.activeSeasons].sort((a, b) => b - a));
  for (const season of order) {
    const position = player.seasons[season]?.position;
    if (position) return position;
  }
  return "";
}

// Free agents live outside the 32 team rosters, so they have no salary seasons.
const freeAgentTeamId = "FA";

function validFreeAgents(freeAgents) {
  if (freeAgents === undefined) return true;
  if (!Array.isArray(freeAgents) || freeAgents.length > 10000) return false;
  const ids = new Set();
  for (const player of freeAgents) {
    if (!player || typeof player.id !== "string" || !player.id || ids.has(player.id) ||
        typeof player.name !== "string" || !player.name.trim() || player.name.length > 70 ||
        (player.position !== undefined && (typeof player.position !== "string" || player.position.length > 8)) ||
        (player.experience !== undefined && player.experience !== null && !isIntegerInRange(player.experience, 0, 40)) ||
        !validPlayerContractFields(player)) return false;
    ids.add(player.id);
  }
  return true;
}

function isFreeAgentText(text) {
  return ["fa", "freeagent", "freeagents", "free"].includes(String(text).toLowerCase().replace(/[^a-z]/g, ""));
}

// ---- Contract directory: players added on the Player Contracts page ----
// They need no team salary sheet. team is an NFL team id, "FA" or "" (unassigned).
function validContractPlayers(players) {
  if (players === undefined) return true;
  if (!Array.isArray(players) || players.length > 10000) return false;
  const teamIds = new Set(["", freeAgentTeamId, ...nflTeams.map(({ id }) => id)]);
  const ids = new Set();
  for (const player of players) {
    if (!player || typeof player.id !== "string" || !player.id || ids.has(player.id) ||
        typeof player.name !== "string" || !player.name.trim() || player.name.length > 70 ||
        typeof player.team !== "string" || !teamIds.has(player.team) ||
        (player.position !== undefined && (typeof player.position !== "string" || player.position.length > 8)) ||
        (player.experience !== undefined && player.experience !== null && !isIntegerInRange(player.experience, 0, 40)) ||
        !validPlayerContractFields(player)) return false;
    ids.add(player.id);
  }
  return true;
}

// When a directory player's team now has a salary-sheet player with the same
// name, fold the directory details into that sheet player (keeping any values
// already on the sheet player) so each person has one row.
function mergeDirectoryIntoRosters(data) {
  const year = currentLeagueYear();
  let merged = 0;
  data.contractPlayers = data.contractPlayers.filter((entry) => {
    const team = data.teams[entry.team];
    if (!team) return true;
    const matches = team.roster.filter((player) => normalizePlayerName(player.name) === normalizePlayerName(entry.name));
    if (matches.length !== 1) return true;
    const player = matches[0];
    if (playerAge(player) === null) {
      if (entry.birthDate) player.birthDate = entry.birthDate;
      else if (entry.age !== null && entry.age !== undefined) player.age = entry.age;
    }
    if (!player.faType && entry.faType) player.faType = entry.faType;
    const contract = playerContract(player);
    const incoming = playerContract(entry);
    for (const field of ["length", ...contractMoneyFields]) {
      if (contract[field] === null && incoming[field] !== null) contract[field] = incoming[field];
    }
    player.contract = contract;
    if (player.experience == null && entry.experience != null) player.experience = entry.experience;
    merged += 1;
    return false;
  });
  return merged;
}

// Experience is entered once per player on the Player Contracts page and is the
// value for the current league year. Earlier versions stored it per salary
// season on the team sheets; copy that into the player the first time.
function moveExperienceToPlayers(data) {
  const year = currentLeagueYear();
  for (const { id } of nflTeams) {
    for (const player of data.teams[id].roster) {
      if (player.experience !== undefined) continue;
      const current = player.seasons[year]?.experience;
      if (current !== null && current !== undefined) {
        player.experience = current;
        continue;
      }
      const known = seasons.filter((season) => player.seasons[season]?.experience != null);
      player.experience = known.length
        ? Math.max(0, Math.min(40, player.seasons[known[0]].experience + (year - known[0])))
        : null;
    }
  }
}

// Experience shown on a salary-year tab: the Player Contracts value, moved
// forward or back one year per season from the current league year.
function projectedExperience(player, year) {
  if (player.experience === null || player.experience === undefined) return null;
  const value = player.experience + (year - currentLeagueYear());
  return value >= 0 ? Math.min(value, 40) : null;
}

// ---- Draft pick rounds ----
// An asterisk marks a compensatory pick ("5*"), which sits at the bottom of its round.
function pickRoundLabel(pick) {
  return `${pick.round}${pick.compensatory ? "*" : ""}`;
}

// Reads "5", "5*", "Round 5*", "5th*" or "R5*". Returns { round, compensatory } or null.
function parsePickRound(text) {
  const raw = String(text).trim();
  const compensatory = raw.includes("*");
  const digits = raw.replace(/\*/g, "").replace(/^(round|rnd|rd|r)\s*/i, "").replace(/(st|nd|rd|th)$/i, "").trim();
  if (!/^\d+$/.test(digits)) return null;
  const round = Number(digits);
  return round >= 1 && round <= 20 ? { round, compensatory } : null;
}

// Draft order within a year: by round, regular picks before compensatory ones.
function comparePicks(a, b) {
  return a.year - b.year || a.round - b.round || Number(Boolean(a.compensatory)) - Number(Boolean(b.compensatory)) ||
    teamName(a.originalTeam).localeCompare(teamName(b.originalTeam));
}

const pickNoteMaxLength = 160;
const tradeNotePrefix = "Acquired via trade from";

// Adds "Acquired via trade from KC (10/29/2026)" to a pick's notes, keeping the
// commissioner's own notes and replacing the line left by any earlier trade.
function withTradeNote(note, fromTeamId, date = new Date()) {
  const tradeLine = `${tradeNotePrefix} ${fromTeamId} (${date.toLocaleDateString("en-US")})`;
  const kept = String(note || "").split(" · ").map((part) => part.trim())
    .filter((part) => part && !part.startsWith(tradeNotePrefix)).join(" · ");
  const room = pickNoteMaxLength - tradeLine.length - 3;
  return kept ? `${kept.slice(0, Math.max(0, room))} · ${tradeLine}` : tradeLine;
}

// ---- Transaction log ----
const transactionTypes = {
  trade: "Trade",
  release: "Release",
  waiver: "Waiver",
  extension: "Extension",
  signing: "Free Agent Signing",
  other: "Other"
};

function validTransactions(transactions) {
  if (transactions === undefined) return true;
  if (!Array.isArray(transactions) || transactions.length > 20000) return false;
  const teamIds = new Set([freeAgentTeamId, ...nflTeams.map(({ id }) => id)]);
  const ids = new Set();
  for (const entry of transactions) {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) ||
        !Object.hasOwn(transactionTypes, entry.type) ||
        typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
        !Array.isArray(entry.teams) || entry.teams.length > 3 || entry.teams.some((id) => !teamIds.has(id)) ||
        (entry.player !== undefined && (typeof entry.player !== "string" || entry.player.length > 200)) ||
        typeof entry.details !== "string" || entry.details.length > 1000 ||
        (entry.tradeId !== undefined && typeof entry.tradeId !== "string") ||
        (entry.tradeNumber !== undefined && !isIntegerInRange(entry.tradeNumber, 1, 1000000)) ||
        (entry.sides !== undefined && !validTradeSides(entry.sides, teamIds))) return false;
    ids.add(entry.id);
  }
  return true;
}

function localDateString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function logTransaction(data, entry) {
  if (!Array.isArray(data.transactions)) data.transactions = [];
  if (data.transactions.length >= 20000) return null;
  const record = {
    id: newRecordId("txn"),
    date: entry.date || localDateString(),
    createdAt: new Date().toISOString(),
    type: entry.type,
    teams: entry.teams || [],
    details: String(entry.details || "").slice(0, 1000),
    auto: Boolean(entry.auto)
  };
  if (entry.player) record.player = String(entry.player).slice(0, 200);
  if (entry.tradeId) record.tradeId = entry.tradeId;
  if (entry.sides) record.sides = entry.sides;
  if (record.type === "trade") {
    record.tradeNumber = entry.tradeNumber || nextTradeNumber(data);
    data.tradeNumberNext = Math.max(data.tradeNumberNext || 1, record.tradeNumber + 1);
    if (record.sides) record.details = tradeDetailsText(record);
  }
  data.transactions.push(record);
  return record;
}

// "KC receives Player X (QB), 2027 Round 1 (BUF) · BUF receives …" for an approved trade.
function tradeTransactionDetails(assets, participants) {
  return participants.map((teamId) => {
    const incoming = assets.filter((asset) => asset.destinationId === teamId).map((asset) =>
      asset.kind === "player"
        ? `${asset.player.name}${asset.player.seasons?.[currentLeagueYear()]?.position ? ` (${asset.player.seasons[currentLeagueYear()].position})` : ""}`
        : `${asset.pick.year} Round ${pickRoundLabel(asset.pick)} pick (${asset.pick.originalTeam})`);
    return `${teamId} receives ${incoming.length ? incoming.join(", ") : "nothing"}`;
  }).join(" · ");
}

// First load after the log was added: record trades that were already approved.
function transactionsFromTradeHistory(data) {
  return (data.pendingTrades || []).filter((trade) => trade.status === "approved").map((trade) => ({
    id: newRecordId("txn"),
    date: localDateString(new Date(trade.resolvedAt || trade.createdAt)),
    createdAt: trade.resolvedAt || trade.createdAt,
    type: "trade",
    teams: [...trade.participants],
    details: trade.pickMoves?.length
      ? `Approved trade among ${trade.participants.join(", ")}. Picks: ${trade.pickMoves.join("; ")}`
      : `Approved trade among ${trade.participants.join(", ")}.`,
    auto: true,
    tradeId: trade.id
  }));
}

// ---- Trade log format ----
// Trade 112:
// New York Giants Trade:
// - 2028 3rd (NYG)
// Pittsburgh Steelers Trade:
// - RB Jaylen Warren
function validTradeSides(sides, teamIds) {
  return Array.isArray(sides) && sides.length <= 3 && sides.every((side) =>
    side && teamIds.has(side.teamId) && Array.isArray(side.items) && side.items.length <= 100 &&
    side.items.every((item) => typeof item === "string" && item.length <= 200));
}

function ordinalRound(round) {
  const tens = round % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[round % 10] || "th");
  return `${round}${suffix}`;
}

function tradePickText(pick) {
  return `${pick.year} ${ordinalRound(pick.round)}${pick.compensatory ? "*" : ""} (${pick.originalTeam})`;
}

function tradePlayerText(player) {
  const year = currentLeagueYear();
  const position = player.seasons?.[year]?.position || playerDisplayPosition(player, year);
  return `${position ? `${position} ` : ""}${player.name}`;
}

// What each team sent, in participant order.
function tradeSides(assets, participants) {
  return participants.map((teamId) => ({
    teamId,
    items: assets.filter((asset) => asset.fromTeamId === teamId)
      .map((asset) => (asset.kind === "player" ? tradePlayerText(asset.player) : tradePickText(asset.pick)))
  }));
}

function tradeDetailsText(entry) {
  const sections = (entry.sides || []).map((side) =>
    `${teamName(side.teamId)} Trade:\n${side.items.length ? side.items.map((item) => `- ${item}`).join("\n") : "- Nothing"}`);
  return [`Trade ${entry.tradeNumber}:`, ...sections].join("\n\n");
}

function nextTradeNumber(data) {
  const highest = (data.transactions || []).reduce((max, entry) => Math.max(max, entry.tradeNumber || 0), 0);
  return Math.max(data.tradeNumberNext || 1, highest + 1);
}

// Trades logged before the numbered format: number them in date order and,
// for trades approved on this site, rebuild each team's side from the trade.
function upgradeTradeLogEntries(data) {
  const trades = data.transactions.filter((entry) => entry.type === "trade")
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  for (const entry of trades) {
    if (!entry.tradeNumber) {
      entry.tradeNumber = nextTradeNumber(data);
      data.tradeNumberNext = entry.tradeNumber + 1;
    }
    if (entry.sides || !entry.tradeId) continue;
    const trade = (data.pendingTrades || []).find(({ id }) => id === entry.tradeId);
    if (!trade) continue;
    const findPlayer = (id) => nflTeams.map(({ id: teamId }) => data.teams[teamId].roster.find((player) => player.id === id)).find(Boolean);
    entry.sides = trade.participants.map((teamId) => ({
      teamId,
      items: trade.lines.filter((line) => line.fromTeamId === teamId).map((line) => {
        const [kind, id] = line.assetKey.split(":");
        if (kind === "player") {
          const player = findPlayer(id);
          return player ? tradePlayerText(player) : "Player";
        }
        const pick = data.picks.find((item) => item.id === id);
        return pick ? tradePickText(pick) : "Draft pick";
      })
    }));
    entry.details = tradeDetailsText(entry);
  }
}

// ---- Standings ----
const nflDivisions = [
  { conference: "AFC", name: "AFC East", teams: ["BUF", "MIA", "NE", "NYJ"] },
  { conference: "AFC", name: "AFC North", teams: ["BAL", "CIN", "CLE", "PIT"] },
  { conference: "AFC", name: "AFC South", teams: ["HOU", "IND", "JAX", "TEN"] },
  { conference: "AFC", name: "AFC West", teams: ["DEN", "KC", "LV", "LAC"] },
  { conference: "NFC", name: "NFC East", teams: ["DAL", "NYG", "PHI", "WAS"] },
  { conference: "NFC", name: "NFC North", teams: ["CHI", "DET", "GB", "MIN"] },
  { conference: "NFC", name: "NFC South", teams: ["ATL", "CAR", "NO", "TB"] },
  { conference: "NFC", name: "NFC West", teams: ["ARI", "LAR", "SF", "SEA"] }
];

function teamDivision(teamId) {
  return nflDivisions.find((division) => division.teams.includes(teamId));
}

function validStandings(standings) {
  if (standings === undefined) return true;
  if (!standings || typeof standings !== "object" || !isIntegerInRange(standings.season, 2000, 2100) ||
      !standings.teams || typeof standings.teams !== "object") return false;
  return Object.entries(standings.teams).every(([id, record]) =>
    nflTeams.some((team) => team.id === id) && record && typeof record === "object" &&
    ["w", "l", "t"].every((key) => isIntegerInRange(record[key] ?? 0, 0, 30)) &&
    ["pf", "pa"].every((key) => isIntegerInRange(record[key] ?? 0, 0, 2000)) &&
    (record.streak === undefined || (typeof record.streak === "string" && record.streak.length <= 8)));
}

function teamRecord(data, teamId) {
  return { w: 0, l: 0, t: 0, pf: 0, pa: 0, streak: "", ...(data.standings?.teams?.[teamId] || {}) };
}

function winPct({ w, l, t }) {
  const games = w + l + t;
  return games ? (w + t / 2) / games : 0;
}

// Simplified ordering: win percentage, then wins, then point differential.
function compareRecords(a, b) {
  return winPct(b.record) - winPct(a.record) || b.record.w - a.record.w ||
    (b.record.pf - b.record.pa) - (a.record.pf - a.record.pa) || teamName(a.teamId).localeCompare(teamName(b.teamId));
}

// Common short names people use in spreadsheets, plus old abbreviations.
const teamNameAliases = {
  la: "LAR", wsh: "WAS", jac: "JAX", lvr: "LV", oak: "LV", sd: "LAC", stl: "LAR", gnb: "GB", kan: "KC",
  nwe: "NE", nor: "NO", sfo: "SF", tam: "TB", ari: "ARI", arz: "ARI", hst: "HOU", clv: "CLE", blt: "BAL",
  bucs: "TB", niners: "SF", "9ers": "SF", pats: "NE", jags: "JAX", commies: "WAS", skins: "WAS", redskins: "WAS",
  "football team": "WAS", phins: "MIA", fins: "MIA", birds: "PHI", pack: "GB", hawks: "SEA", bolts: "LAC",
  cards: "ARI", "g-men": "NYG", gmen: "NYG", vikes: "MIN", "las vegas": "LV", oakland: "LV"
};

// Abbreviation, nickname or full name (and aliases above) → team id, or null.
function lookupTeamId(text) {
  let value = String(text || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!value) return null;
  // "NY Jets", "N.Y. Giants", "LA Rams", "L.A. Chargers"
  value = value.replace(/^n\.?\s?y\.?\s/, "new york ").replace(/^l\.?\s?a\.?\s/, "los angeles ");
  const team = nflTeams.find(({ id, name }) =>
    id.toLowerCase() === value || name.toLowerCase() === value || name.toLowerCase().endsWith(` ${value}`));
  if (team) return team.id;
  if (teamNameAliases[value]) return teamNameAliases[value];
  // City alone ("Miami", "Green Bay", "Kansas City"), when only one team plays there.
  const byCity = nflTeams.filter(({ name }) => name.toLowerCase().startsWith(`${value} `));
  return byCity.length === 1 ? byCity[0].id : null;
}

// ---- Stats (pasted tables, one per category) ----
const statCategories = {
  passing: "Passing", rushing: "Rushing", receiving: "Receiving", defense: "Defense", kicking: "Kicking", team: "Team"
};

function validStats(stats) {
  if (stats === undefined) return true;
  if (!stats || typeof stats !== "object" || (stats.season !== undefined && !isIntegerInRange(stats.season, 2000, 2100)) ||
      !stats.tables || typeof stats.tables !== "object") return false;
  return Object.entries(stats.tables).every(([key, table]) =>
    Object.hasOwn(statCategories, key) && table && Array.isArray(table.headers) && table.headers.length <= 60 &&
    table.headers.every((h) => typeof h === "string" && h.length <= 40) &&
    Array.isArray(table.rows) && table.rows.length <= 5000 &&
    table.rows.every((row) => Array.isArray(row) && row.length <= 60 && row.every((cell) => typeof cell === "string" && cell.length <= 80)));
}

// ---- Game log (box scores read on the Stats page) ----
const boxScoreCategories = ["passing", "rushing", "receiving", "defense", "kicking"];

function validGames(games) {
  if (games === undefined) return true;
  if (!Array.isArray(games) || games.length > 3000) return false;
  const teamIds = new Set(nflTeams.map(({ id }) => id));
  const okNumber = (value) => value === null || value === undefined || (typeof value === "number" && Number.isFinite(value) && Math.abs(value) < 100000);
  const ids = new Set();
  for (const game of games) {
    if (!game || typeof game.id !== "string" || ids.has(game.id) || typeof game.date !== "string" ||
        (game.week !== undefined && game.week !== null && !isIntegerInRange(game.week, 0, 30)) ||
        !Array.isArray(game.teams) || game.teams.length !== 2 ||
        game.teams.some((side) => !side || !teamIds.has(side.team) || !isIntegerInRange(side.score, 0, 200)) ||
        game.teams[0].team === game.teams[1].team ||
        !game.teamStats || typeof game.teamStats !== "object" ||
        Object.entries(game.teamStats).some(([team, stats]) => !teamIds.has(team) || !stats || typeof stats !== "object" ||
          Object.entries(stats).some(([key, value]) => key === "possession" ? (value !== null && value !== undefined && typeof value !== "string") : !okNumber(value))) ||
        !game.players || typeof game.players !== "object" ||
        Object.entries(game.players).some(([category, lines]) => !boxScoreCategories.includes(category) || !Array.isArray(lines) || lines.length > 200 ||
          lines.some((line) => !line || typeof line.player !== "string" || !line.player || line.player.length > 70 || !teamIds.has(line.team) ||
            Object.entries(line).some(([key, value]) => !["player", "team", "rawName"].includes(key) && !okNumber(value))))) return false;
    ids.add(game.id);
  }
  return true;
}

// ---- Player profiles ----
// player.profile = { positions, college, draftYear, draftRound, draftPick, height, weight, photoUrl, retired, notes }
const profileTextLimits = { positions: 40, college: 80, height: 10, photoUrl: 500, notes: 1000 };

function validPlayerProfile(profile) {
  if (!profile || typeof profile !== "object") return false;
  for (const [field, max] of Object.entries(profileTextLimits)) {
    const value = profile[field];
    if (value !== undefined && value !== null && (typeof value !== "string" || value.length > max)) return false;
  }
  if (profile.photoUrl && !/^https?:\/\//i.test(profile.photoUrl)) return false;
  if (profile.photoData !== undefined && profile.photoData !== null && profile.photoData !== ""
    && (typeof profile.photoData !== "string" || profile.photoData.length > 400000 || !/^data:image\/(jpeg|png|webp);base64,/.test(profile.photoData))) return false;
  for (const [field, min, max] of [["draftYear", 1936, 2100], ["draftRound", 1, 20], ["draftPick", 1, 400], ["weight", 100, 500]]) {
    const value = profile[field];
    if (value !== undefined && value !== null && !isIntegerInRange(value, min, max)) return false;
  }
  return profile.retired === undefined || typeof profile.retired === "boolean";
}

// An uploaded photo wins over a Photo URL (links to other sites can be blocked, e.g. in the live preview).
function profilePhotoSrc(profile) {
  return profile.photoData || profile.photoUrl || "";
}

function playerProfile(player) {
  return { positions: "", college: "", draftYear: null, draftRound: null, draftPick: null, height: "", weight: null,
    photoUrl: "", photoData: "", retired: false, notes: "", ...(player.profile || {}) };
}

// Every player the site knows: salary sheets first, then Player Contracts.
function findPlayerById(data, id) {
  for (const { id: teamId } of nflTeams) {
    const player = data.teams[teamId].roster.find((item) => item.id === id);
    if (player) return { player, source: "sheet", teamId };
  }
  const player = (data.contractPlayers || []).find((item) => item.id === id);
  return player ? { player, source: "directory", teamId: player.team } : null;
}

// Find a player by name (and team when given), for linking stat rows to profiles.
function findPlayerByName(data, name, teamId) {
  const key = normalizePlayerName(name);
  if (!key) return null;
  const all = [
    ...nflTeams.flatMap(({ id }) => data.teams[id].roster.map((player) => ({ player, source: "sheet", teamId: id }))),
    ...(data.contractPlayers || []).map((player) => ({ player, source: "directory", teamId: player.team }))
  ].filter(({ player }) => normalizePlayerName(player.name) === key);
  if (all.length <= 1) return all[0] || null;
  return all.filter((entry) => entry.teamId === teamId).length === 1 ? all.find((entry) => entry.teamId === teamId) : null;
}

function profileUrl(playerId) {
  return `player.html?id=${encodeURIComponent(playerId)}`;
}

function formatHeight(inches) {
  return inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : "";
}


// ---- Injury report ----
// data.injuries = [{ id, player, playerId?, teamId, position, injury, duration, ir (Injured Reserve), date, notes, updatedAt }]
const injuryTextLimits = { player: 70, position: 10, injury: 80, duration: 40, notes: 300 };
// Older saves had a status (Questionable … IR) and an estimated return; IR becomes the checkbox, the return becomes the duration.
const legacyInjuryStatuses = ["questionable", "doubtful", "out", "ir", "pup", "dtd"];

function upgradeInjuries(data) {
  for (const entry of data.injuries || []) {
    if (entry.status !== undefined) {
      if (entry.ir === undefined) entry.ir = entry.status === "ir";
      delete entry.status;
    }
    if (entry.returnText !== undefined) {
      if (!entry.duration) entry.duration = entry.returnText;
      delete entry.returnText;
    }
  }
}

function validInjuries(injuries) {
  if (injuries === undefined) return true;
  if (!Array.isArray(injuries) || injuries.length > 5000) return false;
  const ids = new Set();
  for (const entry of injuries) {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) ||
        !nflTeams.some(({ id }) => id === entry.teamId) ||
        (entry.status !== undefined && !legacyInjuryStatuses.includes(entry.status)) ||
        (entry.returnText !== undefined && (typeof entry.returnText !== "string" || entry.returnText.length > 40)) ||
        (entry.ir !== undefined && typeof entry.ir !== "boolean") ||
        typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return false;
    for (const [field, max] of Object.entries(injuryTextLimits)) {
      const value = entry[field];
      if (field === "player" ? (typeof value !== "string" || !value || value.length > max)
        : (value !== undefined && (typeof value !== "string" || value.length > max))) return false;
    }
    if (entry.playerId !== undefined && typeof entry.playerId !== "string") return false;
    ids.add(entry.id);
  }
  return true;
}

// The current injury for a player (by id, else by name + team), or null.
function injuryForPlayer(data, player, teamId) {
  const key = normalizePlayerName(player.name);
  return (data.injuries || []).find((entry) => (entry.playerId && entry.playerId === player.id) ||
    (!entry.playerId && normalizePlayerName(entry.player) === key && (!teamId || entry.teamId === teamId))) || null;
}

// ---- League members ----
// data.members = [{ id, name, teamId ("" = no team), role, contact?, joined?, notes? }]
const memberRoles = ["Commissioner", "Co-Commissioner", "General Manager", "Co-GM", "Waitlist"];
const memberTextLimits = { name: 60, role: 30, contact: 80, notes: 200 };

function validMembers(members) {
  if (members === undefined) return true;
  if (!Array.isArray(members) || members.length > 500) return false;
  const ids = new Set();
  for (const member of members) {
    if (!member || typeof member.id !== "string" || !member.id || ids.has(member.id) ||
        typeof member.name !== "string" || !member.name.trim() || member.name.length > memberTextLimits.name ||
        typeof member.teamId !== "string" || (member.teamId && !nflTeams.some(({ id }) => id === member.teamId)) ||
        (member.joined !== undefined && (typeof member.joined !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(member.joined)))) return false;
    for (const field of ["role", "contact", "notes"]) {
      if (member[field] !== undefined && (typeof member[field] !== "string" || member[field].length > memberTextLimits[field])) return false;
    }
    ids.add(member.id);
  }
  return true;
}

function teamManagers(data, teamId) {
  return (data.members || []).filter((member) => member.teamId === teamId);
}

// ---- Media posts ----
// data.media = [{ id, title, type, date, author?, teams: [], url?, image? (data URI), body?, createdAt }]
const mediaTypes = { article: "Article", video: "Video", podcast: "Podcast", presser: "Press Conference", rankings: "Power Rankings", graphic: "Graphic", announcement: "Announcement" };
const mediaTextLimits = { title: 120, author: 60, url: 500, body: 4000 };

function validMedia(media) {
  if (media === undefined) return true;
  if (!Array.isArray(media) || media.length > 1000) return false;
  const ids = new Set();
  for (const post of media) {
    if (!post || typeof post.id !== "string" || !post.id || ids.has(post.id) ||
        typeof post.title !== "string" || !post.title.trim() || post.title.length > mediaTextLimits.title ||
        !Object.hasOwn(mediaTypes, post.type) || typeof post.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(post.date) ||
        !Array.isArray(post.teams) || post.teams.length > 32 || post.teams.some((id) => !nflTeams.some((team) => team.id === id)) ||
        (post.url !== undefined && (typeof post.url !== "string" || post.url.length > mediaTextLimits.url || !/^https?:\/\//i.test(post.url))) ||
        (post.image !== undefined && (typeof post.image !== "string" || post.image.length > 600000 || !/^data:image\/(jpeg|png|webp);base64,/.test(post.image)))) return false;
    for (const field of ["author", "body"]) {
      if (post[field] !== undefined && (typeof post[field] !== "string" || post[field].length > mediaTextLimits[field])) return false;
    }
    ids.add(post.id);
  }
  return true;
}

// ---- Key dates (Overview card) ----
// data.keyDates = [{ id, date: "YYYY-MM-DD", label, note? }]. Undefined means "never edited": show the defaults.
function validKeyDates(keyDates) {
  if (keyDates === undefined) return true;
  if (!Array.isArray(keyDates) || keyDates.length > 200) return false;
  const ids = new Set();
  for (const entry of keyDates) {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id) ||
        typeof entry.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date) ||
        typeof entry.label !== "string" || !entry.label || entry.label.length > 80 ||
        (entry.note !== undefined && (typeof entry.note !== "string" || entry.note.length > 140))) return false;
    ids.add(entry.id);
  }
  return true;
}

// The league's own contract-year rules: the league year starts March 1, and June 1 starts the post-June 1 window.
function defaultKeyDates(today = new Date()) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const next = (month, day) => (new Date(start.getFullYear(), month - 1, day) >= start ? start.getFullYear() : start.getFullYear() + 1);
  const march = next(3, 1);
  const june = next(6, 1);
  return [
    { id: "default-march1", date: `${march}-03-01`, label: `${march} league year begins`, note: "Dead cap rules switch to the March 1 – May 31 window" },
    { id: "default-june1", date: `${june}-06-01`, label: "Post-June 1 window opens", note: "Dead cap rules switch to the June 1 – Feb 28 window" }
  ];
}

// ---- In-page confirmation ----
// Browser confirm() boxes are blocked in some places (the live preview returns "Cancel" without asking),
// so confirmations are drawn on the page. Resolves true for the confirm button, false otherwise.
function confirmAction(message, { confirmLabel = "Continue", cancelLabel = "Cancel", danger = false } = {}) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";
    const box = document.createElement("div");
    box.className = "confirm-box";
    box.setAttribute("role", "alertdialog");
    box.setAttribute("aria-modal", "true");
    const text = document.createElement("p");
    text.id = `confirm-text-${Date.now()}`;
    text.textContent = message;
    box.setAttribute("aria-describedby", text.id);
    const actions = document.createElement("div");
    actions.className = "confirm-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "workspace-button";
    cancel.textContent = cancelLabel;
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = `workspace-button confirm-ok${danger ? " is-danger" : ""}`;
    ok.textContent = confirmLabel;
    actions.append(cancel, ok);
    box.append(text, actions);
    overlay.append(box);
    const finish = (answer) => {
      document.removeEventListener("keydown", onKey, true);
      overlay.remove();
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
      resolve(answer);
    };
    const onKey = (event) => {
      if (event.key === "Escape") { event.preventDefault(); finish(false); }
      if (event.key === "Tab") {
        event.preventDefault();
        (document.activeElement === ok ? cancel : ok).focus();
      }
    };
    cancel.addEventListener("click", () => finish(false));
    ok.addEventListener("click", () => finish(true));
    overlay.addEventListener("click", (event) => { if (event.target === overlay) finish(false); });
    document.addEventListener("keydown", onKey, true);
    document.body.append(overlay);
    ok.focus();
  });
}

// ---- Sample league (loaded from Admin) ----
const sampleBackupKey = `${officeStorageKey}-before-sample`;
const sampleNoDataMarker = "__no-saved-data__";

function isSampleLeagueActive() {
  return Boolean(localStorage.getItem(sampleBackupKey)) && String(localStorage.getItem(officeStorageKey) || "").includes('"sampleLeague":true');
}

function restoreFromSampleBackup() {
  const backup = localStorage.getItem(sampleBackupKey);
  if (backup === null) throw new Error("no saved copy was found");
  if (backup === sampleNoDataMarker) localStorage.removeItem(officeStorageKey);
  else localStorage.setItem(officeStorageKey, backup);
  localStorage.removeItem(sampleBackupKey);
  globalThis.refreshNavNotifications?.();
}

// A notice at the top of every page while the sample is loaded.
function showSampleBanner() {
  let active = false;
  try { active = isSampleLeagueActive(); } catch { active = false; }
  let banner = document.querySelector(".sample-banner");
  if (!active) { banner?.remove(); return; }
  if (banner) return;
  banner = document.createElement("div");
  banner.className = "sample-banner";
  banner.setAttribute("role", "note");
  const text = document.createElement("span");
  text.innerHTML = "<strong>Sample league.</strong> You're looking at a made-up season five weeks in. ";
  const link = document.createElement("a");
  link.href = "admin.html#sample-panel";
  link.textContent = "Remove it in Admin";
  text.append(link, " to get your own data back.");
  banner.append(text);
  (document.querySelector("main") || document.body).prepend(banner);
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", showSampleBanner);
  else showSampleBanner();
  window.addEventListener("storage", (event) => { if (event.key === officeStorageKey || event.key === sampleBackupKey) showSampleBanner(); });
}

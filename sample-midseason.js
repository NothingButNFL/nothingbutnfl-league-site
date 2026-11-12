// Overview › Sample league: turns the full-season sample (sample-league.js) into a league 8 weeks into its season,
// and fills every other feature with made-up but consistent data: practice squads, draft picks, trade block, pending
// trades, waivers, practice-squad offers, admin queues (FA offers, extensions, restructures), members, media, Insider
// Wire posts, depth-chart stream updates, last season's awards and Super Bowl, minimum and practice-squad salaries.
// Uses league-core.js helpers (signToPracticeSquad, releaseToWaiversOrFreeAgency, makePsOffer, …).
const sampleWeeksPlayed = 8;

function buildMidseasonSample(copy, data) {
  // Seeded random numbers, so the sample comes out the same every time.
  let seed = 20260908;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const pickOne = (list) => list[Math.floor(rand() * list.length)];
  const teamIds = nflTeams.map(({ id }) => id);
  const year = copy.season; // 2026
  const now = Date.now();
  const iso = (offsetHours) => new Date(now + offsetHours * 3600000).toISOString();
  const lastPlayed = copy.games.filter((g) => g.week === sampleWeeksPlayed).map((g) => g.date).sort().pop() || `${year}-11-01`;

  // ---------- Games, standings, schedule ----------
  data.games = copy.games.filter((g) => g.week <= sampleWeeksPlayed);
  const records = Object.fromEntries(teamIds.map((id) => [id, { w: 0, l: 0, t: 0, pf: 0, pa: 0, results: [] }]));
  for (const g of [...data.games].sort((a, b) => a.week - b.week)) {
    const [a, b] = g.teams;
    for (const [me, them] of [[a, b], [b, a]]) {
      const r = records[me.team];
      r.pf += me.score; r.pa += them.score;
      const res = me.score > them.score ? "W" : me.score < them.score ? "L" : "T";
      r[res.toLowerCase()] += 1;
      r.results.push(res);
    }
  }
  const streak = (results) => {
    if (!results.length) return "";
    const last = results[results.length - 1];
    let n = 0;
    for (let i = results.length - 1; i >= 0 && results[i] === last; i -= 1) n += 1;
    return `${last}${n}`;
  };
  data.standings = { season: year, teams: Object.fromEntries(teamIds.map((id) => {
    const { results, ...r } = records[id];
    return [id, { ...r, streak: streak(results) }];
  })) };
  data.schedule = copy.schedule || [];
  data.currentWeek = sampleWeeksPlayed + 1;
  const ranked = [...teamIds].sort((x, y) => {
    const a = data.standings.teams[x], b = data.standings.teams[y];
    return winPct(b) - winPct(a) || (b.pf - b.pa) - (a.pf - a.pa);
  });
  const recordText = (id) => { const r = data.standings.teams[id]; return `${r.w}-${r.l}${r.t ? `-${r.t}` : ""}`; };

  // ---------- Rosters, caps, contracts, depth charts ----------
  for (const id of teamIds) data.teams[id] = copy.teams[id];
  data.leagueCaps = copy.leagueCaps;
  data.contractPlayers = copy.contractPlayers;
  data.depthCharts = copy.depthCharts || {};
  data.stats = { season: copy.season, tables: {} };
  data.minimumSalaries = Object.fromEntries([[year, 885000, 1020000, 1095000, 1170000, 1320000, 1395000], [year + 1, 930000, 1065000, 1140000, 1215000, 1365000, 1440000],
    [year + 2, 975000, 1110000, 1185000, 1260000, 1410000, 1485000]].map(([y, ...v]) => [y, Object.fromEntries(minimumTiers.map((t, i) => [t, v[i]]))]));
  data.psWeeklySalaries = { [year]: { "0-1": 14500, 2: 16100, "3+": 23200 } };

  // Practice squads: 8 made-up young players per team on the weekly practice-squad salary.
  const firsts = ["Jalen", "Marcus", "Tyler", "Devin", "Isaiah", "Caleb", "Jordan", "Malik", "Trey", "Darius", "Cole", "Bryce", "Quentin", "Xavier", "Elijah", "Nate", "Andre", "Zion", "Kobe", "Reggie", "Damon", "Grant", "Luke", "Omar", "Tavion", "Cam", "Jaylen", "Brock", "Keon", "Rashad"];
  const lasts = ["Holloway", "Pruitt", "Okafor", "Castellanos", "Whitfield", "Banks", "Delacroix", "Merriweather", "Stroud-Ellis", "Abernathy", "Kowalski", "Fontenot", "Greer", "Mabry", "Thibodeaux", "Ashby", "Vance", "Oyelaran", "Pettigrew", "Hargrove", "Lockett-Ruiz", "Sowell", "Bramlett", "Nwachukwu", "Toliver", "Kearse", "Dunlap", "Fairbanks", "Rhodes", "Calloway"];
  const psPositions = ["QB", "HB", "WR", "WR", "TE", "OT", "OG", "DT", "EDGE", "LB", "CB", "CB", "S"];
  const usedNames = new Set(teamIds.flatMap((id) => data.teams[id].roster.map((p) => p.name)));
  const psPlayers = {};
  for (const id of teamIds) {
    psPlayers[id] = [];
    for (let i = 0; i < 8; i += 1) {
      let name;
      do { name = `${pickOne(firsts)} ${pickOne(lasts)}`; } while (usedNames.has(name));
      usedNames.add(name);
      const experience = Math.floor(rand() * 4);
      const birthYear = year - 22 - experience - Math.floor(rand() * 2);
      const player = signToPracticeSquad(data, id, null, { playerName: name, position: pickOne(psPositions), experience,
        birthDate: `${birthYear}-${String(1 + Math.floor(rand() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rand() * 28)).padStart(2, "0")}` }, year);
      player.id = `sample-ps-${id}-${i}`;
      psPlayers[id].push(player);
    }
  }

  // ---------- Transactions, injuries, key dates ----------
  // Moves after week 8 in the full-season sample are moved into the week after it, so rosters still match the log.
  const late = ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];
  let lateIndex = 0;
  data.transactions = copy.transactions.map((t) => {
    if (t.date <= "2026-11-04") return t;
    const date = late[Math.min(lateIndex++, late.length - 1)];
    return { ...t, date, createdAt: `${date}T15:00:00.000Z` };
  });
  data.tradeNumberNext = copy.tradeNumberNext;
  data.injuries = copy.injuries.map((inj, i) => ({ ...inj, date: `2026-11-0${2 + (i % 4)}`, updatedAt: `2026-11-0${2 + (i % 4)}T20:00:00.000Z` }));
  data.keyDates = [
    { id: "sample-date-deadline", date: "2026-11-17", label: "Trade deadline", note: "4:00 PM ET · trades must be approved by then" },
    { id: "sample-date-thanksgiving", date: "2026-11-26", label: "Thanksgiving games", note: "Week 12" },
    { id: "sample-date-season-end", date: "2027-01-10", label: "Regular season ends", note: "Week 18" },
    ...copy.keyDates
  ];

  // ---------- Last season: awards and the Super Bowl ----------
  // The full-season sample's award winners become last season's, without this season's stat notes.
  data.awards = (copy.awards || []).filter((a) => !/rookie/i.test(a.award)).map(({ notes, line, ...a }) => ({ ...a, id: `${a.id}-${year - 1}`, season: year - 1 }));
  data.championships = [{ id: `sample-sb-${year - 1}`, season: year - 1, champion: ranked[1], runnerUp: ranked[4], championScore: 27, runnerUpScore: 20 }];

  // ---------- Draft picks: 2027–2029, rounds 1–7, with traded and compensatory picks ----------
  const picks = [];
  const pickFor = (y, round, team) => picks.find((p) => p.year === y && p.round === round && p.originalTeam === team && !p.compensatory);
  for (const y of [year + 1, year + 2, year + 3]) {
    for (let round = 1; round <= 7; round += 1) {
      for (const id of teamIds) picks.push({ id: `sample-pick-${y}-${round}-${id}`, year: y, round, originalTeam: id, currentOwner: id });
    }
  }
  // Picks moved in the logged trades.
  const move = (y, round, from, to, note) => { const p = pickFor(y, round, from); if (p) { p.currentOwner = to; p.note = note; } };
  move(year + 1, 4, "PIT", "NYJ", "From PIT (Trade 1, WR Malik McClain)");
  move(year + 1, 3, "DAL", "HOU", "From DAL (Trade 2, LB Henry To'oTo'o)");
  move(year + 2, 6, "DAL", "HOU", "From DAL (Trade 2, LB Henry To'oTo'o)");
  // Earlier trades (before this season).
  for (let i = 0; i < 24; i += 1) {
    const y = pickOne([year + 1, year + 1, year + 2, year + 3]);
    const round = 1 + Math.floor(rand() * 7);
    const from = pickOne(teamIds);
    const p = pickFor(y, round, from);
    if (!p || p.currentOwner !== from) continue;
    const to = pickOne(teamIds.filter((id) => id !== from));
    p.currentOwner = to;
    p.note = `From ${from} (offseason trade)`;
  }
  // Compensatory picks for next year's draft.
  for (let i = 0; i < 10; i += 1) {
    const team = pickOne(teamIds);
    const round = 3 + Math.floor(rand() * 5);
    picks.push({ id: `sample-pick-comp-${i}`, year: year + 1, round, originalTeam: team, currentOwner: team, compensatory: true, note: "Compensatory pick" });
  }
  data.picks = picks;

  // ---------- Trade block ----------
  const rosterOf = (id) => data.teams[id].roster.filter((p) => isPlayerOnSeason(p, year) && !isPracticeSquad(seasonEntry(p, year)));
  const capHit = (p) => capHitFor(seasonEntry(p, year));
  const asks = ["A 3rd-round pick", "Day 2 pick", "A starting-caliber CB", "Late-round pick swap", "Open to offers", "2027 2nd or better", "Cap relief + a 5th", "Young OL with upside"];
  const blockNotes = ["Rebuilding; willing to eat some salary.", "Wants a contender. Healthy and playing well.", "Surplus at the position after the draft.", "Will listen on anything before the deadline.", "Contract runs through 2028; team wants younger.", ""];
  data.tradeBlock = [];
  for (const id of ranked.slice(-10)) {
    const players = rosterOf(id).sort((a, b) => capHit(b) - capHit(a)).slice(3, 15);
    for (const p of [pickOne(players), pickOne(players)]) {
      if (!p || data.tradeBlock.some((e) => e.playerId === p.id)) continue;
      const entry = { id: `sample-block-${p.id}`, player: p.name, playerId: p.id, teamId: id, date: `2026-11-0${3 + Math.floor(rand() * 7)}`,
        position: (seasonEntry(p, year).position || "").slice(0, tradeBlockLimits.position), asking: pickOne(asks) };
      const note = pickOne(blockNotes);
      if (note) entry.notes = note;
      data.tradeBlock.push(entry);
    }
  }

  // ---------- Pending trades: one waiting on a team, one waiting on the commissioner ----------
  const midPlayer = (id) => rosterOf(id).sort((a, b) => capHit(b) - capHit(a))[8];
  const ownPick = (team, y, round) => picks.find((p) => p.currentOwner === team && p.year === y && p.round === round);
  data.pendingTrades = [];
  const tradeUp = (from, to, pickYear, pickRound, status, hoursAgo) => {
    const player = midPlayer(from);
    const pick = ownPick(to, pickYear, pickRound);
    if (!player || !pick) return;
    data.pendingTrades.push({ id: `sample-trade-${from}-${to}`, status, proposedBy: to, participants: [to, from],
      acceptedBy: status === "awaiting-admin" ? [to, from] : [to],
      lines: [{ fromTeamId: from, destinationId: to, assetKey: `player:${player.id}` }, { fromTeamId: to, destinationId: from, assetKey: `pick:${pick.id}` }],
      createdAt: iso(-hoursAgo) });
  };
  tradeUp(ranked[30], ranked[0], year + 1, 3, "awaiting-teams", 5);
  tradeUp(ranked[28], ranked[2], year + 1, 4, "awaiting-admin", 20);

  // ---------- Waivers: a player waived this week with a claim in ----------
  data.waivers = [];
  const waiveTeam = ranked[26];
  const waived = rosterOf(waiveTeam).filter((p) => (p.experience ?? 9) < 4 && p.activeSeasons.length <= 2).sort((a, b) => capHit(a) - capHit(b))[0];
  if (waived) {
    const result = releaseToWaiversOrFreeAgency(data, waived, waiveTeam, year);
    data.teams[waiveTeam].roster = data.teams[waiveTeam].roster.filter((p) => p !== waived);
    if (result.waived) {
      result.entry.id = "sample-waiver-1";
      result.entry.releasedAt = iso(-6);
      result.entry.clearsAt = iso(18);
      result.entry.claims = [{ teamId: ranked[20], at: iso(-2) }];
    }
    data.transactions.push({ id: "sample-txn-waive", date: localDateString(), createdAt: iso(-6), type: "release", teams: [waiveTeam],
      details: `Waived. On waivers until ${new Date(now + 18 * 3600000).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.`, auto: false, player: waived.name });
  }

  // ---------- Practice squad: another team trying to sign one ----------
  data.psOffers = [];
  const offer = makePsOffer(data, ranked[12], psPlayers[ranked[12]][2].id, ranked[5]);
  if (!offer.error) { offer.id = "sample-psoffer-1"; offer.createdAt = iso(-4); offer.expiresAt = iso(20); }

  // ---------- Admin queues: a free-agent offer, an extension and a restructure ----------
  const fa = copy.contractPlayers.find((p) => p.team === freeAgentTeamId);
  data.faOffers = fa ? [{ id: "sample-faoffer-1", playerId: fa.id, playerName: fa.name, teamId: ranked[7], years: 2, totalValue: 6400000,
    signingBonus: 1000000, guaranteed: 2500000, status: "pending", createdAt: iso(-3), startYear: year, notes: "Depth for the stretch run." }] : [];
  const expiring = rosterOf(ranked[3]).filter((p) => !p.activeSeasons.some((y) => y > year)).sort((a, b) => capHit(b) - capHit(a))[0];
  data.extensionOffers = expiring ? [{ id: "sample-ext-1", teamId: ranked[3], playerId: expiring.id, playerName: expiring.name,
    position: seasonEntry(expiring, year).position || undefined, years: 3, voidYears: 0, signingBonus: 9000000, totalValue: 36000000, guaranteed: 18000000,
    yearsDetail: [{ baseSalary: 7000000, rosterBonus: 0, guaranteedSalary: 7000000 }, { baseSalary: 9000000, rosterBonus: 0, guaranteedSalary: 2000000 }, { baseSalary: 11000000, rosterBonus: 0, guaranteedSalary: 0 }],
    startYear: year + 1, status: "pending", createdAt: iso(-8), notes: "Locking him up before free agency." }] : [];
  const big = rosterOf(ranked[9]).filter((p) => p.activeSeasons.filter((y) => y >= year).length >= 3).sort((a, b) => (seasonEntry(b, year).baseSalary || 0) - (seasonEntry(a, year).baseSalary || 0))[0];
  data.restructureRequests = [];
  if (big) {
    const e = seasonEntry(big, year);
    const amount = Math.round(((e.baseSalary || 0) - 1395000) * 0.5 / 1000) * 1000;
    const spread = Math.min(5, big.activeSeasons.filter((y) => y >= year).length);
    if (amount > 0) data.restructureRequests.push({ id: "sample-restructure-1", teamId: ranked[9], playerId: big.id, playerName: big.name,
      position: (e.position || "").slice(0, 8), year, newBase: e.baseSalary - amount, newRoster: e.rosterBonus || 0, addVoid: 0, amount,
      capSavings: amount - Math.round(amount / spread), spread, status: "pending", createdAt: iso(-12), notes: "Need room for a waiver claim." });
  }
  for (const o of data.extensionOffers) if (o.position === undefined) delete o.position;

  // ---------- League members ----------
  const handles = ["Gridiron", "BlitzKing", "RedZone", "Audible", "TwoMinute", "Hashmark", "Playaction", "Pylon", "Shotgun", "Nickel", "Dime", "Spy", "Cover2", "Tampa2", "Wildcat", "Pistol"];
  data.members = teamIds.map((id, i) => ({ id: `sample-member-${id}`, name: `${handles[i % handles.length]}${id}${i % 3 ? "" : "_GM"}`, teamId: id,
    role: i === 0 ? "Commissioner" : i === 1 ? "Co-Commissioner" : "General Manager", joined: `${year - 1 - (i % 3)}-0${1 + (i % 8)}-1${i % 10}` }));

  // ---------- Media: power rankings, a mock draft, independent media, an article ----------
  const nick = (id) => teamName(id).split(" ").pop();
  const blurbs = ["Rolling on both sides of the ball.", "Finding ways to win close ones.", "The defense is carrying them.", "The offense hasn't slowed down.", "Tough schedule ahead, but the talent is there.", "Banged up, still dangerous.", "Can't string wins together.", "Turnovers keep killing drives.", "Searching for answers at quarterback.", "Already thinking about the draft."];
  const rankBody = ranked.map((id, i) => { const r = data.standings.teams[id]; return `${i + 1}. ${teamName(id)} (${recordText(id)}, ${r.pf - r.pa >= 0 ? "+" : ""}${r.pf - r.pa}) — ${blurbs[Math.min(blurbs.length - 1, Math.floor(i / 3.3))]}`; }).join("\n\n");
  const needs = ["QB", "EDGE", "OT", "CB", "WR", "DT", "S", "LB", "OG", "TE", "HB", "C"];
  const order = [...ranked].reverse();
  const mockBody = order.map((id, i) => `${i + 1}. ${teamName(id)} (${recordText(id)}) — ${needs[(i * 5 + id.length) % needs.length]}`).join("\n\n");
  const at = (h) => iso(-h);
  data.media = [
    { id: "sample-media-rankings", title: `Week ${sampleWeeksPlayed} Power Rankings: ${nick(ranked[0])} on top`, type: "rankings", date: "2026-11-03", author: data.members[1].name,
      teams: [...teamIds], body: rankBody.slice(0, mediaTextLimits.body), createdAt: at(170) },
    { id: "sample-media-mock", title: "Midseason Mock Draft 1.0: needs for all 32 picks", type: "mock", date: "2026-11-05", author: data.members[5].name,
      teams: [...teamIds], body: `Draft order is the current standings, worst record first.\n\n${mockBody}`.slice(0, mediaTextLimits.body), createdAt: at(120) },
    { id: "sample-media-indie", title: "The Cap Space Podcast, Ep. 8: Deadline buyers and sellers", type: "independent", date: "2026-11-07", author: data.members[9].name,
      teams: [ranked[0], ranked[2], ranked[30], ranked[28]], body: `Who should buy before the deadline (${teamName(ranked[0])}, ${teamName(ranked[2])}) and who should sell (${teamName(ranked[30])}, ${teamName(ranked[28])}). Plus the waiver claims worth making this week.`, createdAt: at(80) },
    { id: "sample-media-article", title: `Halfway there: ${nick(ranked[0])} and ${nick(ranked[1])} set the pace`, type: "article", date: "2026-11-02", author: data.members[0].name,
      teams: [ranked[0], ranked[1]], body: `Eight weeks in, the ${teamName(ranked[0])} (${recordText(ranked[0])}) and ${teamName(ranked[1])} (${recordText(ranked[1])}) lead the league.\n\nAt the other end, the ${teamName(ranked[31])} (${recordText(ranked[31])}) are on the clock for the first pick.`, createdAt: at(190) },
    { id: "sample-media-announce", title: "Trade deadline is November 17 at 4:00 PM ET", type: "announcement", date: "2026-11-04", author: data.members[0].name, teams: [],
      body: "All trades must be accepted by every team and approved by the commissioner before the deadline. Waiver claims continue through the end of the season.", createdAt: at(150) }
  ];

  // ---------- Insider Wire: a league reporter and two posts ----------
  data.insiderReporters = [{ id: "sample-reporter-1", name: "Gridiron Gossip", handle: "@GridironGossip", color: "#c0392b" }];
  data.insiderPosts = [
    { id: "sample-insider-1", reporterId: "sample-reporter-1", text: `Hearing the #${nick(ranked[30])} are open for business ahead of the deadline. Several veterans available for the right price.`, teams: [ranked[30]], createdAt: at(30), date: localDateString(new Date(now - 30 * 3600000)) },
    { id: "sample-insider-2", reporterId: "insider", text: `The #${nick(ranked[0])} have checked in on pass rushers, per sources. They'd like to add before November 17.`, teams: [ranked[0]], createdAt: at(10), date: localDateString(new Date(now - 10 * 3600000)) }
  ];

  // ---------- Stream updates: depth-chart changes waiting to be made in the game ----------
  data.streamUpdates = [];
  for (const id of [ranked[4], ranked[15]]) {
    const slots = data.depthCharts[id]?.slots;
    const nameOf = (pid) => data.teams[id].roster.find((p) => p.id === pid)?.name || "";
    if (!slots?.WR?.[1] || !slots?.WR?.[2]) continue;
    data.streamUpdates.push({ id: `sample-stream-${id}`, teamId: id, createdAt: at(26), updatedAt: at(26), done: false,
      changes: [{ slot: "WR", index: 1, from: nameOf(slots.WR[1]), to: nameOf(slots.WR[2]) }, { slot: "WR", index: 2, from: nameOf(slots.WR[2]), to: nameOf(slots.WR[1]) }] });
    [slots.WR[1], slots.WR[2]] = [slots.WR[2], slots.WR[1]];
  }
  // ---------- Last season's remaining awards (the full sample only had MVP, OPOY and DPOY) ----------
  const offense = ["QB", "HB", "RB", "WR", "TE"], defense = ["DE", "DT", "EDGE", "OLB", "ILB", "MLB", "LB", "CB", "S", "FS", "SS"];
  const everyone = teamIds.flatMap((id) => rosterOf(id).map((p) => ({ p, id, pos: seasonEntry(p, year).position || "" })));
  const taken = new Set(data.awards.map((a) => a.winner));
  const choose = (test) => {
    const pool = everyone.filter((x) => !taken.has(x.p.name) && test(x)).sort((a, b) => capHit(b.p) - capHit(a.p)).slice(0, 6);
    const pick = pool.length ? pickOne(pool) : null;
    if (pick) taken.add(pick.p.name);
    return pick;
  };
  const playerAward = (award, test) => {
    if (data.awards.some((a) => a.award === award)) return;
    const x = choose(test);
    if (x) data.awards.push({ id: `sample-award-${award.replace(/\W/g, "")}-${year - 1}`, season: year - 1, award, winner: x.p.name, teamId: x.id, position: x.pos.slice(0, 10) });
  };
  playerAward("Offensive Rookie Of The Year", (x) => x.p.experience === 1 && offense.includes(x.pos));
  playerAward("Defensive Rookie Of The Year", (x) => x.p.experience === 1 && defense.includes(x.pos));
  playerAward("Comeback Player Of The Year", (x) => (x.p.experience ?? 0) >= 6);
  playerAward("Kurt Warner Award", (x) => (x.p.experience ?? 0) >= 3 && capHit(x.p) < 3000000 && offense.includes(x.pos));
  playerAward("Shaq Barrett Award", (x) => (x.p.experience ?? 0) >= 4 && capHit(x.p) < 5000000 && defense.includes(x.pos));
  const memberAward = (award, teamId) => {
    if (data.awards.some((a) => a.award === award)) return;
    const member = data.members.find((m) => m.teamId === teamId);
    data.awards.push({ id: `sample-award-${award.replace(/\W/g, "")}-${year - 1}`, season: year - 1, award, winner: member.name, teamId });
  };
  memberAward("Coach Of The Year", ranked[3]);
  memberAward("General Manager Of The Year", ranked[1]);
  memberAward("Hershel Walker Award", ranked[6]);
  data.awards.sort((a, b) => awardPresets.indexOf(a.award) - awardPresets.indexOf(b.award));

  return { games: data.games.length, lastPlayed };
}

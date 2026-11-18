// Specialist overall engine. Formulas live in specialist-config.js; this file only does the math and data plumbing.
//
// Player object (built from the league roster + EA attributes):
//   { player_id, name, base_position, base_ovr, ratings: { SPD, ACC, AGI, … } }   (3-letter Madden codes)
// Result per player and slot:
//   { player, specialist_ovr, ovr_delta, weighted }   ovr_delta = specialist_ovr - base_ovr

// Future "Custom Weights" mode: per-slot overrides merged over the config, e.g.
//   { SLWR: { weights: { SRR: 0.3, … }, desired_low: 40 } }. Saved in this browser only.
const specialistOverrideKey = "nbf-specialist-overrides";
function specialistWeightOverrides() {
  try { return JSON.parse(localStorage.getItem(specialistOverrideKey) || "{}") || {}; } catch { return {}; }
}
function specialistSlotConfig(slot) {
  const base = specialistFormulaConfig.slots[slot];
  if (!base) return null;
  const over = specialistWeightOverrides()[slot] || {};
  return { ...base, ...over, weights: { ...(over.weights || base.weights) } };
}
const specialistSlots = () => Object.keys(specialistFormulaConfig.slots);

// Is this base position allowed in the slot? ("CB / S" counts as either.)
function specialistEligible(cfg, basePosition) {
  return String(basePosition || "").toUpperCase().split(/[\s/,-]+/).filter(Boolean).some((p) => cfg.eligible_positions.includes(p));
}

// 1. W = Σ rating × weight  2. raw = (W − L) × 99 / (H − L)  3. clamp(round(raw), floor, cap)
function specialistOverall(player, cfg) {
  let weighted = 0;
  for (const [attr, weight] of Object.entries(cfg.weights)) {
    const value = player.ratings?.[attr];
    if (typeof value !== "number") return null; // missing attribute: can't rate him here
    weighted += value * weight;
  }
  const L = Number(cfg.desired_low), H = Number(cfg.desired_high);
  const raw = (weighted - L) * (99 / (H - L));
  const floor = cfg.min_ovr_floor ?? 40, cap = cfg.max_ovr_cap ?? 99;
  const specialist_ovr = Math.max(floor, Math.min(cap, Math.round(raw)));
  return { specialist_ovr, ovr_delta: player.base_ovr == null ? null : specialist_ovr - player.base_ovr, weighted };
}

// Eligible players only, best first (specialist OVR, then base OVR).
function rankSpecialistSlot(players, slot) {
  const cfg = specialistSlotConfig(slot);
  if (!cfg) return [];
  return players.filter((p) => specialistEligible(cfg, p.base_position))
    .map((p) => ({ player: p, ...specialistOverall(p, cfg) }))
    .filter((r) => r.specialist_ovr != null)
    .sort((a, b) => b.specialist_ovr - a.specialist_ovr || (b.player.base_ovr ?? -1) - (a.player.base_ovr ?? -1));
}
function rankAllSpecialistSlots(players) {
  return Object.fromEntries(specialistSlots().map((slot) => [slot, rankSpecialistSlot(players, slot)]));
}
// Players ranked #1 in more than one slot (sub-package fatigue / conflicts): [{ player, slots: [...] }].
function specialistConflicts(rankings) {
  const tops = new Map();
  for (const [slot, list] of Object.entries(rankings)) {
    const top = list[0];
    if (!top) continue;
    const id = top.player.player_id;
    if (!tops.has(id)) tops.set(id, { player: top.player, slots: [] });
    tops.get(id).slots.push(slot);
  }
  return [...tops.values()].filter((t) => t.slots.length > 1);
}

// ---- EA attributes → ratings (ea-attributes/<maddenId % 64>.json from tools/ea_ratings.py; latest release) ----
const specialistShardCache = new Map();
function specialistShard(n) {
  if (!specialistShardCache.has(n)) {
    specialistShardCache.set(n, fetch(`ea-attributes/${n}.json`, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  }
  return specialistShardCache.get(n);
}
// Map maddenId → { SPD: 91, … } for the given ids (latest release that has him). Ids without data are left out.
async function loadSpecialistRatings(maddenIds) {
  const byShard = new Map();
  for (const id of new Set(maddenIds.filter(Boolean).map(String))) {
    const n = Number(id) % 64;
    if (!byShard.has(n)) byShard.set(n, []);
    byShard.get(n).push(id);
  }
  const codeToKey = specialistFormulaConfig.attributeCodes;
  const out = new Map();
  await Promise.all([...byShard].map(async ([n, ids]) => {
    const shard = await specialistShard(n);
    if (!shard) return;
    const index = Object.fromEntries(Object.entries(codeToKey).map(([code, key]) => [code, shard.keys.indexOf(key)]));
    for (const id of ids) {
      const weeks = shard.players?.[id];
      if (!weeks) continue;
      const latest = Object.keys(weeks).map(Number).sort((a, b) => b - a)[0];
      const values = weeks[String(latest)];
      const ratings = {};
      for (const [code, i] of Object.entries(index)) if (i >= 0 && typeof values[i] === "number") ratings[code] = values[i];
      out.set(id, ratings);
    }
  }));
  return out;
}

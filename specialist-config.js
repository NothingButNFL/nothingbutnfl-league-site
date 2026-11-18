// ============================================================================================================
// Specialist overall formulas (depth chart › Specialist and Special Teams). EDIT THIS FILE to tune them.
//
// For each specialist slot:
//   eligible_positions  which positions may be listed there (also drives that slot's depth-chart dropdown)
//   weights             attribute weights; they must add up to 1.0 (3-letter Madden codes, see attributeCodes)
//   desired_low (L)     weighted sum that maps to 0
//   desired_high (H)    weighted sum that maps to 99
//   min_ovr_floor / max_ovr_cap   the result is kept between these
//
//   W = sum(rating[attr] * weight);  raw = (W - L) * (99 / (H - L));  specialist_ovr = clamp(round(raw), floor, cap)
//
// The starting weights are a first pass, not EA's numbers. L and H were calibrated on Madden 27's Week 9 ratings so
// the best player at the slot's usual position comes out near 99 and a typical one near 70.
// A "custom weights" mode can later override any slot via specialistWeightOverrides (see specialist-engine.js).
// ============================================================================================================
const specialistFormulaConfig = {
  "version": 1,
  "attributeCodes": {
    "SPD": "speed",
    "ACC": "acceleration",
    "AGI": "agility",
    "STR": "strength",
    "AWR": "awareness",
    "PRC": "playRecognition",
    "TAK": "tackle",
    "POW": "hitPower",
    "BSH": "blockShedding",
    "FMV": "finesseMoves",
    "PMV": "powerMoves",
    "PUR": "pursuit",
    "ZON": "zoneCoverage",
    "MAN": "manCoverage",
    "PRS": "press",
    "COD": "changeOfDirection",
    "SRR": "shortRouteRunning",
    "MRR": "mediumRouteRunning",
    "DRR": "deepRouteRunning",
    "CIT": "catchInTraffic",
    "CTH": "catching",
    "REL": "release",
    "PBK": "passBlock",
    "RBK": "runBlock",
    "CAR": "carrying",
    "BCV": "bCVision",
    "TRK": "trucking",
    "BTK": "breakTackle",
    "SFA": "stiffArm",
    "JKM": "jukeMove",
    "SPM": "spinMove",
    "RET": "kickReturn",
    "STA": "stamina"
  },
  "slots": {
    "RLE": {
      "label": "Rush left end (nickel/dime)",
      "eligible_positions": [
        "LEDG",
        "REDG",
        "EDGE",
        "DE",
        "LE",
        "RE",
        "ED",
        "DL",
        "SAM",
        "WILL",
        "OLB",
        "SLB",
        "WLB",
        "LOLB",
        "ROLB"
      ],
      "desired_low": 35.5,
      "desired_high": 92.0,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "SPD": 0.15,
        "ACC": 0.15,
        "FMV": 0.2,
        "PMV": 0.2,
        "BSH": 0.1,
        "STR": 0.05,
        "PUR": 0.05,
        "PRC": 0.05,
        "AWR": 0.05
      }
    },
    "RRE": {
      "label": "Rush right end (nickel/dime)",
      "eligible_positions": [
        "LEDG",
        "REDG",
        "EDGE",
        "DE",
        "LE",
        "RE",
        "ED",
        "DL",
        "SAM",
        "WILL",
        "OLB",
        "SLB",
        "WLB",
        "LOLB",
        "ROLB"
      ],
      "desired_low": 35.5,
      "desired_high": 92.0,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "SPD": 0.15,
        "ACC": 0.15,
        "FMV": 0.2,
        "PMV": 0.2,
        "BSH": 0.1,
        "STR": 0.05,
        "PUR": 0.05,
        "PRC": 0.05,
        "AWR": 0.05
      }
    },
    "RDT": {
      "label": "Rush defensive tackle",
      "eligible_positions": [
        "DT",
        "NT",
        "IDL",
        "DL",
        "LEDG",
        "REDG",
        "EDGE",
        "DE",
        "LE",
        "RE",
        "ED"
      ],
      "desired_low": 38.0,
      "desired_high": 88.0,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "PMV": 0.25,
        "FMV": 0.15,
        "STR": 0.15,
        "BSH": 0.15,
        "ACC": 0.1,
        "SPD": 0.05,
        "PUR": 0.05,
        "AWR": 0.05,
        "PRC": 0.05
      }
    },
    "SUBLB": {
      "label": "Sub-package linebacker",
      "eligible_positions": [
        "MIKE",
        "MLB",
        "ILB",
        "SAM",
        "WILL",
        "OLB",
        "SLB",
        "WLB",
        "LOLB",
        "ROLB",
        "LB",
        "SS"
      ],
      "desired_low": 41.0,
      "desired_high": 86.0,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "ZON": 0.2,
        "MAN": 0.1,
        "SPD": 0.15,
        "ACC": 0.05,
        "PRC": 0.15,
        "AWR": 0.1,
        "PUR": 0.1,
        "TAK": 0.1,
        "AGI": 0.05
      }
    },
    "SLCB": {
      "label": "Slot corner",
      "eligible_positions": [
        "CB",
        "NB",
        "FS",
        "SS",
        "S",
        "SAF",
        "DB"
      ],
      "desired_low": 43.9,
      "desired_high": 92.3,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "MAN": 0.2,
        "ZON": 0.15,
        "SPD": 0.15,
        "ACC": 0.1,
        "AGI": 0.1,
        "COD": 0.1,
        "PRS": 0.05,
        "PRC": 0.1,
        "AWR": 0.05
      }
    },
    "SLWR": {
      "label": "Slot receiver",
      "eligible_positions": [
        "WR",
        "TE",
        "RB",
        "HB"
      ],
      "desired_low": 33.9,
      "desired_high": 95.2,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "SRR": 0.25,
        "MRR": 0.1,
        "CIT": 0.15,
        "CTH": 0.15,
        "REL": 0.1,
        "COD": 0.1,
        "AGI": 0.05,
        "ACC": 0.05,
        "AWR": 0.05
      }
    },
    "3DRB": {
      "label": "Third-down back",
      "eligible_positions": [
        "RB",
        "HB",
        "FB"
      ],
      "desired_low": 55.8,
      "desired_high": 80.8,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "CTH": 0.15,
        "SRR": 0.1,
        "PBK": 0.2,
        "BCV": 0.1,
        "ACC": 0.1,
        "AGI": 0.1,
        "SPD": 0.1,
        "CAR": 0.1,
        "AWR": 0.05
      }
    },
    "PWHB": {
      "label": "Power back",
      "eligible_positions": [
        "RB",
        "HB",
        "FB"
      ],
      "desired_low": 48.3,
      "desired_high": 90.8,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "TRK": 0.25,
        "STR": 0.15,
        "BTK": 0.15,
        "SFA": 0.1,
        "CAR": 0.15,
        "BCV": 0.1,
        "AWR": 0.05,
        "ACC": 0.05
      }
    },
    "KR": {
      "label": "Kick returner",
      "eligible_positions": [
        "WR",
        "RB",
        "HB",
        "CB",
        "FB",
        "TE",
        "NB",
        "FS",
        "S",
        "SAF",
        "DB"
      ],
      "desired_low": 54.4,
      "desired_high": 89.0,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "RET": 0.3,
        "SPD": 0.2,
        "ACC": 0.15,
        "BCV": 0.1,
        "CAR": 0.1,
        "AGI": 0.05,
        "JKM": 0.05,
        "COD": 0.05
      }
    },
    "PR": {
      "label": "Punt returner",
      "eligible_positions": [
        "WR",
        "RB",
        "HB",
        "CB",
        "FB",
        "TE",
        "NB",
        "FS",
        "SS",
        "S",
        "SAF",
        "DB"
      ],
      "desired_low": 54.9,
      "desired_high": 88.7,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "RET": 0.3,
        "AGI": 0.15,
        "ACC": 0.15,
        "COD": 0.1,
        "SPD": 0.1,
        "CAR": 0.1,
        "BCV": 0.05,
        "JKM": 0.05
      }
    },
    "LS": {
      "label": "Long snapper",
      "eligible_positions": [
        "LS",
        "TE",
        "LG",
        "RG",
        "OG",
        "G",
        "C",
        "IOL"
      ],
      "desired_low": 36.1,
      "desired_high": 68.2,
      "min_ovr_floor": 40,
      "max_ovr_cap": 99,
      "weights": {
        "AWR": 0.3,
        "RBK": 0.2,
        "PBK": 0.2,
        "STR": 0.2,
        "STA": 0.1
      }
    }
  }
};

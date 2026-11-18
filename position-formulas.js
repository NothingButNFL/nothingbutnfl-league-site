// ============================================================================================================
// Base position overall formulas (depth chart): how a player rates at each position. EDIT THIS FILE to tune them.
//
// Each position has desired_low (L), desired_high (H) and archetypes, each a set of attribute weights adding up to 1.0.
// A player's overall at a position = the BEST of its archetypes, each computed as
//   clamp(round((sum(attr * weight) - L) * (99 / (H - L))), 40, 99)
// (3-letter Madden codes; specialist-config.js › attributeCodes maps them to EA's attribute names.)
//
// On the depth chart these are used for players OUT of their own position: his league overall is moved by the
// difference between the formula at the new spot and the formula at his own position, so team upgrades still count.
// SS was cut off in the file this came from, so its other two archetypes are copied from FS (the others come in pairs too).
// K and P have no formula here; they keep their league overall.
// ============================================================================================================
const positionFormulaConfig = {
  "meta": {
    "version": "1.0.0",
    "formula": "clamp(round((sum(attr * weight) - desired_low) * (99 / (desired_high - desired_low))), min_ovr_floor, max_ovr_cap)",
    "base_position_rule": "Calculate OVR for each archetype under the target position and take Math.max(...archetype_ovrs).",
    "specialist_rule": "Filter roster by eligible_positions, compute single specialist formula, and sort descending by specialist_ovr."
  },
  "positions": {
    "QB": {
      "desired_low": 42.0,
      "desired_high": 91.0,
      "archetypes": {
        "Field General": {
          "SAC": 0.16,
          "MAC": 0.16,
          "THP": 0.15,
          "AWR": 0.15,
          "DAC": 0.11,
          "TUP": 0.08,
          "PAC": 0.06,
          "TOR": 0.05,
          "SPD": 0.04,
          "ACC": 0.04
        },
        "Strong Arm": {
          "THP": 0.21,
          "DAC": 0.16,
          "MAC": 0.14,
          "SAC": 0.12,
          "AWR": 0.12,
          "TUP": 0.08,
          "PAC": 0.06,
          "TOR": 0.05,
          "SPD": 0.03,
          "BSK": 0.03
        },
        "Scrambler": {
          "SPD": 0.16,
          "ACC": 0.13,
          "THP": 0.13,
          "TOR": 0.11,
          "SAC": 0.1,
          "AGI": 0.06,
          "COD": 0.06,
          "MAC": 0.08,
          "AWR": 0.08,
          "DAC": 0.05,
          "CAR": 0.04
        },
        "Improviser": {
          "THP": 0.15,
          "TOR": 0.13,
          "SAC": 0.13,
          "MAC": 0.12,
          "AWR": 0.11,
          "TUP": 0.09,
          "DAC": 0.08,
          "SPD": 0.08,
          "ACC": 0.06,
          "AGI": 0.05
        }
      }
    },
    "HB": {
      "desired_low": 44.0,
      "desired_high": 92.0,
      "archetypes": {
        "Elusive Back": {
          "SPD": 0.16,
          "ACC": 0.13,
          "AGI": 0.11,
          "COD": 0.11,
          "BTK": 0.1,
          "BCV": 0.1,
          "JKM": 0.08,
          "SPM": 0.07,
          "CAR": 0.07,
          "AWR": 0.07
        },
        "Power Back": {
          "TRK": 0.17,
          "BTK": 0.15,
          "STR": 0.1,
          "BCV": 0.1,
          "CAR": 0.1,
          "SPD": 0.1,
          "ACC": 0.09,
          "SFA": 0.08,
          "AWR": 0.07,
          "AGI": 0.04
        },
        "Receiving Back": {
          "CTH": 0.16,
          "SRR": 0.14,
          "SPD": 0.12,
          "ACC": 0.1,
          "AGI": 0.1,
          "COD": 0.09,
          "BCV": 0.08,
          "CAR": 0.08,
          "AWR": 0.08,
          "PBK": 0.05
        }
      }
    },
    "FB": {
      "desired_low": 40.0,
      "desired_high": 88.0,
      "archetypes": {
        "Blocking": {
          "RBK": 0.22,
          "IBL": 0.18,
          "LBK": 0.15,
          "STR": 0.12,
          "AWR": 0.11,
          "PBK": 0.09,
          "ACC": 0.05,
          "CAR": 0.04,
          "TRK": 0.04
        },
        "Utility": {
          "RBK": 0.16,
          "CTH": 0.14,
          "IBL": 0.13,
          "AWR": 0.11,
          "CAR": 0.1,
          "TRK": 0.09,
          "SRR": 0.08,
          "STR": 0.08,
          "SPD": 0.06,
          "ACC": 0.05
        }
      }
    },
    "WR": {
      "desired_low": 44.0,
      "desired_high": 92.0,
      "archetypes": {
        "Deep Threat": {
          "SPD": 0.19,
          "DRR": 0.17,
          "ACC": 0.13,
          "CTH": 0.12,
          "SPC": 0.09,
          "REL": 0.08,
          "MRR": 0.07,
          "AWR": 0.07,
          "AGI": 0.04,
          "JMP": 0.04
        },
        "Route Runner": {
          "SRR": 0.16,
          "MRR": 0.16,
          "CTH": 0.14,
          "COD": 0.1,
          "AGI": 0.09,
          "SPD": 0.09,
          "ACC": 0.08,
          "REL": 0.07,
          "AWR": 0.06,
          "CIT": 0.05
        },
        "Physical": {
          "CIT": 0.16,
          "SPC": 0.14,
          "CTH": 0.13,
          "REL": 0.11,
          "SPD": 0.1,
          "JMP": 0.08,
          "STR": 0.07,
          "SRR": 0.05,
          "MRR": 0.05,
          "DRR": 0.05,
          "AWR": 0.06
        },
        "Playmaker": {
          "SPD": 0.15,
          "COD": 0.14,
          "AGI": 0.12,
          "ACC": 0.11,
          "SRR": 0.11,
          "CTH": 0.11,
          "BCV": 0.06,
          "JKM": 0.06,
          "MRR": 0.08,
          "AWR": 0.06
        }
      }
    },
    "TE": {
      "desired_low": 42.0,
      "desired_high": 90.0,
      "archetypes": {
        "Vertical Threat": {
          "SPD": 0.15,
          "CTH": 0.14,
          "MRR": 0.13,
          "DRR": 0.11,
          "ACC": 0.1,
          "CIT": 0.09,
          "SPC": 0.08,
          "SRR": 0.08,
          "AWR": 0.07,
          "RBK": 0.05
        },
        "Possession": {
          "CIT": 0.16,
          "CTH": 0.16,
          "SRR": 0.14,
          "MRR": 0.11,
          "AWR": 0.1,
          "REL": 0.08,
          "RBK": 0.08,
          "SPD": 0.07,
          "ACC": 0.06,
          "STR": 0.04
        },
        "Blocking": {
          "RBK": 0.22,
          "RBP": 0.13,
          "RBF": 0.13,
          "IBL": 0.11,
          "LBK": 0.1,
          "STR": 0.1,
          "PBK": 0.08,
          "AWR": 0.08,
          "CTH": 0.05
        }
      }
    },
    "OT": {
      "desired_low": 42.0,
      "desired_high": 90.0,
      "archetypes": {
        "Pass Protector": {
          "PBK": 0.22,
          "PBP": 0.16,
          "PBF": 0.16,
          "AWR": 0.14,
          "STR": 0.12,
          "RBK": 0.08,
          "AGI": 0.04,
          "ACC": 0.04,
          "IBL": 0.04
        },
        "Power": {
          "RBK": 0.2,
          "RBP": 0.16,
          "STR": 0.15,
          "IBL": 0.13,
          "AWR": 0.12,
          "PBK": 0.1,
          "PBP": 0.08,
          "LBK": 0.06
        },
        "Agile": {
          "RBK": 0.18,
          "RBF": 0.15,
          "LBK": 0.14,
          "AGI": 0.11,
          "ACC": 0.1,
          "AWR": 0.1,
          "PBK": 0.1,
          "PBF": 0.08,
          "STR": 0.04
        }
      }
    },
    "OG": {
      "desired_low": 42.0,
      "desired_high": 90.0,
      "archetypes": {
        "Pass Protector": {
          "PBK": 0.22,
          "PBP": 0.16,
          "PBF": 0.16,
          "AWR": 0.14,
          "STR": 0.12,
          "RBK": 0.08,
          "AGI": 0.04,
          "ACC": 0.04,
          "IBL": 0.04
        },
        "Power": {
          "RBK": 0.2,
          "RBP": 0.16,
          "STR": 0.15,
          "IBL": 0.13,
          "AWR": 0.12,
          "PBK": 0.1,
          "PBP": 0.08,
          "LBK": 0.06
        },
        "Agile": {
          "RBK": 0.18,
          "RBF": 0.15,
          "LBK": 0.14,
          "AGI": 0.11,
          "ACC": 0.1,
          "AWR": 0.1,
          "PBK": 0.1,
          "PBF": 0.08,
          "STR": 0.04
        }
      }
    },
    "C": {
      "desired_low": 42.0,
      "desired_high": 90.0,
      "archetypes": {
        "Pass Protector": {
          "PBK": 0.22,
          "PBP": 0.16,
          "PBF": 0.16,
          "AWR": 0.14,
          "STR": 0.12,
          "RBK": 0.08,
          "AGI": 0.04,
          "ACC": 0.04,
          "IBL": 0.04
        },
        "Power": {
          "RBK": 0.2,
          "RBP": 0.16,
          "STR": 0.15,
          "IBL": 0.13,
          "AWR": 0.12,
          "PBK": 0.1,
          "PBP": 0.08,
          "LBK": 0.06
        },
        "Agile": {
          "RBK": 0.18,
          "RBF": 0.15,
          "LBK": 0.14,
          "AGI": 0.11,
          "ACC": 0.1,
          "AWR": 0.1,
          "PBK": 0.1,
          "PBF": 0.08,
          "STR": 0.04
        }
      }
    },
    "LE": {
      "desired_low": 44.0,
      "desired_high": 91.0,
      "archetypes": {
        "Speed Rusher": {
          "FMV": 0.24,
          "SPD": 0.14,
          "ACC": 0.14,
          "BSH": 0.1,
          "TAK": 0.09,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.07,
          "PMV": 0.06
        },
        "Power Rusher": {
          "PMV": 0.24,
          "STR": 0.13,
          "BSH": 0.12,
          "ACC": 0.11,
          "SPD": 0.1,
          "TAK": 0.09,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.05
        },
        "Run Stopper": {
          "BSH": 0.22,
          "TAK": 0.15,
          "STR": 0.13,
          "PRC": 0.12,
          "AWR": 0.1,
          "PUR": 0.1,
          "PMV": 0.07,
          "ACC": 0.06,
          "SPD": 0.05
        }
      }
    },
    "RE": {
      "desired_low": 44.0,
      "desired_high": 91.0,
      "archetypes": {
        "Speed Rusher": {
          "FMV": 0.24,
          "SPD": 0.14,
          "ACC": 0.14,
          "BSH": 0.1,
          "TAK": 0.09,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.07,
          "PMV": 0.06
        },
        "Power Rusher": {
          "PMV": 0.24,
          "STR": 0.13,
          "BSH": 0.12,
          "ACC": 0.11,
          "SPD": 0.1,
          "TAK": 0.09,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.05
        },
        "Run Stopper": {
          "BSH": 0.22,
          "TAK": 0.15,
          "STR": 0.13,
          "PRC": 0.12,
          "AWR": 0.1,
          "PUR": 0.1,
          "PMV": 0.07,
          "ACC": 0.06,
          "SPD": 0.05
        }
      }
    },
    "DT": {
      "desired_low": 44.0,
      "desired_high": 91.0,
      "archetypes": {
        "Run Stopper": {
          "BSH": 0.22,
          "STR": 0.16,
          "TAK": 0.14,
          "PRC": 0.12,
          "AWR": 0.1,
          "PUR": 0.09,
          "PMV": 0.08,
          "ACC": 0.05,
          "FMV": 0.04
        },
        "Power Rusher": {
          "PMV": 0.22,
          "STR": 0.15,
          "BSH": 0.15,
          "ACC": 0.1,
          "TAK": 0.1,
          "PRC": 0.09,
          "AWR": 0.09,
          "PUR": 0.06,
          "SPD": 0.04
        },
        "Speed Rusher": {
          "FMV": 0.22,
          "ACC": 0.14,
          "SPD": 0.12,
          "BSH": 0.12,
          "TAK": 0.1,
          "PRC": 0.09,
          "AWR": 0.09,
          "PUR": 0.07,
          "STR": 0.05
        }
      }
    },
    "LOLB": {
      "desired_low": 44.0,
      "desired_high": 91.0,
      "archetypes": {
        "Power Rusher": {
          "PMV": 0.22,
          "ACC": 0.12,
          "SPD": 0.12,
          "BSH": 0.12,
          "STR": 0.1,
          "TAK": 0.1,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.06
        },
        "Speed Rusher": {
          "FMV": 0.22,
          "SPD": 0.15,
          "ACC": 0.14,
          "BSH": 0.1,
          "TAK": 0.1,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.07,
          "AGI": 0.06
        },
        "Run Stopper": {
          "BSH": 0.18,
          "TAK": 0.16,
          "PRC": 0.12,
          "PUR": 0.11,
          "AWR": 0.1,
          "STR": 0.09,
          "SPD": 0.08,
          "ACC": 0.08,
          "POW": 0.08
        },
        "Pass Coverage": {
          "ZON": 0.19,
          "MAN": 0.14,
          "SPD": 0.13,
          "ACC": 0.11,
          "PRC": 0.1,
          "AWR": 0.1,
          "TAK": 0.09,
          "AGI": 0.05,
          "COD": 0.04,
          "PUR": 0.05
        }
      }
    },
    "ROLB": {
      "desired_low": 44.0,
      "desired_high": 91.0,
      "archetypes": {
        "Power Rusher": {
          "PMV": 0.22,
          "ACC": 0.12,
          "SPD": 0.12,
          "BSH": 0.12,
          "STR": 0.1,
          "TAK": 0.1,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.06
        },
        "Speed Rusher": {
          "FMV": 0.22,
          "SPD": 0.15,
          "ACC": 0.14,
          "BSH": 0.1,
          "TAK": 0.1,
          "PRC": 0.08,
          "AWR": 0.08,
          "PUR": 0.07,
          "AGI": 0.06
        },
        "Run Stopper": {
          "BSH": 0.18,
          "TAK": 0.16,
          "PRC": 0.12,
          "PUR": 0.11,
          "AWR": 0.1,
          "STR": 0.09,
          "SPD": 0.08,
          "ACC": 0.08,
          "POW": 0.08
        },
        "Pass Coverage": {
          "ZON": 0.19,
          "MAN": 0.14,
          "SPD": 0.13,
          "ACC": 0.11,
          "PRC": 0.1,
          "AWR": 0.1,
          "TAK": 0.09,
          "AGI": 0.05,
          "COD": 0.04,
          "PUR": 0.05
        }
      }
    },
    "MLB": {
      "desired_low": 44.0,
      "desired_high": 91.0,
      "archetypes": {
        "Field General": {
          "PRC": 0.17,
          "AWR": 0.15,
          "TAK": 0.15,
          "BSH": 0.12,
          "ZON": 0.1,
          "PUR": 0.1,
          "SPD": 0.08,
          "ACC": 0.07,
          "POW": 0.06
        },
        "Run Stopper": {
          "BSH": 0.18,
          "TAK": 0.17,
          "PUR": 0.12,
          "PRC": 0.12,
          "STR": 0.1,
          "AWR": 0.09,
          "POW": 0.08,
          "SPD": 0.07,
          "ACC": 0.07
        },
        "Pass Coverage": {
          "ZON": 0.2,
          "MAN": 0.14,
          "SPD": 0.13,
          "ACC": 0.11,
          "PRC": 0.1,
          "AWR": 0.1,
          "TAK": 0.09,
          "AGI": 0.04,
          "COD": 0.04,
          "PUR": 0.05
        }
      }
    },
    "CB": {
      "desired_low": 45.0,
      "desired_high": 92.0,
      "archetypes": {
        "Man to Man": {
          "MAN": 0.25,
          "SPD": 0.16,
          "ACC": 0.12,
          "AGI": 0.09,
          "COD": 0.09,
          "PRS": 0.09,
          "PRC": 0.07,
          "AWR": 0.07,
          "ZON": 0.06
        },
        "Zone": {
          "ZON": 0.25,
          "SPD": 0.15,
          "ACC": 0.12,
          "PRC": 0.1,
          "AWR": 0.1,
          "AGI": 0.08,
          "COD": 0.08,
          "MAN": 0.06,
          "TAK": 0.06
        },
        "Slot": {
          "MAN": 0.19,
          "ZON": 0.17,
          "SPD": 0.14,
          "ACC": 0.11,
          "COD": 0.1,
          "AGI": 0.09,
          "TAK": 0.08,
          "PRC": 0.06,
          "AWR": 0.06
        }
      }
    },
    "FS": {
      "desired_low": 45.0,
      "desired_high": 92.0,
      "archetypes": {
        "Zone": {
          "ZON": 0.23,
          "SPD": 0.15,
          "ACC": 0.12,
          "PRC": 0.11,
          "AWR": 0.11,
          "TAK": 0.09,
          "PUR": 0.07,
          "MAN": 0.06,
          "COD": 0.06
        },
        "Run Support": {
          "TAK": 0.17,
          "POW": 0.13,
          "PUR": 0.12,
          "PRC": 0.11,
          "BSH": 0.1,
          "SPD": 0.1,
          "ACC": 0.09,
          "AWR": 0.09,
          "ZON": 0.09
        },
        "Hybrid": {
          "ZON": 0.17,
          "MAN": 0.15,
          "SPD": 0.14,
          "ACC": 0.11,
          "TAK": 0.1,
          "PRC": 0.09,
          "AWR": 0.09,
          "PUR": 0.08,
          "POW": 0.07
        }
      }
    },
    "SS": {
      "desired_low": 45.0,
      "desired_high": 92.0,
      "archetypes": {
        "Zone": {
          "ZON": 0.23,
          "SPD": 0.15,
          "ACC": 0.12,
          "PRC": 0.11,
          "AWR": 0.11,
          "TAK": 0.09,
          "PUR": 0.07,
          "MAN": 0.06,
          "COD": 0.06
        },
        "Run Support": {
          "TAK": 0.17,
          "POW": 0.13,
          "PUR": 0.12,
          "PRC": 0.11,
          "BSH": 0.1,
          "SPD": 0.1,
          "ACC": 0.09,
          "AWR": 0.09,
          "ZON": 0.09
        },
        "Hybrid": {
          "ZON": 0.17,
          "MAN": 0.15,
          "SPD": 0.14,
          "ACC": 0.11,
          "TAK": 0.1,
          "PRC": 0.09,
          "AWR": 0.09,
          "PUR": 0.08,
          "POW": 0.07
        }
      }
    }
  }
};

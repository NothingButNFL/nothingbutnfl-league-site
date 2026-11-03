// Contract offer builder (Free Agency page and the team sheet's Offer Free Agent tab), laid out like the league's
// Contract Offer Template: a summary row, then one row per season with base salary, prorated signing bonus,
// roster bonus, guaranteed salary and cap hit. Signing bonus prorates over up to 5 seasons; deals shorter than
// 5 years can add void years. Needs league-core.js.
function createContractEditor(container, { getData = () => null } = {}) {
  const startYear = () => seasons.includes(currentLeagueYear()) ? currentLeagueYear() : seasons[0];
  const maxYears = () => seasons.length - seasons.indexOf(startYear());
  let player = null;
  let locked = false;
  let vmb = null; // { salary, capBase, limit } when building a Veteran Minimum Benefit deal
  let rows = [];
  let years = 1, voidYears = 0, signingBonus = 0;

  container.classList.add("contract-editor");
  container.innerHTML = `
    <div class="ce-title"><strong>Contract Offer</strong><span class="ce-subtitle"></span></div>
    <div class="management-table-wrap"><table class="ce-summary"><thead><tr>
      <th>NAME</th><th>POSITION</th><th>AGE</th><th>CONTRACT LENGTH</th><th>TOTAL VALUE</th><th>SIGNING BONUS</th><th>TOTAL GTD</th><th>AAV</th>
    </tr></thead><tbody><tr>
      <td data-out="name"></td><td data-out="position"></td><td data-out="age"></td><td data-out="length"></td>
      <td data-out="total"></td><td class="ce-input-cell"><input data-ce="signingBonus" inputmode="decimal" placeholder="$0" aria-label="Signing bonus"></td>
      <td data-out="gtd"></td><td data-out="aav"></td>
    </tr></tbody></table></div>
    <div class="ce-controls">
      <label>Contract years<select data-ce="years"></select></label>
      <label>Void years<select data-ce="voidYears"></select></label>
      <p class="ce-proration"></p>
    </div>
    <div class="management-table-wrap"><table class="ce-years"><thead><tr>
      <th>AGE</th><th>YEAR</th><th>BASE SALARY</th><th>SIGNING BONUS</th><th>ROSTER BONUS</th><th>GTD SALARY</th><th>CAP HIT</th>
    </tr></thead><tbody></tbody><tfoot><tr>
      <th colspan="2" scope="row">TOTALS:</th><td data-out="tBase"></td><td data-out="tBonus"></td><td data-out="tRoster"></td><td data-out="tGtd"></td><td data-out="tCap"></td>
    </tr></tfoot></table></div>
    <p class="ce-void-note" aria-live="polite"></p>`;

  const $ = (sel) => container.querySelector(sel);
  const out = (name, text) => { $(`[data-out="${name}"]`).textContent = text; };
  const yearsSelect = $('[data-ce="years"]');
  const voidSelect = $('[data-ce="voidYears"]');
  const bonusInput = $('[data-ce="signingBonus"]');
  const tbody = $(".ce-years tbody");

  const money = (v) => formatCurrency(v || 0);
  const parse = (text) => { const v = parseMoneyText(text); return v === null ? 0 : v; };

  function fillSelects() {
    yearsSelect.replaceChildren(...Array.from({ length: maxYears() }, (_, i) => new Option(`${i + 1} year${i ? "s" : ""}`, String(i + 1))));
    yearsSelect.value = String(years);
    const maxVoid = Math.max(0, maxProrationSeasons - years);
    if (voidYears > maxVoid) voidYears = maxVoid;
    voidSelect.replaceChildren(...Array.from({ length: maxVoid + 1 }, (_, i) => new Option(i ? `${i} void year${i === 1 ? "" : "s"}` : "None", String(i))));
    voidSelect.value = String(voidYears);
    voidSelect.disabled = locked || vmb || maxVoid === 0;
    yearsSelect.disabled = locked || vmb;
    bonusInput.readOnly = locked;
  }

  function buildRows() {
    while (rows.length < years) rows.push({ baseSalary: 0, rosterBonus: 0, guaranteedSalary: 0 });
    rows = rows.slice(0, years);
    const age = player ? playerAge(player) : null;
    const start = startYear();
    const trs = [];
    for (let i = 0; i < years + voidYears; i++) {
      const tr = document.createElement("tr");
      const isVoid = i >= years;
      if (isVoid) tr.className = "is-void";
      tr.insertCell().textContent = age === null ? "—" : String(age + i);
      const yearCell = tr.insertCell();
      yearCell.textContent = String(start + i);
      if (isVoid) { const tag = document.createElement("span"); tag.className = "ce-void-tag"; tag.textContent = "VOID"; yearCell.append(" ", tag); }
      for (const field of ["baseSalary", "bonus", "rosterBonus", "guaranteedSalary", "cap"]) {
        const cell = tr.insertCell();
        if (field === "bonus" || field === "cap") { cell.dataset.cell = `${field}-${i}`; cell.className = "ce-computed"; continue; }
        if (isVoid) { cell.textContent = "—"; cell.className = "ce-computed"; continue; }
        const input = document.createElement("input");
        input.inputMode = "decimal";
        input.placeholder = "$0";
        input.dataset.row = String(i);
        input.dataset.field = field;
        input.value = rows[i][field] ? formatCurrency(rows[i][field]) : "";
        input.readOnly = locked || (vmb && field === "baseSalary");
        input.setAttribute("aria-label", `${start + i} ${field === "baseSalary" ? "base salary" : field === "rosterBonus" ? "roster bonus" : "guaranteed salary"}`);
        cell.className = "ce-input-cell";
        cell.append(input);
        if (field === "baseSalary") {
          const hint = document.createElement("small");
          hint.className = "ce-min-hint";
          hint.dataset.minHint = String(i);
          cell.append(hint);
        }
      }
      trs.push(tr);
    }
    tbody.replaceChildren(...trs);
  }

  function totals() {
    const shares = prorationShares(signingBonus, years + voidYears);
    const total = signingBonus + rows.reduce((s, r) => s + r.baseSalary + r.rosterBonus, 0);
    const gtd = signingBonus + rows.reduce((s, r) => s + r.guaranteedSalary, 0);
    return { shares, total, gtd };
  }

  function update() {
    const { shares, total, gtd } = totals();
    out("name", player?.name || "—");
    out("position", player?.position || "—");
    const age = player ? playerAge(player) : null;
    out("age", age === null ? "—" : String(age));
    out("length", voidYears ? `${years} + ${voidYears} void` : String(years));
    out("total", money(total));
    out("gtd", money(gtd));
    out("aav", money(Math.round(total / years)));
    let tCap = 0, tBonusReal = 0;
    for (let i = 0; i < years + voidYears; i++) {
      const share = shares[i] || 0;
      container.querySelector(`[data-cell="bonus-${i}"]`).textContent = money(share);
      const capCell = container.querySelector(`[data-cell="cap-${i}"]`);
      if (i < years) {
        const cap = (vmb ? vmb.capBase : rows[i].baseSalary) + share + rows[i].rosterBonus;
        capCell.textContent = money(cap);
        tCap += cap;
        tBonusReal += share;
      } else capCell.textContent = "—";
    }
    const data = getData();
    for (let i = 0; i < years; i++) {
      const hint = container.querySelector(`[data-min-hint="${i}"]`);
      if (!hint) continue;
      const min = data && player ? minimumForSeason(data, player, startYear() + i, startYear()) : null;
      hint.textContent = min ? `Min ${formatCurrency(min.amount)} (${min.experience} yrs)` : "";
      hint.classList.toggle("is-below", Boolean(min) && rows[i].baseSalary < min.amount);
      hint.closest("td").classList.toggle("is-below", Boolean(min) && rows[i].baseSalary < min.amount);
    }
    out("tBase", money(rows.reduce((s, r) => s + r.baseSalary, 0)));
    out("tBonus", money(shares.reduce((s, v) => s + v, 0)));
    out("tRoster", money(rows.reduce((s, r) => s + r.rosterBonus, 0)));
    out("tGtd", money(rows.reduce((s, r) => s + r.guaranteedSalary, 0)));
    out("tCap", money(tCap));
    const seasonsSpread = Math.min(years + voidYears, maxProrationSeasons);
    $(".ce-proration").textContent = signingBonus
      ? `Signing bonus spread over ${seasonsSpread} season${seasonsSpread === 1 ? "" : "s"}${years > maxProrationSeasons ? ` (the most allowed); years ${maxProrationSeasons + 1}+ carry none` : ""}.`
      : years < maxProrationSeasons ? "Void years only matter when there's a signing bonus." : "";
    const voidAmount = shares.slice(years).reduce((s, v) => s + v, 0);
    const voidSeason = startYear() + years;
    $(".ce-void-note").textContent = voidYears && voidAmount
      ? `${money(voidAmount)} of signing bonus sits on the void year${voidYears === 1 ? "" : "s"}. The player isn't under contract then: after his final season (${voidSeason - 1}) it accelerates onto the ${voidSeason} dead-cap table${seasons.includes(voidSeason) ? "" : " (past the last salary sheet, so it isn't tracked)"}.`
      : "";
    const sub = $(".ce-subtitle");
    sub.textContent = vmb ? "Veteran Minimum Benefit" : locked ? "League minimum" : "Original";
    if (vmb) {
      const extras = signingBonus + rows.reduce((s, r) => s + r.rosterBonus + r.guaranteedSalary, 0);
      const over = vmb.limit !== null && extras > vmb.limit;
      $(".ce-proration").textContent = `Cap charge uses the ${formatCurrency(vmb.capBase)} 2-year minimum instead of his ${formatCurrency(vmb.salary)} salary.${vmb.limit === null ? "" : ` Bonuses + guarantees: ${formatCurrency(extras)} of ${formatCurrency(vmb.limit)} allowed.`}`;
      $(".ce-proration").classList.toggle("is-over", over);
    } else $(".ce-proration").classList.remove("is-over");
  }

  function render() { fillSelects(); buildRows(); update(); }

  yearsSelect.addEventListener("change", () => { years = Number(yearsSelect.value); render(); container.dispatchEvent(new Event("contractchange", { bubbles: true })); });
  voidSelect.addEventListener("change", () => { voidYears = Number(voidSelect.value); render(); container.dispatchEvent(new Event("contractchange", { bubbles: true })); });
  bonusInput.addEventListener("input", () => { signingBonus = parse(bonusInput.value); update(); });
  bonusInput.addEventListener("change", () => { const v = parseMoneyText(bonusInput.value); bonusInput.value = v ? formatCurrency(v) : ""; });
  tbody.addEventListener("input", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    rows[Number(input.dataset.row)][input.dataset.field] = parse(input.value);
    update();
  });
  tbody.addEventListener("change", (event) => {
    const input = event.target.closest("[data-field]");
    if (!input) return;
    const v = parseMoneyText(input.value);
    input.value = v ? formatCurrency(v) : "";
  });
  container.addEventListener("input", () => container.dispatchEvent(new Event("contractchange", { bubbles: true })));

  return {
    reset(forPlayer) {
      player = forPlayer || null;
      locked = false; vmb = null; years = 1; voidYears = 0; signingBonus = 0; rows = [];
      bonusInput.value = "";
      render();
    },
    load(offer) {
      years = offer.years; voidYears = offer.voidYears || 0; signingBonus = offer.signingBonus || 0;
      rows = Array.isArray(offer.yearsDetail) ? offer.yearsDetail.map((r) => ({ ...r }))
        : contractSeasonBreakdown(offer, startYear()).map(({ baseSalary, rosterBonus, guaranteedSalary }) => ({ baseSalary, rosterBonus, guaranteedSalary }));
      bonusInput.value = signingBonus ? formatCurrency(signingBonus) : "";
      render();
    },
    setVmb(terms) {
      locked = false; vmb = { salary: terms.salary, capBase: terms.capBase, limit: terms.limit };
      years = 1; voidYears = 0;
      rows = [{ baseSalary: terms.salary, rosterBonus: rows[0]?.rosterBonus || 0, guaranteedSalary: Math.min(rows[0]?.guaranteedSalary || 0, terms.salary) }];
      render();
    },
    setMinimum(amount) {
      locked = true; vmb = null; years = 1; voidYears = 0; signingBonus = 0;
      rows = [{ baseSalary: amount, rosterBonus: 0, guaranteedSalary: 0 }];
      bonusInput.value = "";
      render();
    },
    unlock() { locked = false; vmb = null; render(); },
    isLocked: () => locked || Boolean(vmb),
    // The offer terms, or { error }.
    read() {
      const raw = [bonusInput, ...tbody.querySelectorAll("input")];
      const bad = raw.find((input) => parseMoneyText(input.value) === undefined);
      if (bad) { bad.focus(); return { error: "Enter amounts as dollars, like 12,500,000 or 12.5M." }; }
      const over = rows.findIndex((r) => r.guaranteedSalary > r.baseSalary);
      if (over !== -1) return { error: `${startYear() + over}: guaranteed salary can't be more than that year's base salary.` };
      const { total, gtd } = totals();
      if (!total) return { error: "Enter a base salary or signing bonus." };
      const data = getData();
      if (data && player) {
        for (let i = 0; i < years; i++) {
          const min = minimumForSeason(data, player, startYear() + i, startYear());
          if (min && rows[i].baseSalary < min.amount) {
            tbody.querySelector(`input[data-row="${i}"][data-field="baseSalary"]`)?.focus();
            return { error: `${startYear() + i}: base salary must be at least the ${formatCurrency(min.amount)} minimum for ${minimumTierLabel(min.tier)} of experience (${player.name} will have ${min.experience}).` };
          }
        }
      }
      return { years, voidYears, signingBonus, startYear: startYear(), totalValue: total, guaranteed: gtd,
        yearsDetail: rows.map((r) => ({ ...r })) };
    },
    firstYearCapHit() {
      const { shares } = totals();
      return rows[0] ? (vmb ? vmb.capBase : rows[0].baseSalary) + (shares[0] || 0) + rows[0].rosterBonus : 0;
    }
  };
}

import {
  auditPayrollCsvText,
  buildSampleAuditCsv,
  compareR8VsR7,
  decodePayrollBytes,
  evaluateDependent,
  formatAuditReportCsv,
  simulateWallCheckpoints,
} from "./engine.js";

const SIM_PRESETS = {
  "univ-152": {
    selfSalary: 6200000,
    socIns: "",
    hasSpouse: true,
    spouseAge: 47,
    spouseSalary: 1320000,
    hasChild: true,
    childAge: 20,
    childSalary: 1520000,
  },
  "part-178": {
    selfSalary: 1780000,
    socIns: "0",
    hasSpouse: false,
    spouseAge: 40,
    spouseSalary: 0,
    hasChild: false,
    childAge: 20,
    childSalary: 0,
  },
  "mid-510": {
    selfSalary: 5100000,
    socIns: "",
    hasSpouse: true,
    spouseAge: 42,
    spouseSalary: 1760000,
    hasChild: false,
    childAge: 20,
    childSalary: 0,
  },
  "exec-920": {
    selfSalary: 9200000,
    socIns: "",
    hasSpouse: false,
    spouseAge: 45,
    spouseSalary: 0,
    hasChild: true,
    childAge: 21,
    childSalary: 1300000,
  },
};

function fmtYen(n) {
  return `¥${Number(n).toLocaleString("ja-JP")}`;
}

function fmtSignedYen(n) {
  const num = Number(n);
  if (num > 0) return `+¥${num.toLocaleString("ja-JP")}`;
  if (num < 0) return `-¥${Math.abs(num).toLocaleString("ja-JP")}`;
  return "¥0";
}

function el(id) {
  return document.getElementById(id);
}

// ============================================================================
// Mode Switching
// ============================================================================
const tabSim = el("tab-sim");
const tabCsv = el("tab-csv");
const viewSim = el("view-sim");
const viewCsv = el("view-csv");

function activateMode(mode) {
  const isSim = mode === "sim";
  tabSim.setAttribute("aria-selected", String(isSim));
  tabCsv.setAttribute("aria-selected", String(!isSim));
  viewSim.hidden = !isSim;
  viewCsv.hidden = isSim;
}

tabSim.addEventListener("click", () => activateMode("sim"));
tabCsv.addEventListener("click", () => activateMode("csv"));
el("btn-jump-csv").addEventListener("click", () => activateMode("csv"));

// ============================================================================
// Mode 1: Household Simulator + SVG Step Curve
// ============================================================================
const inpSelfSalary = el("inp-self-salary");
const rngSelfSalary = el("rng-self-salary");
const inpSocIns = el("inp-soc-ins");
const chkHasSpouse = el("chk-has-spouse");
const inpSpouseAge = el("inp-spouse-age");
const inpSpouseSalary = el("inp-spouse-salary");
const rngSpouseSalary = el("rng-spouse-salary");
const chkHasChild = el("chk-has-child");
const inpChildAge = el("inp-child-age");
const inpChildSalary = el("inp-child-salary");
const rngChildSalary = el("rng-child-salary");

function readSafeInt(inputEl, fallback = 0) {
  const raw = String(inputEl.value ?? "").trim();
  if (raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

function buildHouseholdState() {
  const salaryYen = readSafeInt(inpSelfSalary, 0) ?? 0;
  const socRaw = readSafeInt(inpSocIns, null);
  const hasSpouse = chkHasSpouse.checked;
  const spouseAge = readSafeInt(inpSpouseAge, 40) ?? 40;
  const spouseSalary = readSafeInt(inpSpouseSalary, 0) ?? 0;
  const hasChild = chkHasChild.checked;
  const childAge = readSafeInt(inpChildAge, 20) ?? 20;
  const childSalary = readSafeInt(inpChildSalary, 0) ?? 0;

  const dependents = hasChild
    ? [{ name: "親族", age: childAge, salary_yen: childSalary, other_income_yen: 0 }]
    : [];

  return {
    salary_yen: salaryYen,
    social_insurance_yen: socRaw,
    has_spouse: hasSpouse,
    spouse_age: spouseAge,
    spouse_salary_yen: spouseSalary,
    dependents,
  };
}

function renderStepChartSvg(currentChildSalary, childAge) {
  const svg = el("step-chart-svg");
  const W = 660;
  const H = 204;
  const padL = 52;
  const padR = 20;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const minX = 950000;
  const maxX = 2120000;
  const maxY = 700000;

  const xPos = (sal) => padL + ((Math.min(Math.max(sal, minX), maxX) - minX) / (maxX - minX)) * plotW;
  const yPos = (ded) => padT + plotH - (ded / maxY) * plotH;

  const evalAge = childAge >= 19 && childAge < 23 ? childAge : 20;
  const sampleSalaries = [];
  for (let s = minX; s <= maxX; s += 5000) {
    sampleSalaries.push(s);
  }

  const ptsR8 = sampleSalaries
    .map((s) => `${xPos(s).toFixed(1)},${yPos(evaluateDependent({ age: evalAge, salary_yen: s }, 2026).deduction_yen).toFixed(1)}`)
    .join(" ");
  const ptsR7 = sampleSalaries
    .map((s) => `${xPos(s).toFixed(1)},${yPos(evaluateDependent({ age: evalAge, salary_yen: s }, 2025).deduction_yen).toFixed(1)}`)
    .join(" ");

  const yTicks = [0, 210000, 420000, 630000];
  const xTicks = [1030000, 1230000, 1360000, 1590000, 1780000, 1970000];

  const curDed = evaluateDependent({ age: evalAge, salary_yen: currentChildSalary }, 2026).deduction_yen;
  const cx = xPos(currentChildSalary);
  const cy = yPos(curDed);

  const gridParts = yTicks
    .map((yt) => {
      const y = yPos(yt).toFixed(1);
      const label = yt === 0 ? "0" : `${yt / 10000}万`;
      const stroke = yt === 0 ? "#c7ccd6" : "#e5e7eb";
      return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${stroke}" stroke-width="1"/>
              <text x="${padL - 8}" y="${Number(y) + 4}" text-anchor="end" font-size="12" fill="#595e68">${label}</text>`;
    })
    .join("");

  const xTickParts = xTicks
    .map((xt) => {
      const x = xPos(xt).toFixed(1);
      return `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#595e68">${xt / 10000}万</text>`;
    })
    .join("");

  svg.innerHTML = `
    ${gridParts}
    ${xTickParts}
    <polyline fill="none" stroke="#8a8f98" stroke-width="1.8" stroke-dasharray="4 3" points="${ptsR7}"/>
    <polyline fill="none" stroke="#1d5fbf" stroke-width="2.4" points="${ptsR8}"/>
    <line x1="${cx.toFixed(1)}" y1="${padT}" x2="${cx.toFixed(1)}" y2="${padT + plotH}" stroke="#141414" stroke-width="1" stroke-dasharray="3 3"/>
    <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4.5" fill="#1d5fbf" stroke="#ffffff" stroke-width="1.5"/>
  `;
}

function categoryBadge(cat, formType) {
  if (cat === "tokutei_fuyo" || cat === "ippan_fuyo" || cat.startsWith("rojin_fuyo") || cat.startsWith("haigusha_kojo")) {
    return `<span class="status-pill pill-pos">${formType || "扶養・配偶者控除"}</span>`;
  }
  if (cat === "tokutei_shinzoku_tokubetsu" || cat === "haigusha_tokubetsu_kojo") {
    return `<span class="status-pill pill-warn">${formType || "特別控除（段階）"}</span>`;
  }
  if (cat.startsWith("R8_")) {
    return `<span class="status-pill pill-neutral">基礎控除申告書</span>`;
  }
  return `<span class="status-pill pill-neutral">対象外（0円）</span>`;
}

function updateSimulator() {
  el("spouse-fields").hidden = !chkHasSpouse.checked;
  el("child-fields").hidden = !chkHasChild.checked;

  const hh = buildHouseholdState();
  const comp = compareR8VsR7(hh);
  const r8 = comp.r8_2026;
  const delta = comp.delta;

  el("hint-self-income").textContent = `合計所得 ${fmtYen(r8.total_income_yen)}`;
  el("hint-soc-ins").textContent = r8.social_insurance_estimated
    ? `概算 ${fmtYen(r8.social_insurance_yen)}`
    : `手入力 ${fmtYen(r8.social_insurance_yen)}`;

  el("kpi-r8-tax").textContent = fmtYen(r8.annual_tax_yen);
  const sav = delta.annual_tax_savings_yen;
  el("kpi-r8-tax-delta").innerHTML =
    sav > 0
      ? `令和7年比 <span class="delta-pos">-${fmtYen(sav)} 減税</span>`
      : `令和7年比 ¥0（同額）`;

  const combinedBasicEmp = r8.basic_deduction_yen + r8.employment_deduction_yen;
  el("kpi-basic-emp").textContent = fmtYen(combinedBasicEmp);
  el("kpi-basic-detail").textContent = `基礎 ${fmtYen(r8.basic_deduction_yen)} · 給与控除 ${fmtYen(r8.employment_deduction_yen)}`;

  const depTotal = r8.fuyo_deduction_total_yen + r8.tokutei_shinzoku_deduction_total_yen;
  el("kpi-dep-ded").textContent = fmtYen(depTotal);
  if (r8.dependent_results.length > 0) {
    const dr = r8.dependent_results[0];
    el("kpi-dep-form").textContent = `${dr.form_type}（所得 ${fmtYen(dr.total_income_yen)}）`;
    el("hint-child-income").textContent = `所得 ${fmtYen(dr.total_income_yen)}`;
    if (dr.next_cliff_salary_yen !== null && dr.margin_to_next_cliff_yen !== null) {
      el("hint-child-cliff").textContent = `次の境界（${fmtYen(dr.next_cliff_salary_yen)}）まで残り ${fmtYen(dr.margin_to_next_cliff_yen)}`;
    } else {
      el("hint-child-cliff").textContent = "控除対象上限（197万円 / 136万円）を超過しています";
    }
  } else {
    el("kpi-dep-form").textContent = "対象親族なし";
  }

  if (hh.has_spouse) {
    el("hint-spouse-income").textContent = `所得 ${fmtYen(r8.spouse_result.spouse_total_income_yen)}`;
  }

  const spousePlusAdj = r8.spouse_result.deduction_yen + r8.income_adjustment_deduction_yen;
  el("kpi-spouse-adj").textContent = fmtYen(spousePlusAdj);
  el("kpi-takehome").textContent = `本人概算手取り ${fmtYen(r8.estimated_net_take_home_yen)}`;

  el("sim-headline-finding").textContent =
    sav > 0
      ? `令和8年分改正により、この世帯の所得税は令和7年比で年間 ${fmtYen(sav)} 軽減されます（控除合計 +${fmtYen(delta.total_deductions_diff_yen)}）。`
      : `現在の条件では令和8年分の年調年税額は ${fmtYen(r8.annual_tax_yen)} です（課税所得 ${fmtYen(r8.taxable_income_rounded_yen)}）。`;

  const childSalForChart = hh.dependents.length > 0 ? hh.dependents[0].salary_yen : 1520000;
  const childAgeForChart = hh.dependents.length > 0 ? hh.dependents[0].age : 20;
  renderStepChartSvg(childSalForChart, childAgeForChart);

  // Wall table target follows active household composition
  let wallTarget = "self";
  if (hh.dependents.length > 0) wallTarget = "child";
  else if (hh.has_spouse) wallTarget = "spouse";

  const scopeLabels = {
    child: "対象: 大学生年代の子（19〜22歳）の給与収入別シミュレーション",
    spouse: "対象: 配偶者の給与収入別シミュレーション",
    self: "対象: 納税者本人の給与収入別シミュレーション",
  };
  el("wall-table-scope").textContent = scopeLabels[wallTarget];

  const checkpoints = simulateWallCheckpoints(hh, wallTarget);
  const activeVal =
    wallTarget === "child"
      ? childSalForChart
      : wallTarget === "spouse"
      ? hh.spouse_salary_yen
      : hh.salary_yen;

  let closestIdx = 0;
  let minDiff = Infinity;
  checkpoints.forEach((cp, idx) => {
    const d = Math.abs(cp.checkpoint_salary_yen - activeVal);
    if (d < minDiff) {
      minDiff = d;
      closestIdx = idx;
    }
  });

  const tbody = el("wall-tbody");
  tbody.innerHTML = checkpoints
    .map((cp, idx) => {
      const activeCls = idx === closestIdx ? ' class="row-active"' : "";
      const taxRed = cp.taxpayer_tax_reduction_r8_yen ?? cp.tax_savings_vs_r7_yen ?? 0;
      const formLabel =
        wallTarget === "spouse"
          ? cp.deduction_category_r8.startsWith("haigusha_kojo")
            ? "配偶者控除"
            : cp.deduction_category_r8 === "haigusha_tokubetsu_kojo"
            ? "配偶者特別控除"
            : "対象外"
          : cp.form_type_r8 || "基礎控除申告書";
      return `<tr${activeCls}>
        <td class="num">${fmtYen(cp.checkpoint_salary_yen)}</td>
        <td class="num">${fmtYen(cp.target_total_income_r8_yen)}</td>
        <td>${categoryBadge(cp.deduction_category_r8, formLabel)}</td>
        <td class="num">${fmtYen(cp.deduction_r8_yen)}</td>
        <td class="num">${fmtYen(cp.deduction_r7_yen)}</td>
        <td class="num">${fmtYen(taxRed)}</td>
        <td class="num">${fmtYen(cp.own_income_tax_r8_yen)}</td>
      </tr>`;
    })
    .join("");
}

function syncPair(numEl, rngEl) {
  numEl.addEventListener("input", () => {
    const v = readSafeInt(numEl, 0) ?? 0;
    rngEl.value = String(Math.min(Math.max(v, Number(rngEl.min)), Number(rngEl.max)));
    clearActiveSimPreset();
    updateSimulator();
  });
  rngEl.addEventListener("input", () => {
    numEl.value = rngEl.value;
    clearActiveSimPreset();
    updateSimulator();
  });
}

function clearActiveSimPreset() {
  document.querySelectorAll("[data-sim-preset]").forEach((btn) => {
    btn.setAttribute("aria-pressed", "false");
  });
}

syncPair(inpSelfSalary, rngSelfSalary);
syncPair(inpSpouseSalary, rngSpouseSalary);
syncPair(inpChildSalary, rngChildSalary);
[inpSocIns, chkHasSpouse, inpSpouseAge, chkHasChild, inpChildAge].forEach((ctrl) => {
  ctrl.addEventListener("input", () => {
    clearActiveSimPreset();
    updateSimulator();
  });
  ctrl.addEventListener("change", () => {
    clearActiveSimPreset();
    updateSimulator();
  });
});

document.querySelectorAll("[data-sim-preset]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.getAttribute("data-sim-preset");
    const p = SIM_PRESETS[key];
    if (!p) return;
    document.querySelectorAll("[data-sim-preset]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
    inpSelfSalary.value = String(p.selfSalary);
    rngSelfSalary.value = String(Math.min(Math.max(p.selfSalary, Number(rngSelfSalary.min)), Number(rngSelfSalary.max)));
    inpSocIns.value = p.socIns;
    chkHasSpouse.checked = p.hasSpouse;
    inpSpouseAge.value = String(p.spouseAge);
    inpSpouseSalary.value = String(p.spouseSalary);
    rngSpouseSalary.value = String(p.spouseSalary);
    chkHasChild.checked = p.hasChild;
    inpChildAge.value = String(p.childAge);
    inpChildSalary.value = String(p.childSalary);
    rngChildSalary.value = String(p.childSalary);
    updateSimulator();
  });
});

// ============================================================================
// Mode 2: HR / Accounting CSV Batch Auditor
// ============================================================================
let currentSummary = null;
let currentFilter = "all";
let selectedEmployeeId = null;

function statusPillHtml(status) {
  if (status === "critical") return `<span class="status-pill pill-neg">要是正（重大）</span>`;
  if (status === "action_required") return `<span class="status-pill pill-warn">要確認</span>`;
  return `<span class="status-pill pill-pos">適正</span>`;
}

function renderSelectedEmployeeDetail(rec) {
  const metaEl = el("detail-emp-meta");
  const listEl = el("detail-finding-list");
  if (!rec) {
    metaEl.textContent = "行を選択してください";
    listEl.innerHTML = `<li class="finding-card"><div class="finding-detail">一覧から従業員をクリックすると、根拠条文と控除差額の内訳を表示します。</div></li>`;
    return;
  }

  metaEl.textContent = `${rec.employee_id} ${rec.employee_name}（${rec.department} · 年収 ${fmtYen(rec.salary_yen)}）`;
  if (rec.findings.length === 0) {
    listEl.innerHTML = `<li class="finding-card">
      <div class="finding-top">
        <span class="finding-title">令和8年分 法定基準と完全一致（是正不要）</span>
        <span class="status-pill pill-pos">適正</span>
      </div>
      <div class="finding-detail">基礎控除 ${fmtYen(rec.statutory_basic_deduction_yen)}・配偶者控除等 ${fmtYen(rec.statutory_spouse_deduction_yen)}・扶養/特定親族控除 ${fmtYen(rec.statutory_fuyo_deduction_yen + rec.statutory_tokutei_shinzoku_deduction_yen)} が正しく反映されています（法定年調年税額 ${fmtYen(rec.statutory_annual_tax_r8_yen)}）。</div>
    </li>`;
    return;
  }

  listEl.innerHTML = rec.findings
    .map((f) => {
      const pill = f.severity === "critical" ? "pill-neg" : "pill-warn";
      return `<li class="finding-card">
        <div class="finding-top">
          <span class="finding-title">${f.title}</span>
          <span class="status-pill ${pill}"><code>${f.code}</code> · 控除差額 ${fmtSignedYen(f.deduction_gap_yen)}</span>
        </div>
        <div class="finding-detail">${f.detail}</div>
        <div class="finding-basis">根拠法令: ${f.statutory_basis}</div>
      </li>`;
    })
    .join("");
}

function renderCsvTable() {
  if (!currentSummary) return;
  const q = String(el("inp-csv-search").value ?? "").trim().toLowerCase();
  const filtered = currentSummary.records.filter((r) => {
    if (currentFilter !== "all" && r.status !== currentFilter) return false;
    if (!q) return true;
    return (
      r.employee_id.toLowerCase().includes(q) ||
      r.employee_name.toLowerCase().includes(q) ||
      r.department.toLowerCase().includes(q)
    );
  });

  const tbody = el("csv-tbody");
  const emptyEl = el("csv-empty-state");
  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyEl.hidden = false;
    renderSelectedEmployeeDetail(null);
    return;
  }
  emptyEl.hidden = true;

  if (!filtered.some((r) => r.employee_id === selectedEmployeeId)) {
    selectedEmployeeId = filtered[0].employee_id;
  }

  tbody.innerHTML = filtered
    .map((r) => {
      const isSel = r.employee_id === selectedEmployeeId;
      const statDep = r.statutory_fuyo_deduction_yen + r.statutory_tokutei_shinzoku_deduction_yen;
      const decDep = (r.declared_fuyo_deduction_yen ?? 0) + (r.declared_tokutei_shinzoku_deduction_yen ?? 0);
      let diffHtml = `<span class="num">¥0</span>`;
      if (r.tax_overpayment_yen > 0) {
        diffHtml = `<span class="delta-neg num">還付漏れ ${fmtYen(r.tax_overpayment_yen)}</span>`;
      } else if (r.tax_underpayment_yen > 0) {
        diffHtml = `<span class="delta-neg num">不足 ${fmtYen(r.tax_underpayment_yen)}</span>`;
      }
      return `<tr class="audit-row" tabindex="0" data-emp-id="${r.employee_id}" aria-selected="${isSel}">
        <td><strong>${r.employee_name}</strong><br><span style="font-size:12px;color:#595e68;"><code>${r.employee_id}</code> · ${r.department}</span></td>
        <td>${statusPillHtml(r.status)}</td>
        <td class="num">${fmtYen(r.salary_yen)}</td>
        <td class="num">${fmtYen(r.statutory_basic_deduction_yen)}<br><span style="font-size:12px;color:#595e68;">申: ${r.declared_basic_deduction_yen === null ? "-" : fmtYen(r.declared_basic_deduction_yen)}</span></td>
        <td class="num">${fmtYen(statDep)}<br><span style="font-size:12px;color:#595e68;">申: ${fmtYen(decDep)}</span></td>
        <td class="num">${fmtYen(r.statutory_annual_tax_r8_yen)}</td>
        <td class="num">${diffHtml}</td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".audit-row").forEach((tr) => {
    const selectRow = () => {
      selectedEmployeeId = tr.getAttribute("data-emp-id");
      renderCsvTable();
    };
    tr.addEventListener("click", selectRow);
    tr.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectRow();
      }
    });
  });

  const activeRec = filtered.find((r) => r.employee_id === selectedEmployeeId) || filtered[0];
  renderSelectedEmployeeDetail(activeRec);
}

function applyCsvSummary(summary) {
  currentSummary = summary;
  selectedEmployeeId =
    (summary.records.find((r) => r.findings.length > 0) || summary.records[0] || {}).employee_id ?? null;

  el("csv-error-banner").hidden = true;
  el("csv-kpi-overpay").textContent = fmtYen(summary.total_tax_overpayment_yen);
  el("csv-kpi-underpay").textContent = `徴収不足合計 ${fmtYen(summary.total_tax_underpayment_yen)}`;
  el("csv-kpi-total").textContent = `${summary.total_employees}名`;
  el("csv-kpi-enc").textContent = `文字コード: ${summary.detected_encoding.toUpperCase()}`;
  el("csv-kpi-flagged").textContent = `${summary.flagged_employees}名`;
  el("csv-kpi-severity").textContent = `重大 ${summary.critical_findings_count} · 高 ${summary.high_findings_count} · 中 ${summary.medium_findings_count}`;
  el("csv-kpi-relief").textContent = fmtYen(summary.total_r8_vs_r7_tax_relief_yen);

  el("csv-headline-finding").textContent = `${summary.total_employees}名中 ${summary.flagged_employees}名に申告・区分差異を検出（従業員への還付漏れ合計 ${fmtYen(summary.total_tax_overpayment_yen)}、徴収不足 ${fmtYen(summary.total_tax_underpayment_yen)}）。`;
  renderCsvTable();
}

function handleCsvBytes(uint8Bytes) {
  try {
    const { text, encoding } = decodePayrollBytes(uint8Bytes);
    const summary = auditPayrollCsvText(text, encoding);
    applyCsvSummary(summary);
  } catch (err) {
    const errEl = el("csv-error-banner");
    errEl.textContent = `CSV読込エラー: ${err.message || String(err)}`;
    errEl.hidden = false;
  }
}

function downloadBlobText(filename, textContent) {
  const blob = new Blob([textContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

el("btn-load-sample").addEventListener("click", () => {
  applyCsvSummary(auditPayrollCsvText(buildSampleAuditCsv(), "sample-utf8"));
});

el("btn-download-template").addEventListener("click", () => {
  downloadBlobText("nenmatsu_2026_sample_template.csv", "\uFEFF" + buildSampleAuditCsv());
});

el("btn-export-audit").addEventListener("click", () => {
  if (!currentSummary) return;
  const reportCsv = formatAuditReportCsv(currentSummary);
  downloadBlobText("nenmatsu_2026_audit_report.csv", reportCsv);
});

el("file-csv-input").addEventListener("change", async (ev) => {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  handleCsvBytes(new Uint8Array(buf));
});

const dropzone = el("csv-dropzone");
dropzone.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  dropzone.classList.add("is-dragover");
});
dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("is-dragover");
});
dropzone.addEventListener("drop", async (ev) => {
  ev.preventDefault();
  dropzone.classList.remove("is-dragover");
  const file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
  if (!file) return;
  const buf = await file.arrayBuffer();
  handleCsvBytes(new Uint8Array(buf));
});

document.querySelectorAll("[data-csv-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentFilter = btn.getAttribute("data-csv-filter") || "all";
    document.querySelectorAll("[data-csv-filter]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b === btn));
    });
    renderCsvTable();
  });
});

el("inp-csv-search").addEventListener("input", () => renderCsvTable());

// Initial render
updateSimulator();
applyCsvSummary(auditPayrollCsvText(buildSampleAuditCsv(), "sample-utf8"));

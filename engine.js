/**
 * NENMATSUGATE Browser-Local Statutory Engine (ES Module, Zero Dependencies, Zero Network).
 *
 * Exact integer yen parity with Python `tracks/track25_nenmatsu_2026/calculator.py` & `csv_auditor.py`.
 * Verified against National Tax Agency (`nta.go.jp`) Tax Answers No.1410, No.1411, No.1199,
 * No.1180, No.1177, No.1191, No.1195, No.2260, and Reiwa 8 (2026) Withholding Tax Reform Q&A.
 */

export const STATUTORY_EFFECTIVE_DATE_R8 = "2026-12-01";

export const TOKUTEI_SHINZOKU_STEPS = [
  [850000, 630000, "STEP1_LE_850K_630K"],
  [900000, 610000, "STEP2_LE_900K_610K"],
  [950000, 510000, "STEP3_LE_950K_510K"],
  [1000000, 410000, "STEP4_LE_1000K_410K"],
  [1050000, 310000, "STEP5_LE_1050K_310K"],
  [1100000, 210000, "STEP6_LE_1100K_210K"],
  [1150000, 110000, "STEP7_LE_1150K_110K"],
  [1200000, 60000, "STEP8_LE_1200K_60K"],
  [1230000, 30000, "STEP9_LE_1230K_30K"],
];

export const SPOUSE_SPECIAL_STEPS = [
  [950000, 380000, 260000, 130000],
  [1000000, 360000, 240000, 120000],
  [1050000, 310000, 210000, 110000],
  [1100000, 260000, 180000, 90000],
  [1150000, 210000, 140000, 70000],
  [1200000, 160000, 110000, 60000],
  [1250000, 110000, 80000, 40000],
  [1300000, 60000, 40000, 20000],
  [1330000, 30000, 20000, 10000],
];

export const INCOME_TAX_BRACKETS = [
  [1949000, 50, 0],
  [3299000, 100, 97500],
  [6949000, 200, 427500],
  [8999000, 230, 636000],
  [17999000, 330, 1536000],
  [39999000, 400, 2796000],
  [null, 450, 4796000],
];

function intDiv(a, b) {
  return Math.floor(a / b);
}

function assertNonNegativeInt(val, name) {
  if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
    throw new Error(`${name} must be a non-negative integer, got ${val}`);
  }
  return val;
}

export function estimateSocialInsuranceYen(salaryYen) {
  const s = assertNonNegativeInt(salaryYen, "salaryYen");
  if (s < 1060000) return 0;
  return intDiv(s * 144, 1000);
}

export function computeEmploymentIncome(salaryYen, taxYear = 2026) {
  const x = assertNonNegativeInt(salaryYen, "salaryYen");
  if (taxYear !== 2026 && taxYear !== 2025) {
    throw new Error(`Unsupported taxYear: ${taxYear}`);
  }

  if (taxYear === 2026) {
    if (x <= 740999) return 0;
    if (x < 2191000) return x - 740000;
    if (x < 2193000) return 1451000;
    if (x < 2196000) return 1453000;
    if (x < 2200000) return 1456000;
    if (x < 3600000) {
      const b = intDiv(x, 4000) * 4000;
      return intDiv(b * 7, 10) - 80000;
    }
    if (x < 6600000) {
      const b = intDiv(x, 4000) * 4000;
      return intDiv(b * 8, 10) - 440000;
    }
    if (x < 8500000) {
      return intDiv(x * 9, 10) - 1100000;
    }
    return x - 1950000;
  }

  // taxYear === 2025 (令和7年分)
  if (x <= 650999) return 0;
  if (x < 1900000) return x - 650000;
  if (x < 3600000) {
    const b = intDiv(x, 4000) * 4000;
    return intDiv(b * 7, 10) - 80000;
  }
  if (x < 6600000) {
    const b = intDiv(x, 4000) * 4000;
    return intDiv(b * 8, 10) - 440000;
  }
  if (x < 8500000) {
    return intDiv(x * 9, 10) - 1100000;
  }
  return x - 1950000;
}

export function computeIncomeAdjustmentDeduction(salaryYen, isEligible) {
  const x = assertNonNegativeInt(salaryYen, "salaryYen");
  if (!isEligible || x <= 8500000) return 0;
  const capped = Math.min(x, 10000000);
  return intDiv(capped - 8500000 + 9, 10);
}

export function computeBasicDeduction(totalIncomeYen, taxYear = 2026, isResident = true) {
  const inc = assertNonNegativeInt(totalIncomeYen, "totalIncomeYen");
  if (!isResident) {
    if (inc <= 23500000) {
      const amt = taxYear === 2026 ? 620000 : 580000;
      return { amount: amt, tier: `NONRES_LE_23500K_${intDiv(amt, 10000)}0K` };
    }
    if (inc <= 24000000) return { amount: 480000, tier: "NONRES_LE_24000K_480K" };
    if (inc <= 24500000) return { amount: 320000, tier: "NONRES_LE_24500K_320K" };
    if (inc <= 25000000) return { amount: 160000, tier: "NONRES_LE_25000K_160K" };
    return { amount: 0, tier: "NONRES_GT_25000K_0" };
  }

  if (taxYear === 2026) {
    if (inc <= 1320000) return { amount: 1040000, tier: "R8_LE_1320K_1040K" };
    if (inc <= 3360000) return { amount: 1040000, tier: "R8_LE_3360K_1040K" };
    if (inc <= 4890000) return { amount: 1040000, tier: "R8_LE_4890K_1040K" };
    if (inc <= 6550000) return { amount: 670000, tier: "R8_LE_6550K_670K" };
    if (inc <= 23500000) return { amount: 620000, tier: "R8_LE_23500K_620K" };
    if (inc <= 24000000) return { amount: 480000, tier: "R8_LE_24000K_480K" };
    if (inc <= 24500000) return { amount: 320000, tier: "R8_LE_24500K_320K" };
    if (inc <= 25000000) return { amount: 160000, tier: "R8_LE_25000K_160K" };
    return { amount: 0, tier: "R8_GT_25000K_0" };
  }

  if (inc <= 1320000) return { amount: 950000, tier: "R7_LE_1320K_950K" };
  if (inc <= 3360000) return { amount: 880000, tier: "R7_LE_3360K_880K" };
  if (inc <= 4890000) return { amount: 680000, tier: "R7_LE_4890K_680K" };
  if (inc <= 6550000) return { amount: 630000, tier: "R7_LE_6550K_630K" };
  if (inc <= 23500000) return { amount: 580000, tier: "R7_LE_23500K_580K" };
  if (inc <= 24000000) return { amount: 480000, tier: "R7_LE_24000K_480K" };
  if (inc <= 24500000) return { amount: 320000, tier: "R7_LE_24500K_320K" };
  if (inc <= 25000000) return { amount: 160000, tier: "R7_LE_25000K_160K" };
  return { amount: 0, tier: "R7_GT_25000K_0" };
}

export function fuyoIncomeLimit(taxYear = 2026) {
  return taxYear === 2026 ? 620000 : 580000;
}

export function evaluateSpouseDeduction({
  hasSpouse = false,
  taxpayerTotalIncomeYen = 0,
  spouseSalaryYen = 0,
  spouseOtherIncomeYen = 0,
  spouseAge = 40,
  taxYear = 2026,
}) {
  if (!hasSpouse) {
    return {
      has_spouse: false,
      spouse_age: spouseAge,
      spouse_salary_yen: 0,
      spouse_other_income_yen: 0,
      spouse_employment_income_yen: 0,
      spouse_total_income_yen: 0,
      category: "none",
      deduction_yen: 0,
      is_doitsu_seikei_spouse: false,
      taxpayer_income_band: "none",
    };
  }

  const spEmp = computeEmploymentIncome(spouseSalaryYen, taxYear);
  const spTotal = spEmp + spouseOtherIncomeYen;
  const baseLimit = fuyoIncomeLimit(taxYear);
  const isDoitsu = spTotal <= baseLimit;

  let band = "GT_10M";
  let bandIdx = -1;
  if (taxpayerTotalIncomeYen <= 9000000) {
    band = "LE_9M";
    bandIdx = 0;
  } else if (taxpayerTotalIncomeYen <= 9500000) {
    band = "GT_9M_LE_9_5M";
    bandIdx = 1;
  } else if (taxpayerTotalIncomeYen <= 10000000) {
    band = "GT_9_5M_LE_10M";
    bandIdx = 2;
  } else {
    return {
      has_spouse: true,
      spouse_age: spouseAge,
      spouse_salary_yen: spouseSalaryYen,
      spouse_other_income_yen: spouseOtherIncomeYen,
      spouse_employment_income_yen: spEmp,
      spouse_total_income_yen: spTotal,
      category: "ineligible_taxpayer_over_10m",
      deduction_yen: 0,
      is_doitsu_seikei_spouse: isDoitsu,
      taxpayer_income_band: "GT_10M",
    };
  }

  if (spTotal <= baseLimit) {
    const isElderly = spouseAge >= 70;
    const ded = isElderly ? [480000, 320000, 160000][bandIdx] : [380000, 260000, 130000][bandIdx];
    return {
      has_spouse: true,
      spouse_age: spouseAge,
      spouse_salary_yen: spouseSalaryYen,
      spouse_other_income_yen: spouseOtherIncomeYen,
      spouse_employment_income_yen: spEmp,
      spouse_total_income_yen: spTotal,
      category: isElderly ? "haigusha_kojo_elderly" : "haigusha_kojo",
      deduction_yen: ded,
      is_doitsu_seikei_spouse: true,
      taxpayer_income_band: band,
    };
  }

  for (const [maxInc, t1, t2, t3] of SPOUSE_SPECIAL_STEPS) {
    if (spTotal <= maxInc) {
      const ded = [t1, t2, t3][bandIdx];
      return {
        has_spouse: true,
        spouse_age: spouseAge,
        spouse_salary_yen: spouseSalaryYen,
        spouse_other_income_yen: spouseOtherIncomeYen,
        spouse_employment_income_yen: spEmp,
        spouse_total_income_yen: spTotal,
        category: "haigusha_tokubetsu_kojo",
        deduction_yen: ded,
        is_doitsu_seikei_spouse: false,
        taxpayer_income_band: band,
      };
    }
  }

  return {
    has_spouse: true,
    spouse_age: spouseAge,
    spouse_salary_yen: spouseSalaryYen,
    spouse_other_income_yen: spouseOtherIncomeYen,
    spouse_employment_income_yen: spEmp,
    spouse_total_income_yen: spTotal,
    category: "ineligible_spouse_over_1330k",
    deduction_yen: 0,
    is_doitsu_seikei_spouse: false,
    taxpayer_income_band: band,
  };
}

export function evaluateDependent(dep, taxYear = 2026) {
  const name = dep.name ?? "親族";
  const age = dep.age ?? 20;
  const salaryYen = dep.salary_yen ?? 0;
  const otherIncomeYen = dep.other_income_yen ?? 0;
  const isCohabiting = Boolean(dep.is_cohabiting_ascendant);

  const empInc = computeEmploymentIncome(salaryYen, taxYear);
  const totalInc = empInc + otherIncomeYen;
  const baseLimit = fuyoIncomeLimit(taxYear);
  const minDedBase = taxYear === 2026 ? 740000 : 650000;

  if (age < 16) {
    const isFuyo = totalInc <= baseLimit;
    const cliffSal = isFuyo ? Math.max(0, baseLimit + minDedBase - otherIncomeYen) : null;
    const margin = cliffSal !== null && salaryYen <= cliffSal ? cliffSal - salaryYen : null;
    return {
      name,
      age,
      salary_yen: salaryYen,
      other_income_yen: otherIncomeYen,
      employment_income_yen: empInc,
      total_income_yen: totalInc,
      category: isFuyo ? "nensho_fuyo" : "ineligible_income_exceeded",
      form_type: isFuyo ? "扶養控除等申告書（住民税・所得金額調整用）" : "対象外",
      deduction_yen: 0,
      step_code: isFuyo ? "NENSHO_0" : "INELIGIBLE_0",
      is_fuyo_shinzoku: isFuyo,
      is_under23_fuyo: isFuyo,
      next_cliff_salary_yen: cliffSal,
      margin_to_next_cliff_yen: margin,
    };
  }

  if (age >= 19 && age < 23) {
    if (totalInc <= baseLimit) {
      const cliffSal = Math.max(0, baseLimit + minDedBase - otherIncomeYen);
      const margin = salaryYen <= cliffSal ? cliffSal - salaryYen : null;
      return {
        name,
        age,
        salary_yen: salaryYen,
        other_income_yen: otherIncomeYen,
        employment_income_yen: empInc,
        total_income_yen: totalInc,
        category: "tokutei_fuyo",
        form_type: "扶養控除等申告書",
        deduction_yen: 630000,
        step_code: "FUYO_TOKUTEI_630K",
        is_fuyo_shinzoku: true,
        is_under23_fuyo: true,
        next_cliff_salary_yen: cliffSal,
        margin_to_next_cliff_yen: margin,
      };
    }

    for (const [upperInc, dedYen, stepCode] of TOKUTEI_SHINZOKU_STEPS) {
      if (totalInc <= upperInc) {
        const cliffSal = Math.max(0, upperInc + minDedBase - otherIncomeYen);
        const margin = salaryYen <= cliffSal ? cliffSal - salaryYen : null;
        return {
          name,
          age,
          salary_yen: salaryYen,
          other_income_yen: otherIncomeYen,
          employment_income_yen: empInc,
          total_income_yen: totalInc,
          category: "tokutei_shinzoku_tokubetsu",
          form_type: "特定親族特別控除申告書",
          deduction_yen: dedYen,
          step_code: stepCode,
          is_fuyo_shinzoku: false,
          is_under23_fuyo: false,
          next_cliff_salary_yen: cliffSal,
          margin_to_next_cliff_yen: margin,
        };
      }
    }

    return {
      name,
      age,
      salary_yen: salaryYen,
      other_income_yen: otherIncomeYen,
      employment_income_yen: empInc,
      total_income_yen: totalInc,
      category: "ineligible_over_1230k",
      form_type: "対象外",
      deduction_yen: 0,
      step_code: "OVER_1230K_0",
      is_fuyo_shinzoku: false,
      is_under23_fuyo: false,
      next_cliff_salary_yen: null,
      margin_to_next_cliff_yen: null,
    };
  }

  if (totalInc <= baseLimit) {
    const cliffSal = Math.max(0, baseLimit + minDedBase - otherIncomeYen);
    const margin = salaryYen <= cliffSal ? cliffSal - salaryYen : null;
    const isElderly = age >= 70;
    const ded = isElderly ? (isCohabiting ? 580000 : 480000) : 380000;
    const cat = isElderly ? (isCohabiting ? "rojin_fuyo_dokyo" : "rojin_fuyo") : "ippan_fuyo";
    const code = isElderly ? (isCohabiting ? "FUYO_ROJIN_DOKYO_580K" : "FUYO_ROJIN_480K") : "FUYO_IPPAN_380K";
    return {
      name,
      age,
      salary_yen: salaryYen,
      other_income_yen: otherIncomeYen,
      employment_income_yen: empInc,
      total_income_yen: totalInc,
      category: cat,
      form_type: "扶養控除等申告書",
      deduction_yen: ded,
      step_code: code,
      is_fuyo_shinzoku: true,
      is_under23_fuyo: age < 23,
      next_cliff_salary_yen: cliffSal,
      margin_to_next_cliff_yen: margin,
    };
  }

  return {
    name,
    age,
    salary_yen: salaryYen,
    other_income_yen: otherIncomeYen,
    employment_income_yen: empInc,
    total_income_yen: totalInc,
    category: "ineligible_income_exceeded",
    form_type: "対象外",
    deduction_yen: 0,
    step_code: "OVER_LIMIT_0",
    is_fuyo_shinzoku: false,
    is_under23_fuyo: false,
    next_cliff_salary_yen: null,
    margin_to_next_cliff_yen: null,
  };
}

export function computeNationalIncomeTax(taxableIncomeRawYen, housingLoanCreditYen = 0) {
  if (taxableIncomeRawYen <= 0) {
    return {
      roundedTaxable: 0,
      marginalPct: 0,
      baseTax: 0,
      creditApplied: 0,
      netBaseTax: 0,
      annualTax: 0,
    };
  }

  const rounded = intDiv(taxableIncomeRawYen, 1000) * 1000;
  if (rounded < 1000) {
    return {
      roundedTaxable: 0,
      marginalPct: 0,
      baseTax: 0,
      creditApplied: 0,
      netBaseTax: 0,
      annualTax: 0,
    };
  }

  let baseTax = 0;
  let marginalPct = 5;
  for (const [upper, permille, quickDed] of INCOME_TAX_BRACKETS) {
    if (upper === null || rounded <= upper) {
      baseTax = intDiv(rounded * permille, 1000) - quickDed;
      marginalPct = intDiv(permille, 10);
      break;
    }
  }

  const creditApplied = Math.min(baseTax, housingLoanCreditYen);
  const netBaseTax = baseTax - creditApplied;
  const annualTax = intDiv(netBaseTax * 1021, 100000) * 100;
  return {
    roundedTaxable: rounded,
    marginalPct,
    baseTax,
    creditApplied,
    netBaseTax,
    annualTax,
  };
}

export function calculateHouseholdYearTax(inp, taxYear = 2026) {
  const salaryYen = assertNonNegativeInt(inp.salary_yen ?? 0, "salary_yen");
  const otherIncomeYen = assertNonNegativeInt(inp.other_income_yen ?? 0, "other_income_yen");
  const dependents = Array.isArray(inp.dependents) ? inp.dependents : [];
  const depResults = dependents.map((d) => evaluateDependent(d, taxYear));

  const hasUnder23Fuyo = depResults.some((r) => r.is_under23_fuyo);
  const hasFuyoSpecDis = dependents.some((d, i) => Boolean(d.is_special_disability) && depResults[i].is_fuyo_shinzoku);

  const empBeforeAdj = computeEmploymentIncome(salaryYen, taxYear);
  const empDeduction = salaryYen - empBeforeAdj;

  const hasSpouse = Boolean(inp.has_spouse);
  const spSal = inp.spouse_salary_yen ?? 0;
  const spOth = inp.spouse_other_income_yen ?? 0;
  const spEmpPre = hasSpouse ? computeEmploymentIncome(spSal, taxYear) : 0;
  const spDoitsuPre = hasSpouse && spEmpPre + spOth <= fuyoIncomeLimit(taxYear);

  const adjEligible =
    Boolean(inp.is_self_special_disability) ||
    hasUnder23Fuyo ||
    hasFuyoSpecDis ||
    (spDoitsuPre && Boolean(inp.spouse_is_special_disability));

  const incAdjDed = computeIncomeAdjustmentDeduction(salaryYen, adjEligible);
  const empIncome = Math.max(0, empBeforeAdj - incAdjDed);
  const totalIncome = empIncome + otherIncomeYen;

  const isResident = inp.is_resident !== undefined ? Boolean(inp.is_resident) : true;
  const { amount: basicDed, tier: basicTier } = computeBasicDeduction(totalIncome, taxYear, isResident);

  const spouseRes = evaluateSpouseDeduction({
    hasSpouse,
    taxpayerTotalIncomeYen: totalIncome,
    spouseSalaryYen: spSal,
    spouseOtherIncomeYen: spOth,
    spouseAge: inp.spouse_age ?? 40,
    taxYear,
  });

  const fuyoTotal = depResults.reduce((acc, r) => acc + (r.is_fuyo_shinzoku ? r.deduction_yen : 0), 0);
  const tokuteiShinzokuTotal = depResults.reduce(
    (acc, r) => acc + (r.category === "tokutei_shinzoku_tokubetsu" ? r.deduction_yen : 0),
    0
  );

  let hitoriOrKafu = 0;
  if (Boolean(inp.is_hitori_oya) && totalIncome <= 5000000) {
    hitoriOrKafu = 350000;
  } else if (Boolean(inp.is_kafu) && totalIncome <= 5000000) {
    hitoriOrKafu = 270000;
  }

  const kinroLimit = taxYear === 2026 ? 890000 : 850000;
  const kinroDed = Boolean(inp.is_kinro_gakusei) && totalIncome <= kinroLimit ? 270000 : 0;

  let disabilityDed = 0;
  if (Boolean(inp.is_self_special_disability)) disabilityDed += 400000;
  if (spouseRes.is_doitsu_seikei_spouse && Boolean(inp.spouse_is_special_disability)) disabilityDed += 400000;
  dependents.forEach((d, i) => {
    if (Boolean(d.is_special_disability) && depResults[i].is_fuyo_shinzoku) disabilityDed += 400000;
  });

  const socEst = inp.social_insurance_yen === null || inp.social_insurance_yen === undefined;
  const socIns = socEst ? estimateSocialInsuranceYen(salaryYen) : assertNonNegativeInt(inp.social_insurance_yen, "social_insurance_yen");

  const lifeGeneralCap = taxYear === 2026 && hasUnder23Fuyo ? 60000 : 40000;
  const lifeDed = Math.min(inp.life_insurance_deduction_yen ?? 0, 120000);
  const eqDed = Math.min(inp.earthquake_insurance_deduction_yen ?? 0, 50000);
  const idecoDed = inp.ideco_small_enterprise_yen ?? 0;
  const otherStatDed = lifeDed + eqDed + idecoDed;

  const totalDeductions =
    socIns +
    basicDed +
    spouseRes.deduction_yen +
    fuyoTotal +
    tokuteiShinzokuTotal +
    hitoriOrKafu +
    kinroDed +
    disabilityDed +
    otherStatDed;

  const taxableRaw = Math.max(0, totalIncome - totalDeductions);
  const taxCalc = computeNationalIncomeTax(taxableRaw, inp.housing_loan_credit_yen ?? 0);
  const withheld = inp.withheld_tax_yen ?? 0;
  const refundOrDue = withheld - taxCalc.annualTax;
  const netTakeHome = salaryYen - socIns - taxCalc.annualTax;

  return {
    tax_year: taxYear,
    salary_yen: salaryYen,
    employment_income_before_adj_yen: empBeforeAdj,
    employment_deduction_yen: empDeduction,
    income_adjustment_deduction_yen: incAdjDed,
    employment_income_yen: empIncome,
    other_income_yen: otherIncomeYen,
    total_income_yen: totalIncome,
    social_insurance_yen: socIns,
    social_insurance_estimated: socEst,
    basic_deduction_yen: basicDed,
    basic_deduction_tier: basicTier,
    spouse_result: spouseRes,
    dependent_results: depResults,
    fuyo_deduction_total_yen: fuyoTotal,
    tokutei_shinzoku_deduction_total_yen: tokuteiShinzokuTotal,
    hitori_oya_or_kafu_deduction_yen: hitoriOrKafu,
    kinro_gakusei_deduction_yen: kinroDed,
    disability_deduction_yen: disabilityDed,
    other_statutory_deductions_yen: otherStatDed,
    total_income_deductions_yen: totalDeductions,
    taxable_income_raw_yen: taxableRaw,
    taxable_income_rounded_yen: taxCalc.roundedTaxable,
    marginal_rate_percent: taxCalc.marginalPct,
    base_income_tax_yen: taxCalc.baseTax,
    housing_loan_credit_applied_yen: taxCalc.creditApplied,
    net_base_tax_yen: taxCalc.netBaseTax,
    annual_tax_yen: taxCalc.annualTax,
    withheld_tax_yen: withheld,
    year_end_refund_or_due_yen: refundOrDue,
    estimated_net_take_home_yen: netTakeHome,
    life_insurance_general_cap_yen: lifeGeneralCap,
  };
}

export function compareR8VsR7(inp) {
  const r8 = calculateHouseholdYearTax(inp, 2026);
  const r7 = calculateHouseholdYearTax(inp, 2025);
  return {
    r8_2026: r8,
    r7_2025: r7,
    delta: {
      employment_deduction_diff_yen: r8.employment_deduction_yen - r7.employment_deduction_yen,
      basic_deduction_diff_yen: r8.basic_deduction_yen - r7.basic_deduction_yen,
      spouse_deduction_diff_yen: r8.spouse_result.deduction_yen - r7.spouse_result.deduction_yen,
      fuyo_deduction_diff_yen: r8.fuyo_deduction_total_yen - r7.fuyo_deduction_total_yen,
      tokutei_shinzoku_diff_yen: r8.tokutei_shinzoku_deduction_total_yen - r7.tokutei_shinzoku_deduction_total_yen,
      total_deductions_diff_yen: r8.total_income_deductions_yen - r7.total_income_deductions_yen,
      annual_tax_savings_yen: r7.annual_tax_yen - r8.annual_tax_yen,
      take_home_gain_yen: r8.estimated_net_take_home_yen - r7.estimated_net_take_home_yen,
    },
  };
}

export function simulateWallCheckpoints(
  baseInp,
  target = "child",
  checkpointsYen = [1030000, 1230000, 1360000, 1500000, 1590000, 1690000, 1780000, 1880000, 1970000, 2070000]
) {
  const deps = Array.isArray(baseInp.dependents) ? baseInp.dependents : [];
  const baselineNoTargetInp =
    target === "child"
      ? { ...baseInp, dependents: deps.slice(1) }
      : { ...baseInp, has_spouse: false, spouse_salary_yen: 0 };
  const baselineR8 = calculateHouseholdYearTax(baselineNoTargetInp, 2026);

  return checkpointsYen.map((sal) => {
    if (target === "self") {
      const stepInp = { ...baseInp, salary_yen: sal, social_insurance_yen: null, withheld_tax_yen: 0 };
      const r8 = calculateHouseholdYearTax(stepInp, 2026);
      const r7 = calculateHouseholdYearTax(stepInp, 2025);
      return {
        checkpoint_salary_yen: sal,
        target_total_income_r8_yen: r8.total_income_yen,
        deduction_category_r8: r8.basic_deduction_tier,
        deduction_r8_yen: r8.basic_deduction_yen,
        deduction_r7_yen: r7.basic_deduction_yen,
        household_annual_tax_r8_yen: r8.annual_tax_yen,
        household_annual_tax_r7_yen: r7.annual_tax_yen,
        tax_savings_vs_r7_yen: r7.annual_tax_yen - r8.annual_tax_yen,
        own_income_tax_r8_yen: r8.annual_tax_yen,
        estimated_take_home_r8_yen: r8.estimated_net_take_home_yen,
      };
    }

    if (target === "spouse") {
      const stepInp = { ...baseInp, has_spouse: true, spouse_salary_yen: sal };
      const r8 = calculateHouseholdYearTax(stepInp, 2026);
      const r7 = calculateHouseholdYearTax(stepInp, 2025);
      const ownR8 = calculateHouseholdYearTax({ salary_yen: sal }, 2026);
      return {
        checkpoint_salary_yen: sal,
        target_total_income_r8_yen: r8.spouse_result.spouse_total_income_yen,
        deduction_category_r8: r8.spouse_result.category,
        deduction_r8_yen: r8.spouse_result.deduction_yen,
        deduction_r7_yen: r7.spouse_result.deduction_yen,
        household_annual_tax_r8_yen: r8.annual_tax_yen,
        household_annual_tax_r7_yen: r7.annual_tax_yen,
        taxpayer_tax_reduction_r8_yen: baselineR8.annual_tax_yen - r8.annual_tax_yen,
        tax_savings_vs_r7_yen: r7.annual_tax_yen - r8.annual_tax_yen,
        own_income_tax_r8_yen: ownR8.annual_tax_yen,
        estimated_take_home_r8_yen: ownR8.estimated_net_take_home_yen,
      };
    }

    const baseChild = deps[0] ?? { name: "大学生の子", age: 20, other_income_yen: 0 };
    const childAge = baseChild.age >= 19 && baseChild.age < 23 ? baseChild.age : 20;
    const updatedChild = { ...baseChild, age: childAge, salary_yen: sal };
    const stepInp = { ...baseInp, dependents: [updatedChild, ...deps.slice(1)] };
    const r8 = calculateHouseholdYearTax(stepInp, 2026);
    const r7 = calculateHouseholdYearTax(stepInp, 2025);
    const childResR8 = r8.dependent_results[0];
    const childResR7 = r7.dependent_results[0];
    const ownR8 = calculateHouseholdYearTax(
      { salary_yen: sal, social_insurance_yen: sal < 1300000 ? 0 : null },
      2026
    );
    return {
      checkpoint_salary_yen: sal,
      target_total_income_r8_yen: childResR8.total_income_yen,
      deduction_category_r8: childResR8.category,
      form_type_r8: childResR8.form_type,
      step_code_r8: childResR8.step_code,
      deduction_r8_yen: childResR8.deduction_yen,
      deduction_r7_yen: childResR7.deduction_yen,
      household_annual_tax_r8_yen: r8.annual_tax_yen,
      household_annual_tax_r7_yen: r7.annual_tax_yen,
      taxpayer_tax_reduction_r8_yen: baselineR8.annual_tax_yen - r8.annual_tax_yen,
      tax_savings_vs_r7_yen: r7.annual_tax_yen - r8.annual_tax_yen,
      own_income_tax_r8_yen: ownR8.annual_tax_yen,
      estimated_take_home_r8_yen: ownR8.estimated_net_take_home_yen,
      combined_family_net_r8_yen: r8.estimated_net_take_home_yen + ownR8.estimated_net_take_home_yen,
    };
  });
}

// ============================================================================
// RFC 4180 CSV Parser + HR Batch Auditor (exact parity with Python csv_auditor)
// ============================================================================

const CSV_HEADER_ALIASES = {
  employee_id: ["employee_id", "emp_id", "社員番号", "従業員番号", "職員番号"],
  employee_name: ["employee_name", "name", "氏名", "従業員氏名"],
  department: ["department", "dept", "部署", "所属"],
  salary_yen: ["salary_yen", "annual_salary", "給与収入", "支払金額", "年収"],
  other_income_yen: ["other_income_yen", "給与以外の所得", "その他所得"],
  social_insurance_yen: ["social_insurance_yen", "社会保険料控除", "社会保険料"],
  life_insurance_deduction_yen: ["life_insurance_deduction_yen", "生命保険料控除"],
  earthquake_insurance_deduction_yen: ["earthquake_insurance_deduction_yen", "地震保険料控除"],
  ideco_small_enterprise_yen: ["ideco_small_enterprise_yen", "ideco_yen", "小規模企業共済等掛金控除"],
  housing_loan_credit_yen: ["housing_loan_credit_yen", "住宅ローン控除", "住宅借入金等特別控除"],
  withheld_tax_yen: ["withheld_tax_yen", "源泉徴収税額", "既徴収税額"],
  last_pay_date: ["last_pay_date", "最終支給日", "最終給与支払日"],
  is_resident: ["is_resident", "居住者区分", "居住者"],
  is_hitori_oya: ["is_hitori_oya", "ひとり親", "ひとり親該当"],
  is_kafu: ["is_kafu", "寡婦", "寡婦該当"],
  has_spouse: ["has_spouse", "配偶者有無", "配偶者あり"],
  spouse_age: ["spouse_age", "配偶者年齢"],
  spouse_salary_yen: ["spouse_salary_yen", "配偶者給与収入", "配偶者年収"],
  spouse_other_income_yen: ["spouse_other_income_yen", "配偶者その他所得"],
  dep1_name: ["dep1_name", "子1氏名", "親族1氏名"],
  dep1_age: ["dep1_age", "子1年齢", "親族1年齢"],
  dep1_salary_yen: ["dep1_salary_yen", "子1給与収入", "親族1給与収入"],
  dep1_cohabiting: ["dep1_cohabiting", "親族1同居老親"],
  dep2_name: ["dep2_name", "子2氏名", "親族2氏名"],
  dep2_age: ["dep2_age", "子2年齢", "親族2年齢"],
  dep2_salary_yen: ["dep2_salary_yen", "子2給与収入", "親族2給与収入"],
  dep2_cohabiting: ["dep2_cohabiting", "親族2同居老親"],
  dep3_name: ["dep3_name", "親族3氏名"],
  dep3_age: ["dep3_age", "親族3年齢"],
  dep3_salary_yen: ["dep3_salary_yen", "親族3給与収入"],
  dep3_cohabiting: ["dep3_cohabiting", "親族3同居老親"],
  declared_basic_deduction_yen: ["declared_basic_deduction_yen", "申告_基礎控除", "基礎控除申告額"],
  declared_spouse_deduction_yen: ["declared_spouse_deduction_yen", "申告_配偶者控除等", "配偶者控除等申告額"],
  declared_fuyo_deduction_yen: ["declared_fuyo_deduction_yen", "申告_扶養控除", "扶養控除申告額"],
  declared_tokutei_shinzoku_deduction_yen: [
    "declared_tokutei_shinzoku_deduction_yen",
    "申告_特定親族特別控除",
    "特定親族特別控除申告額",
  ],
  declared_income_adjustment_yen: [
    "declared_income_adjustment_yen",
    "申告_所得金額調整控除",
    "所得金額調整控除申告額",
  ],
  declared_hitori_oya_deduction_yen: [
    "declared_hitori_oya_deduction_yen",
    "申告_ひとり親寡婦控除",
    "ひとり親控除申告額",
  ],
};

export function parseCsvMatrix(csvText) {
  const text = String(csvText ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function decodePayrollBytes(uint8Bytes) {
  if (!uint8Bytes || uint8Bytes.length === 0) {
    throw new Error("CSVファイルが空です。");
  }
  if (uint8Bytes.length >= 3 && uint8Bytes[0] === 0xef && uint8Bytes[1] === 0xbb && uint8Bytes[2] === 0xbf) {
    const dec = new TextDecoder("utf-8", { fatal: true });
    return { text: dec.decode(uint8Bytes.subarray(3)), encoding: "utf-8-sig" };
  }
  try {
    const decUtf8 = new TextDecoder("utf-8", { fatal: true });
    return { text: decUtf8.decode(uint8Bytes), encoding: "utf-8" };
  } catch {
    const decSjis = new TextDecoder("shift-jis", { fatal: true });
    return { text: decSjis.decode(uint8Bytes), encoding: "cp932" };
  }
}

function cleanStr(val) {
  return val === null || val === undefined ? "" : String(val).trim();
}

function parseOptionalInt(val, label) {
  const s = cleanStr(val);
  if (s === "" || s === "-" || s === "—") return null;
  const norm = s.replace(/[,¥￥円\s]/g, "");
  if (!/^\d+$/.test(norm)) {
    throw new Error(`数値形式エラー (${label}): ${s}`);
  }
  return Number.parseInt(norm, 10);
}

function parseBool(val, fallback = false) {
  if (typeof val === "boolean") return val;
  const s = cleanStr(val).toLowerCase();
  if (s === "") return fallback;
  if (["1", "true", "yes", "y", "有", "あり", "対象", "該当", "○", "o"].includes(s)) return true;
  if (["0", "false", "no", "n", "無", "なし", "対象外", "非該当", "×", "x", "-"].includes(s)) return false;
  throw new Error(`真偽値フラグ形式エラー: ${val}`);
}

function canonicalizeRow(rawRow) {
  const lookup = {};
  for (const [k, v] of Object.entries(rawRow)) {
    lookup[String(k).trim().replace(/^\uFEFF/, "")] = v;
  }
  const canon = {};
  for (const [targetKey, aliases] of Object.entries(CSV_HEADER_ALIASES)) {
    for (const alias of aliases) {
      if (Object.prototype.hasOwnProperty.call(lookup, alias)) {
        canon[targetKey] = lookup[alias];
        break;
      }
    }
  }
  return canon;
}

function fmtYenComma(n) {
  return Number(n).toLocaleString("ja-JP");
}

export function auditEmployeeObject(rawRow, rowNumber = 1) {
  const row = canonicalizeRow(rawRow);
  const empId = cleanStr(row.employee_id) || `EMP-${String(rowNumber).padStart(4, "0")}`;
  const empName = cleanStr(row.employee_name) || `従業員${rowNumber}`;
  const dept = cleanStr(row.department) || "未設定";

  const salOpt = parseOptionalInt(row.salary_yen, `${empId}.salary_yen`);
  if (salOpt === null) {
    throw new Error(`行 ${rowNumber} (${empId}): 給与収入 (salary_yen) が未入力です。`);
  }
  const salaryYen = salOpt;
  const otherInc = parseOptionalInt(row.other_income_yen, `${empId}.other_income`) ?? 0;
  const socIns = parseOptionalInt(row.social_insurance_yen, `${empId}.social_insurance`);
  const lifeIns = parseOptionalInt(row.life_insurance_deduction_yen, `${empId}.life_ins`) ?? 0;
  const eqIns = parseOptionalInt(row.earthquake_insurance_deduction_yen, `${empId}.eq_ins`) ?? 0;
  const ideco = parseOptionalInt(row.ideco_small_enterprise_yen, `${empId}.ideco`) ?? 0;
  const housing = parseOptionalInt(row.housing_loan_credit_yen, `${empId}.housing`) ?? 0;
  const withheld = parseOptionalInt(row.withheld_tax_yen, `${empId}.withheld`) ?? 0;

  const isResident = parseBool(row.is_resident, true);
  const isHitoriOya = parseBool(row.is_hitori_oya, false);
  const isKafu = parseBool(row.is_kafu, false);

  const spouseSal = parseOptionalInt(row.spouse_salary_yen, `${empId}.spouse_salary`) ?? 0;
  const spouseOth = parseOptionalInt(row.spouse_other_income_yen, `${empId}.spouse_other`) ?? 0;
  const spouseAge = parseOptionalInt(row.spouse_age, `${empId}.spouse_age`) ?? 40;
  const hasSpouse =
    cleanStr(row.has_spouse) !== ""
      ? parseBool(row.has_spouse, false)
      : cleanStr(row.spouse_salary_yen) !== "" || cleanStr(row.spouse_age) !== "";

  const dependents = [];
  for (const idx of [1, 2, 3]) {
    const ageOpt = parseOptionalInt(row[`dep${idx}_age`], `${empId}.dep${idx}_age`);
    if (ageOpt === null) continue;
    const depSal = parseOptionalInt(row[`dep${idx}_salary_yen`], `${empId}.dep${idx}_salary`) ?? 0;
    const depName = cleanStr(row[`dep${idx}_name`]) || `親族${idx}`;
    const cohab = parseBool(row[`dep${idx}_cohabiting`], false);
    dependents.push({
      name: depName,
      age: ageOpt,
      salary_yen: depSal,
      other_income_yen: 0,
      is_cohabiting_ascendant: cohab,
    });
  }

  const hhInp = {
    salary_yen: salaryYen,
    other_income_yen: otherInc,
    social_insurance_yen: socIns,
    life_insurance_deduction_yen: lifeIns,
    earthquake_insurance_deduction_yen: eqIns,
    ideco_small_enterprise_yen: ideco,
    is_hitori_oya: isHitoriOya,
    is_kafu: isKafu,
    housing_loan_credit_yen: housing,
    withheld_tax_yen: withheld,
    is_resident: isResident,
    has_spouse: hasSpouse,
    spouse_age: spouseAge,
    spouse_salary_yen: spouseSal,
    spouse_other_income_yen: spouseOth,
    dependents,
  };

  const r8 = calculateHouseholdYearTax(hhInp, 2026);
  const r7 = calculateHouseholdYearTax(hhInp, 2025);

  const decBasic = parseOptionalInt(row.declared_basic_deduction_yen, `${empId}.declared_basic`);
  const decSpouse = parseOptionalInt(row.declared_spouse_deduction_yen, `${empId}.declared_spouse`);
  const decFuyo = parseOptionalInt(row.declared_fuyo_deduction_yen, `${empId}.declared_fuyo`);
  const decTokutei = parseOptionalInt(row.declared_tokutei_shinzoku_deduction_yen, `${empId}.declared_tokutei`);
  const decAdj = parseOptionalInt(row.declared_income_adjustment_yen, `${empId}.declared_adj`);
  const decHitori = parseOptionalInt(row.declared_hitori_oya_deduction_yen, `${empId}.declared_hitori`);
  const lastPayDate = cleanStr(row.last_pay_date);

  const findings = [];

  if (lastPayDate && lastPayDate < STATUTORY_EFFECTIVE_DATE_R8) {
    findings.push({
      code: "PRE_DEC1_ENFORCEMENT_INELIGIBLE",
      severity: "high",
      title: "令和8年11月30日以前の最終給与支給（改正後控除の年調適用不可）",
      detail: `最終給与支給日が ${lastPayDate}（施行日 2026-12-01 前）のため、年末調整では改正前の控除額（令和7年分水準）で精算し、本人が確定申告で還付を受ける必要があります。`,
      statutory_basis: "国税庁『令和8年度税制改正Q&A（令和8年5月）』Q1-3・Q7-1",
      deduction_gap_yen: r8.total_income_deductions_yen - r7.total_income_deductions_yen,
    });
  }

  if (decBasic !== null && decBasic !== r8.basic_deduction_yen) {
    const r7Hint =
      decBasic === r7.basic_deduction_yen
        ? `（令和7年分の旧控除額 ${fmtYenComma(r7.basic_deduction_yen)}円 が誤って残っています）`
        : "（令和6年以前の48万円または誤った所得区分が入力されています）";
    findings.push({
      code: "WRONG_BASIC_DEDUCTION_TIER",
      severity: "high",
      title: "基礎控除申告書の控除額誤り（令和8年分 104万/67万/62万円区分）",
      detail: `本人合計所得 ${fmtYenComma(r8.total_income_yen)}円 に対する令和8年分の法定基礎控除額は ${fmtYenComma(r8.basic_deduction_yen)}円 ですが、申告額は ${fmtYenComma(decBasic)}円 です${r7Hint}。`,
      statutory_basis: "所得税法第86条・租税特別措置法第41条の16の2（国税庁 No.1199）",
      deduction_gap_yen: r8.basic_deduction_yen - decBasic,
    });
  }

  const formReclassified123To136 =
    r8.tokutei_shinzoku_deduction_total_yen === 0 &&
    decTokutei === 630000 &&
    (decFuyo === 0 || decFuyo === null) &&
    r8.fuyo_deduction_total_yen >= 630000 &&
    dependents.some((d) => d.age >= 19 && d.age < 23 && d.salary_yen > 1230000 && d.salary_yen <= 1360000);

  if (decTokutei !== null && decTokutei !== r8.tokutei_shinzoku_deduction_total_yen) {
    if (r8.tokutei_shinzoku_deduction_total_yen > 0 && decTokutei === 0) {
      findings.push({
        code: "MISSED_TOKUTEI_SHINZOKU",
        severity: "critical",
        title: "特定親族特別控除（19〜22歳・年収136万超〜197万円以下）の申告漏れ",
        detail: `大学生年代（19〜22歳）の親族が扶養控除上限（給与136万円）を超えていますが、令和8年分『特定親族特別控除』として ${fmtYenComma(r8.tokutei_shinzoku_deduction_total_yen)}円 を控除可能です。特定親族特別控除申告書の提出漏れを確認してください。`,
        statutory_basis: "所得税法第84条の2（国税庁 No.1177・令和8年4月改正のあらまし p.2）",
        deduction_gap_yen: r8.tokutei_shinzoku_deduction_total_yen,
      });
    } else if (formReclassified123To136) {
      findings.push({
        code: "LEGACY_R7_THRESHOLD_APPLIED",
        severity: "critical",
        title: "19〜22歳親族（年収123万超〜136万円以下）の申告書区分誤り（特定扶養親族へ異動）",
        detail:
          "給与123万超〜136万円以下の19〜22歳親族は、令和8年12月1日改正により合計所得62万円以下となるため、『特定親族特別控除申告書』ではなく『扶養控除等（異動）申告書（特定扶養親族 63万円）』への記載変更が必要です。",
        statutory_basis: "国税庁『令和8年度税制改正Q&A』Q2-1・Q2-4",
        deduction_gap_yen: 0,
      });
    } else {
      findings.push({
        code: "TOKUTEI_SHINZOKU_STEP_MISMATCH",
        severity: "high",
        title: "特定親族特別控除（9段階テーブル）の段階金額不一致",
        detail: `令和8年分の給与所得控除（最低74万円）適用後の法定控除額は ${fmtYenComma(r8.tokutei_shinzoku_deduction_total_yen)}円 ですが、申告額は ${fmtYenComma(decTokutei)}円 です。`,
        statutory_basis: "所得税法第84条の2（国税庁 No.1177）",
        deduction_gap_yen: r8.tokutei_shinzoku_deduction_total_yen - decTokutei,
      });
    }
  }

  if (!formReclassified123To136 && decFuyo !== null && decFuyo !== r8.fuyo_deduction_total_yen) {
    const inTransBand = dependents.some((d) => d.age >= 16 && d.salary_yen > 1230000 && d.salary_yen <= 1360000);
    if (inTransBand && decFuyo === r7.fuyo_deduction_total_yen) {
      findings.push({
        code: "LEGACY_R7_THRESHOLD_APPLIED",
        severity: "critical",
        title: "旧令和7年基準（123万円/58万円の壁）による扶養控除の適用漏れ",
        detail: `親族の給与収入が123万超〜136万円以下のため、令和8年改正後の所得要件（合計所得62万円以下）を満たし、扶養控除 ${fmtYenComma(r8.fuyo_deduction_total_yen)}円 の対象となります（申告額 ${fmtYenComma(decFuyo)}円）。扶養控除等申告書の異動欄に『令和8年12月1日 改正』と追記して適用してください。`,
        statutory_basis: "所得税法第84条・国税庁『令和8年度税制改正Q&A』Q2-1",
        deduction_gap_yen: r8.fuyo_deduction_total_yen - decFuyo,
      });
    } else {
      findings.push({
        code: "FUYO_DEDUCTION_MISMATCH",
        severity: "high",
        title: "扶養控除額の算定不一致",
        detail: `令和8年分の法定扶養控除合計は ${fmtYenComma(r8.fuyo_deduction_total_yen)}円 ですが、申告額は ${fmtYenComma(decFuyo)}円 です。`,
        statutory_basis: "所得税法第84条（国税庁 No.1180）",
        deduction_gap_yen: r8.fuyo_deduction_total_yen - decFuyo,
      });
    }
  }

  if (decSpouse !== null && decSpouse !== r8.spouse_result.deduction_yen) {
    findings.push({
      code: "SPOUSE_DEDUCTION_MISMATCH",
      severity: "high",
      title: "配偶者控除・配偶者特別控除の算定不一致（136万/207万円基準）",
      detail: `配偶者合計所得 ${fmtYenComma(r8.spouse_result.spouse_total_income_yen)}円・本人合計所得 ${fmtYenComma(r8.total_income_yen)}円 に対する令和8年分の法定控除額は ${fmtYenComma(r8.spouse_result.deduction_yen)}円 ですが、申告額は ${fmtYenComma(decSpouse)}円 です。`,
      statutory_basis: "所得税法第83条・第83条の2（国税庁 No.1191・No.1195・Q2-3）",
      deduction_gap_yen: r8.spouse_result.deduction_yen - decSpouse,
    });
  }

  if (decAdj !== null && decAdj !== r8.income_adjustment_deduction_yen) {
    findings.push({
      code: "SHOTOKU_CHOSEI_OR_HITORI_OYA_TRAP",
      severity: "medium",
      title: "所得金額調整控除（年収850万円超・23歳未満扶養等）の算定不一致",
      detail: `法定の所得金額調整控除額は ${fmtYenComma(r8.income_adjustment_deduction_yen)}円 ですが、申告額は ${fmtYenComma(decAdj)}円 です。`,
      statutory_basis: "租税特別措置法第41条の3の11（国税庁 No.1411）",
      deduction_gap_yen: r8.income_adjustment_deduction_yen - decAdj,
    });
  }

  if (decHitori !== null && decHitori !== r8.hitori_oya_or_kafu_deduction_yen) {
    const hint =
      decHitori === 380000 && r8.hitori_oya_or_kafu_deduction_yen === 350000
        ? "（ひとり親控除38万円への引上げは令和9年分以後のため、令和8年分年末調整は35万円です）"
        : "";
    findings.push({
      code: "SHOTOKU_CHOSEI_OR_HITORI_OYA_TRAP",
      severity: "medium",
      title: "ひとり親控除・寡婦控除の金額不一致",
      detail: `令和8年分の法定控除額は ${fmtYenComma(r8.hitori_oya_or_kafu_deduction_yen)}円 ですが、申告額は ${fmtYenComma(decHitori)}円 です${hint}。`,
      statutory_basis: "国税庁『令和8年度税制改正Q&A』Q3-2",
      deduction_gap_yen: r8.hitori_oya_or_kafu_deduction_yen - decHitori,
    });
  }

  const effAdj = decAdj !== null ? decAdj : r8.income_adjustment_deduction_yen;
  const effEmpInc = Math.max(0, r8.employment_income_before_adj_yen - effAdj);
  const effTotalInc = effEmpInc + r8.other_income_yen;
  const effDeductions =
    r8.social_insurance_yen +
    (decBasic !== null ? decBasic : r8.basic_deduction_yen) +
    (decSpouse !== null ? decSpouse : r8.spouse_result.deduction_yen) +
    (decFuyo !== null ? decFuyo : r8.fuyo_deduction_total_yen) +
    (decTokutei !== null ? decTokutei : r8.tokutei_shinzoku_deduction_total_yen) +
    (decHitori !== null ? decHitori : r8.hitori_oya_or_kafu_deduction_yen) +
    r8.kinro_gakusei_deduction_yen +
    r8.disability_deduction_yen +
    r8.other_statutory_deductions_yen;

  const effTaxableRaw = Math.max(0, effTotalInc - effDeductions);
  const declaredEstTax = computeNationalIncomeTax(effTaxableRaw, housing).annualTax;

  const statutoryTargetTax =
    lastPayDate && lastPayDate < STATUTORY_EFFECTIVE_DATE_R8 ? r7.annual_tax_yen : r8.annual_tax_yen;
  const overpayment = Math.max(0, declaredEstTax - statutoryTargetTax);
  const underpayment = Math.max(0, statutoryTargetTax - declaredEstTax);

  let status = "clean";
  if (findings.some((f) => f.severity === "critical")) status = "critical";
  else if (findings.length > 0) status = "action_required";

  return {
    row_number: rowNumber,
    employee_id: empId,
    employee_name: empName,
    department: dept,
    status,
    salary_yen: salaryYen,
    total_income_r8_yen: r8.total_income_yen,
    statutory_basic_deduction_yen: r8.basic_deduction_yen,
    declared_basic_deduction_yen: decBasic,
    statutory_spouse_deduction_yen: r8.spouse_result.deduction_yen,
    declared_spouse_deduction_yen: decSpouse,
    statutory_fuyo_deduction_yen: r8.fuyo_deduction_total_yen,
    declared_fuyo_deduction_yen: decFuyo,
    statutory_tokutei_shinzoku_deduction_yen: r8.tokutei_shinzoku_deduction_total_yen,
    declared_tokutei_shinzoku_deduction_yen: decTokutei,
    statutory_income_adjustment_yen: r8.income_adjustment_deduction_yen,
    declared_income_adjustment_yen: decAdj,
    statutory_annual_tax_r8_yen: r8.annual_tax_yen,
    declared_estimated_annual_tax_yen: declaredEstTax,
    annual_tax_r7_yen: r7.annual_tax_yen,
    r8_vs_r7_tax_relief_yen: r7.annual_tax_yen - r8.annual_tax_yen,
    tax_overpayment_yen: overpayment,
    tax_underpayment_yen: underpayment,
    year_end_refund_or_due_yen: r8.year_end_refund_or_due_yen,
    findings,
  };
}

export function auditPayrollCsvText(csvText, detectedEncoding = "utf-8") {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length < 2) {
    throw new Error("CSVにヘッダー行またはデータ行が含まれていません。");
  }
  const headers = matrix[0];
  const rowObjects = [];
  for (let i = 1; i < matrix.length; i += 1) {
    const vals = matrix[i];
    if (vals.every((v) => cleanStr(v) === "")) continue;
    const obj = {};
    headers.forEach((h, colIdx) => {
      obj[h] = vals[colIdx] ?? "";
    });
    rowObjects.push(obj);
  }
  if (rowObjects.length === 0) {
    throw new Error("有効な従業員データ行が0件です。");
  }

  const records = [];
  const countsByCode = {};
  let critCount = 0;
  let highCount = 0;
  let medCount = 0;

  rowObjects.forEach((r, i) => {
    const rec = auditEmployeeObject(r, i + 1);
    records.push(rec);
    rec.findings.forEach((f) => {
      countsByCode[f.code] = (countsByCode[f.code] ?? 0) + 1;
      if (f.severity === "critical") critCount += 1;
      else if (f.severity === "high") highCount += 1;
      else medCount += 1;
    });
  });

  const flagged = records.filter((r) => r.findings.length > 0).length;
  const clean = records.length - flagged;
  const totalOver = records.reduce((a, r) => a + r.tax_overpayment_yen, 0);
  const totalUnder = records.reduce((a, r) => a + r.tax_underpayment_yen, 0);
  const totalRelief = records.reduce((a, r) => a + r.r8_vs_r7_tax_relief_yen, 0);

  return {
    tax_year: 2026,
    statutory_effective_date: STATUTORY_EFFECTIVE_DATE_R8,
    detected_encoding: detectedEncoding,
    total_employees: records.length,
    clean_employees: clean,
    flagged_employees: flagged,
    critical_findings_count: critCount,
    high_findings_count: highCount,
    medium_findings_count: medCount,
    total_tax_overpayment_yen: totalOver,
    total_tax_underpayment_yen: totalUnder,
    total_r8_vs_r7_tax_relief_yen: totalRelief,
    finding_counts_by_code: countsByCode,
    records,
  };
}

export const EXPORT_CSV_HEADERS = [
  "社員番号",
  "氏名",
  "部署",
  "検算ステータス",
  "給与収入_円",
  "令和8年合計所得_円",
  "法定_基礎控除_円",
  "申告_基礎控除_円",
  "法定_配偶者控除等_円",
  "申告_配偶者控除等_円",
  "法定_扶養控除_円",
  "申告_扶養控除_円",
  "法定_特定親族特別控除_円",
  "申告_特定親族特別控除_円",
  "法定_所得金額調整控除_円",
  "法定_年調年税額_令和8年_円",
  "申告ベース推計年税額_円",
  "令和7年比_減税額_円",
  "過大徴収_還付漏れ額_円",
  "徴収不足額_円",
  "指摘件数",
  "指摘コード一覧",
  "実務是正コメント",
];

function escapeCsvCell(val) {
  const s = val === null || val === undefined ? "" : String(val);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function formatAuditReportCsv(summary) {
  const statusJa = {
    clean: "適正",
    action_required: "要確認",
    critical: "要是正（重大）",
  };
  const lines = [EXPORT_CSV_HEADERS.map(escapeCsvCell).join(",")];
  summary.records.forEach((r) => {
    const codes = r.findings.length > 0 ? r.findings.map((f) => f.code).join(" / ") : "-";
    const comments =
      r.findings.length > 0
        ? r.findings.map((f) => `${f.title}: ${f.detail}`).join(" ｜ ")
        : "法定通り適正";
    const row = [
      r.employee_id,
      r.employee_name,
      r.department,
      statusJa[r.status] ?? r.status,
      r.salary_yen,
      r.total_income_r8_yen,
      r.statutory_basic_deduction_yen,
      r.declared_basic_deduction_yen ?? "",
      r.statutory_spouse_deduction_yen,
      r.declared_spouse_deduction_yen ?? "",
      r.statutory_fuyo_deduction_yen,
      r.declared_fuyo_deduction_yen ?? "",
      r.statutory_tokutei_shinzoku_deduction_yen,
      r.declared_tokutei_shinzoku_deduction_yen ?? "",
      r.statutory_income_adjustment_yen,
      r.statutory_annual_tax_r8_yen,
      r.declared_estimated_annual_tax_yen,
      r.r8_vs_r7_tax_relief_yen,
      r.tax_overpayment_yen,
      r.tax_underpayment_yen,
      r.findings.length,
      codes,
      comments,
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  });
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

export function buildSampleAuditCsv() {
  const headers = [
    "社員番号",
    "氏名",
    "部署",
    "給与収入",
    "社会保険料控除",
    "生命保険料控除",
    "源泉徴収税額",
    "最終支給日",
    "ひとり親",
    "配偶者有無",
    "配偶者年齢",
    "配偶者給与収入",
    "子1氏名",
    "子1年齢",
    "子1給与収入",
    "子2氏名",
    "子2年齢",
    "子2給与収入",
    "申告_基礎控除",
    "申告_配偶者控除等",
    "申告_扶養控除",
    "申告_特定親族特別控除",
    "申告_所得金額調整控除",
    "申告_ひとり親寡婦控除",
  ];
  const rows = [
    ["EMP-2601", "佐藤 健一", "製造第一部", "6200000", "912000", "80000", "184000", "2026-12-25", "0", "1", "47", "1320000", "佐藤 翔太", "20", "1520000", "", "", "", "1040000", "380000", "0", "0", "0", "0"],
    ["EMP-2602", "鈴木 美咲", "経理財務課", "5400000", "795000", "40000", "152000", "2026-12-25", "0", "0", "", "", "鈴木 和子", "72", "1320000", "", "", "", "1040000", "0", "0", "0", "0", "0"],
    ["EMP-2603", "高橋 誠", "営業推進部", "5100000", "750000", "60000", "146000", "2026-12-25", "0", "1", "42", "1760000", "", "", "", "", "", "", "680000", "310000", "0", "0", "0", "0"],
    ["EMP-2604", "田中 由美", "人事総務課", "9200000", "1260000", "100000", "580000", "2026-12-25", "0", "0", "", "", "田中 陽菜", "21", "1300000", "", "", "", "620000", "0", "0", "630000", "0", "0"],
    ["EMP-2605", "伊藤 剛", "情報システム室", "4600000", "676000", "50000", "98000", "2026-12-25", "1", "0", "", "", "伊藤 蓮", "19", "1720000", "", "", "", "1040000", "0", "0", "310000", "0", "380000"],
    ["EMP-2606", "渡辺 彩", "海外事業部", "4200000", "610000", "0", "92000", "2026-11-20", "0", "0", "", "", "", "", "", "", "", "", "1040000", "0", "0", "0", "0", "0"],
    ["EMP-2607", "山本 隆", "物流センター", "1780000", "256000", "0", "18500", "2026-12-25", "0", "0", "", "", "", "", "", "", "", "", "1040000", "0", "0", "0", "0", "0"],
    ["EMP-2608", "中村 恵", "経営企画室", "10200000", "1380000", "120000", "790000", "2026-12-25", "0", "1", "45", "1650000", "中村 陸", "20", "1860000", "中村 葵", "17", "0", "620000", "380000", "380000", "110000", "150000", "0"],
  ];
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n") + "\n";
}

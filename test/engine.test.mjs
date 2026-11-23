import assert from "node:assert/strict";
import test from "node:test";

import {
  auditPayrollCsvText,
  buildSampleAuditCsv,
  calculateHouseholdYearTax,
  compareR8VsR7,
  computeBasicDeduction,
  computeEmploymentIncome,
  computeIncomeAdjustmentDeduction,
  computeNationalIncomeTax,
  decodePayrollBytes,
  evaluateDependent,
  evaluateSpouseDeduction,
  formatAuditReportCsv,
  simulateWallCheckpoints,
} from "../engine.js";

test("NTA No.1410 Reiwa 8 employment income matches exact 1-yen boundaries and 219.1M-220M notches", () => {
  assert.equal(computeEmploymentIncome(0, 2026), 0);
  assert.equal(computeEmploymentIncome(740999, 2026), 0);
  assert.equal(computeEmploymentIncome(741000, 2026), 1000);
  assert.equal(computeEmploymentIncome(1360000, 2026), 620000);
  assert.equal(computeEmploymentIncome(1360001, 2026), 620001);
  assert.equal(computeEmploymentIncome(1780000, 2026), 1040000);
  assert.equal(computeEmploymentIncome(1970000, 2026), 1230000);
  assert.equal(computeEmploymentIncome(2190999, 2026), 1450999);
  assert.equal(computeEmploymentIncome(2191000, 2026), 1451000);
  assert.equal(computeEmploymentIncome(2192999, 2026), 1451000);
  assert.equal(computeEmploymentIncome(2193000, 2026), 1453000);
  assert.equal(computeEmploymentIncome(2195999, 2026), 1453000);
  assert.equal(computeEmploymentIncome(2196000, 2026), 1456000);
  assert.equal(computeEmploymentIncome(2199999, 2026), 1456000);
  assert.equal(computeEmploymentIncome(2200000, 2026), 1460000);
  assert.equal(computeEmploymentIncome(4751999, 2026), 3358400);
  assert.equal(computeEmploymentIncome(4752000, 2026), 3361600);
  assert.equal(computeEmploymentIncome(6655556, 2026), 4890000);
  assert.equal(computeEmploymentIncome(6655557, 2026), 4890001);
  assert.equal(computeEmploymentIncome(8500000, 2026), 6550000);
});

test("NTA No.1199 Reiwa 8 basic deduction tiers (104万 up to 489万, 67万, 62万, 48万, 32万, 16万, 0)", () => {
  assert.equal(computeBasicDeduction(1320000, 2026).amount, 1040000);
  assert.equal(computeBasicDeduction(3360000, 2026).amount, 1040000);
  assert.equal(computeBasicDeduction(4890000, 2026).amount, 1040000);
  assert.equal(computeBasicDeduction(4890001, 2026).amount, 670000);
  assert.equal(computeBasicDeduction(6550000, 2026).amount, 670000);
  assert.equal(computeBasicDeduction(6550001, 2026).amount, 620000);
  assert.equal(computeBasicDeduction(23500000, 2026).amount, 620000);
  assert.equal(computeBasicDeduction(23500001, 2026).amount, 480000);
  assert.equal(computeBasicDeduction(24000001, 2026).amount, 320000);
  assert.equal(computeBasicDeduction(24500001, 2026).amount, 160000);
  assert.equal(computeBasicDeduction(25000001, 2026).amount, 0);
});

test("NTA No.1177 all 9 steps of 特定親族特別控除 (136万超〜197万円以下) exact 1-yen boundaries", () => {
  const cases = [
    [1360000, "tokutei_fuyo", 630000],
    [1360001, "tokutei_shinzoku_tokubetsu", 630000],
    [1590000, "tokutei_shinzoku_tokubetsu", 630000],
    [1590001, "tokutei_shinzoku_tokubetsu", 610000],
    [1640000, "tokutei_shinzoku_tokubetsu", 610000],
    [1640001, "tokutei_shinzoku_tokubetsu", 510000],
    [1690000, "tokutei_shinzoku_tokubetsu", 510000],
    [1690001, "tokutei_shinzoku_tokubetsu", 410000],
    [1740000, "tokutei_shinzoku_tokubetsu", 410000],
    [1740001, "tokutei_shinzoku_tokubetsu", 310000],
    [1790000, "tokutei_shinzoku_tokubetsu", 310000],
    [1790001, "tokutei_shinzoku_tokubetsu", 210000],
    [1840000, "tokutei_shinzoku_tokubetsu", 210000],
    [1840001, "tokutei_shinzoku_tokubetsu", 110000],
    [1890000, "tokutei_shinzoku_tokubetsu", 110000],
    [1890001, "tokutei_shinzoku_tokubetsu", 60000],
    [1940000, "tokutei_shinzoku_tokubetsu", 60000],
    [1940001, "tokutei_shinzoku_tokubetsu", 30000],
    [1970000, "tokutei_shinzoku_tokubetsu", 30000],
    [1970001, "ineligible_over_1230k", 0],
  ];
  for (const [sal, expectedCat, expectedDed] of cases) {
    const res = evaluateDependent({ age: 20, salary_yen: sal }, 2026);
    assert.equal(res.category, expectedCat, `Category mismatch at salary ${sal}`);
    assert.equal(res.deduction_yen, expectedDed, `Deduction mismatch at salary ${sal}`);
  }
});

test("178万円の壁 produces 0 yen national income tax even with 0 social insurance", () => {
  const r8 = calculateHouseholdYearTax({ salary_yen: 1780000, social_insurance_yen: 0 }, 2026);
  assert.equal(r8.employment_deduction_yen, 740000);
  assert.equal(r8.basic_deduction_yen, 1040000);
  assert.equal(r8.taxable_income_rounded_yen, 0);
  assert.equal(r8.annual_tax_yen, 0);

  const over = calculateHouseholdYearTax({ salary_yen: 1781000, social_insurance_yen: 0 }, 2026);
  assert.equal(over.taxable_income_rounded_yen, 1000);
  assert.equal(over.base_income_tax_yen, 50);
  assert.equal(over.annual_tax_yen, 0); // 50 * 1.021 = 51.05 -> 100円未満切捨て = 0円!

  const over2k = calculateHouseholdYearTax({ salary_yen: 1782000, social_insurance_yen: 0 }, 2026);
  assert.equal(over2k.annual_tax_yen, 100);
});

test("Spouse deduction and 所得金額調整控除 + batch CSV audit + UTF-8 BOM export", () => {
  const sp = evaluateSpouseDeduction({
    hasSpouse: true,
    taxpayerTotalIncomeYen: 9200000,
    spouseSalaryYen: 2070000,
    spouseAge: 45,
    taxYear: 2026,
  });
  assert.equal(sp.deduction_yen, 20000);
  assert.equal(computeIncomeAdjustmentDeduction(9200005, true), 70001);

  const summary = auditPayrollCsvText(buildSampleAuditCsv(), "utf-8");
  assert.equal(summary.total_employees, 8);
  assert.equal(summary.clean_employees, 2);
  assert.equal(summary.flagged_employees, 6);
  assert.equal(summary.critical_findings_count, 3);

  const bomCsv = formatAuditReportCsv(summary);
  assert.ok(bomCsv.startsWith("\uFEFF社員番号,氏名"));
  const decoded = decodePayrollBytes(new TextEncoder().encode(bomCsv));
  assert.equal(decoded.encoding, "utf-8-sig");

  const comp = compareR8VsR7({
    salary_yen: 6200000,
    has_spouse: true,
    spouse_salary_yen: 1320000,
    dependents: [{ name: "子", age: 20, salary_yen: 1520000 }],
  });
  assert.ok(comp.delta.annual_tax_savings_yen > 0);
  assert.equal(simulateWallCheckpoints(comp.r8_2026, "child").length, 10);
});

"""Batch HR / Accounting CSV Auditor for Reiwa 8 (2026) Year-End Tax Adjustment (年末調整).

Audits employee payroll CSV files locally (UTF-8 / UTF-8-BOM / Shift-JIS cp932),
detects all 8 statutory transition traps between Reiwa 7 (2025) and Reiwa 8 (2026),
and exports Excel-ready UTF-8-BOM or Shift-JIS (`cp932`) audit reports.
"""

from __future__ import annotations

import csv
from dataclasses import asdict, dataclass
import io
from typing import Any

from .calculator import (
    DependentInput,
    HouseholdTaxInput,
    NenmatsuInputError,
    STATUTORY_EFFECTIVE_DATE_R8,
    calculate_household_year_tax,
    compute_national_income_tax,
)

CSV_HEADER_ALIASES: dict[str, tuple[str, ...]] = {
    "employee_id": ("employee_id", "emp_id", "社員番号", "従業員番号", "職員番号"),
    "employee_name": ("employee_name", "name", "氏名", "従業員氏名"),
    "department": ("department", "dept", "部署", "所属"),
    "salary_yen": ("salary_yen", "annual_salary", "給与収入", "支払金額", "年収"),
    "other_income_yen": ("other_income_yen", "給与以外の所得", "その他所得"),
    "social_insurance_yen": ("social_insurance_yen", "社会保険料控除", "社会保険料"),
    "life_insurance_deduction_yen": ("life_insurance_deduction_yen", "生命保険料控除"),
    "earthquake_insurance_deduction_yen": ("earthquake_insurance_deduction_yen", "地震保険料控除"),
    "ideco_small_enterprise_yen": ("ideco_small_enterprise_yen", "ideco_yen", "小規模企業共済等掛金控除"),
    "housing_loan_credit_yen": ("housing_loan_credit_yen", "住宅ローン控除", "住宅借入金等特別控除"),
    "withheld_tax_yen": ("withheld_tax_yen", "源泉徴収税額", "既徴収税額"),
    "last_pay_date": ("last_pay_date", "最終支給日", "最終給与支払日"),
    "is_resident": ("is_resident", "居住者区分", "居住者"),
    "is_hitori_oya": ("is_hitori_oya", "ひとり親", "ひとり親該当"),
    "is_kafu": ("is_kafu", "寡婦", "寡婦該当"),
    "has_spouse": ("has_spouse", "配偶者有無", "配偶者あり"),
    "spouse_age": ("spouse_age", "配偶者年齢"),
    "spouse_salary_yen": ("spouse_salary_yen", "配偶者給与収入", "配偶者年収"),
    "spouse_other_income_yen": ("spouse_other_income_yen", "配偶者その他所得"),
    "dep1_name": ("dep1_name", "子1氏名", "親族1氏名"),
    "dep1_age": ("dep1_age", "子1年齢", "親族1年齢"),
    "dep1_salary_yen": ("dep1_salary_yen", "子1給与収入", "親族1給与収入"),
    "dep1_cohabiting": ("dep1_cohabiting", "親族1同居老親"),
    "dep2_name": ("dep2_name", "子2氏名", "親族2氏名"),
    "dep2_age": ("dep2_age", "子2年齢", "親族2年齢"),
    "dep2_salary_yen": ("dep2_salary_yen", "子2給与収入", "親族2給与収入"),
    "dep2_cohabiting": ("dep2_cohabiting", "親族2同居老親"),
    "dep3_name": ("dep3_name", "親族3氏名"),
    "dep3_age": ("dep3_age", "親族3年齢"),
    "dep3_salary_yen": ("dep3_salary_yen", "親族3給与収入"),
    "dep3_cohabiting": ("dep3_cohabiting", "親族3同居老親"),
    "declared_basic_deduction_yen": ("declared_basic_deduction_yen", "申告_基礎控除", "基礎控除申告額"),
    "declared_spouse_deduction_yen": ("declared_spouse_deduction_yen", "申告_配偶者控除等", "配偶者控除等申告額"),
    "declared_fuyo_deduction_yen": ("declared_fuyo_deduction_yen", "申告_扶養控除", "扶養控除申告額"),
    "declared_tokutei_shinzoku_deduction_yen": (
        "declared_tokutei_shinzoku_deduction_yen",
        "申告_特定親族特別控除",
        "特定親族特別控除申告額",
    ),
    "declared_income_adjustment_yen": (
        "declared_income_adjustment_yen",
        "申告_所得金額調整控除",
        "所得金額調整控除申告額",
    ),
    "declared_hitori_oya_deduction_yen": (
        "declared_hitori_oya_deduction_yen",
        "申告_ひとり親寡婦控除",
        "ひとり親控除申告額",
    ),
}


@dataclass(frozen=True)
class AuditFinding:
    """Single statutory payroll discrepancy detected on an employee record."""

    code: str
    severity: str
    title: str
    detail: str
    statutory_basis: str
    deduction_gap_yen: int

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class EmployeeAuditRecord:
    """Complete statutory audit result for one employee CSV row."""

    row_number: int
    employee_id: str
    employee_name: str
    department: str
    status: str
    salary_yen: int
    total_income_r8_yen: int
    statutory_basic_deduction_yen: int
    declared_basic_deduction_yen: int | None
    statutory_spouse_deduction_yen: int
    declared_spouse_deduction_yen: int | None
    statutory_fuyo_deduction_yen: int
    declared_fuyo_deduction_yen: int | None
    statutory_tokutei_shinzoku_deduction_yen: int
    declared_tokutei_shinzoku_deduction_yen: int | None
    statutory_income_adjustment_yen: int
    declared_income_adjustment_yen: int | None
    statutory_annual_tax_r8_yen: int
    declared_estimated_annual_tax_yen: int
    annual_tax_r7_yen: int
    r8_vs_r7_tax_relief_yen: int
    tax_overpayment_yen: int
    tax_underpayment_yen: int
    year_end_refund_or_due_yen: int
    findings: tuple[AuditFinding, ...]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["findings"] = [f.to_dict() for f in self.findings]
        return d


@dataclass(frozen=True)
class BatchAuditSummary:
    """Aggregate batch audit report across all HR CSV rows."""

    tax_year: int
    statutory_effective_date: str
    detected_encoding: str
    total_employees: int
    clean_employees: int
    flagged_employees: int
    critical_findings_count: int
    high_findings_count: int
    medium_findings_count: int
    total_tax_overpayment_yen: int
    total_tax_underpayment_yen: int
    total_r8_vs_r7_tax_relief_yen: int
    finding_counts_by_code: dict[str, int]
    records: tuple[EmployeeAuditRecord, ...]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["records"] = [r.to_dict() for r in self.records]
        return d


def decode_payroll_csv_bytes(raw_bytes: bytes) -> tuple[str, str]:
    """Decode UTF-8-BOM, UTF-8, or Shift-JIS (`cp932`) payroll CSV bytes without silent corruption."""
    if not raw_bytes:
        raise NenmatsuInputError("CSV payload is empty.")
    if raw_bytes.startswith(b"\xef\xbb\xbf"):
        return raw_bytes.decode("utf-8-sig"), "utf-8-sig"
    try:
        return raw_bytes.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        pass
    try:
        return raw_bytes.decode("cp932"), "cp932"
    except UnicodeDecodeError as exc:
        raise NenmatsuInputError(
            f"Unsupported CSV character encoding (expected UTF-8 or Shift-JIS/cp932): {exc}"
        ) from exc


def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return str(val).strip()


def _parse_optional_int(val: Any, field_label: str) -> int | None:
    s = _clean_str(val)
    if s == "" or s == "-" or s == "—":
        return None
    normalized = s.replace(",", "").replace("¥", "").replace("￥", "").replace("円", "").strip()
    try:
        parsed = int(normalized)
    except ValueError as exc:
        raise NenmatsuInputError(f"Invalid integer amount for {field_label}: {val!r}") from exc
    if parsed < 0:
        raise NenmatsuInputError(f"Negative amount not allowed for {field_label}: {parsed}")
    return parsed


def _parse_bool(val: Any, default: bool = False) -> bool:
    if isinstance(val, bool):
        return val
    s = _clean_str(val).lower()
    if s == "":
        return default
    if s in ("1", "true", "yes", "y", "有", "あり", "対象", "該当", "○", "o"):
        return True
    if s in ("0", "false", "no", "n", "無", "なし", "対象外", "非該当", "×", "x", "-"):
        return False
    raise NenmatsuInputError(f"Unrecognized boolean flag value: {val!r}")


def _canonicalize_row(raw_row: dict[str, Any]) -> dict[str, Any]:
    lookup: dict[str, Any] = {}
    for k, v in raw_row.items():
        if k is not None:
            lookup[str(k).strip().lstrip("\ufeff")] = v

    canon: dict[str, Any] = {}
    for target_key, aliases in CSV_HEADER_ALIASES.items():
        for alias in aliases:
            if alias in lookup:
                canon[target_key] = lookup[alias]
                break
    return canon


def audit_employee_dict(raw_row: dict[str, Any], *, row_number: int = 1) -> EmployeeAuditRecord:
    """Audit a single employee dictionary against Reiwa 8 (2026) statutory rules."""
    row = _canonicalize_row(raw_row)
    emp_id = _clean_str(row.get("employee_id")) or f"EMP-{row_number:04d}"
    emp_name = _clean_str(row.get("employee_name")) or f"従業員{row_number}"
    dept = _clean_str(row.get("department")) or "未設定"

    sal_opt = _parse_optional_int(row.get("salary_yen"), f"{emp_id}.salary_yen")
    if sal_opt is None:
        raise NenmatsuInputError(f"Row {row_number} ({emp_id}): salary_yen / 給与収入 is required.")
    salary_yen = sal_opt

    other_inc = _parse_optional_int(row.get("other_income_yen"), f"{emp_id}.other_income_yen") or 0
    soc_ins = _parse_optional_int(row.get("social_insurance_yen"), f"{emp_id}.social_insurance_yen")
    life_ins = _parse_optional_int(row.get("life_insurance_deduction_yen"), f"{emp_id}.life_insurance") or 0
    eq_ins = _parse_optional_int(row.get("earthquake_insurance_deduction_yen"), f"{emp_id}.eq_insurance") or 0
    ideco = _parse_optional_int(row.get("ideco_small_enterprise_yen"), f"{emp_id}.ideco") or 0
    housing = _parse_optional_int(row.get("housing_loan_credit_yen"), f"{emp_id}.housing_loan") or 0
    withheld = _parse_optional_int(row.get("withheld_tax_yen"), f"{emp_id}.withheld_tax") or 0

    is_resident = _parse_bool(row.get("is_resident"), default=True)
    is_hitori_oya = _parse_bool(row.get("is_hitori_oya"), default=False)
    is_kafu = _parse_bool(row.get("is_kafu"), default=False)

    spouse_sal = _parse_optional_int(row.get("spouse_salary_yen"), f"{emp_id}.spouse_salary_yen") or 0
    spouse_oth = _parse_optional_int(row.get("spouse_other_income_yen"), f"{emp_id}.spouse_other_income") or 0
    spouse_age = _parse_optional_int(row.get("spouse_age"), f"{emp_id}.spouse_age") or 40
    has_spouse_raw = row.get("has_spouse")
    if _clean_str(has_spouse_raw) != "":
        has_spouse = _parse_bool(has_spouse_raw, default=False)
    else:
        has_spouse = (_clean_str(row.get("spouse_salary_yen")) != "") or (_clean_str(row.get("spouse_age")) != "")

    dependents: list[DependentInput] = []
    for idx in (1, 2, 3):
        age_opt = _parse_optional_int(row.get(f"dep{idx}_age"), f"{emp_id}.dep{idx}_age")
        if age_opt is None:
            continue
        dep_sal = _parse_optional_int(row.get(f"dep{idx}_salary_yen"), f"{emp_id}.dep{idx}_salary") or 0
        dep_name = _clean_str(row.get(f"dep{idx}_name")) or f"親族{idx}"
        cohab = _parse_bool(row.get(f"dep{idx}_cohabiting"), default=False)
        dependents.append(
            DependentInput(
                name=dep_name,
                age=age_opt,
                salary_yen=dep_sal,
                is_cohabiting_ascendant=cohab,
            )
        )

    hh_inp = HouseholdTaxInput(
        salary_yen=salary_yen,
        other_income_yen=other_inc,
        social_insurance_yen=soc_ins,
        life_insurance_deduction_yen=life_ins,
        earthquake_insurance_deduction_yen=eq_ins,
        ideco_small_enterprise_yen=ideco,
        is_hitori_oya=is_hitori_oya,
        is_kafu=is_kafu,
        housing_loan_credit_yen=housing,
        withheld_tax_yen=withheld,
        is_resident=is_resident,
        has_spouse=has_spouse,
        spouse_age=spouse_age,
        spouse_salary_yen=spouse_sal,
        spouse_other_income_yen=spouse_oth,
        dependents=tuple(dependents),
    )

    r8 = calculate_household_year_tax(hh_inp, tax_year=2026)
    r7 = calculate_household_year_tax(hh_inp, tax_year=2025)

    dec_basic = _parse_optional_int(row.get("declared_basic_deduction_yen"), f"{emp_id}.declared_basic")
    dec_spouse = _parse_optional_int(row.get("declared_spouse_deduction_yen"), f"{emp_id}.declared_spouse")
    dec_fuyo = _parse_optional_int(row.get("declared_fuyo_deduction_yen"), f"{emp_id}.declared_fuyo")
    dec_tokutei = _parse_optional_int(
        row.get("declared_tokutei_shinzoku_deduction_yen"),
        f"{emp_id}.declared_tokutei_shinzoku",
    )
    dec_adj = _parse_optional_int(row.get("declared_income_adjustment_yen"), f"{emp_id}.declared_adj")
    dec_hitori = _parse_optional_int(row.get("declared_hitori_oya_deduction_yen"), f"{emp_id}.declared_hitori")
    last_pay_date = _clean_str(row.get("last_pay_date"))

    findings: list[AuditFinding] = []

    # 1. Pre-December 1, 2026 retirement / last-salary enforcement boundary (NTA Q&A Q1-3)
    if last_pay_date and last_pay_date < STATUTORY_EFFECTIVE_DATE_R8:
        findings.append(
            AuditFinding(
                code="PRE_DEC1_ENFORCEMENT_INELIGIBLE",
                severity="high",
                title="令和8年11月30日以前の最終給与支給（改正後控除の年調適用不可）",
                detail=(
                    f"最終給与支給日が {last_pay_date}（施行日 2026-12-01 前）のため、"
                    "年末調整では改正前の控除額（令和7年分水準）で精算し、本人が確定申告で還付を受ける必要があります。"
                ),
                statutory_basis="国税庁『令和8年度税制改正Q&A（令和8年5月）』Q1-3・Q7-1",
                deduction_gap_yen=r8.total_income_deductions_yen - r7.total_income_deductions_yen,
            )
        )

    # 2. Check 基礎控除 tier accuracy (NTA No.1199)
    if dec_basic is not None and dec_basic != r8.basic_deduction_yen:
        r7_match_hint = (
            f"（令和7年分の旧控除額 {r7.basic_deduction_yen:,}円 が誤って残っています）"
            if dec_basic == r7.basic_deduction_yen
            else "（令和6年以前の48万円または誤った所得区分が入力されています）"
        )
        findings.append(
            AuditFinding(
                code="WRONG_BASIC_DEDUCTION_TIER",
                severity="high",
                title="基礎控除申告書の控除額誤り（令和8年分 104万/67万/62万円区分）",
                detail=(
                    f"本人合計所得 {r8.total_income_yen:,}円 に対する令和8年分の法定基礎控除額は "
                    f"{r8.basic_deduction_yen:,}円 ですが、申告額は {dec_basic:,}円 です{r7_match_hint}。"
                ),
                statutory_basis="所得税法第86条・租税特別措置法第41条の16の2（国税庁 No.1199）",
                deduction_gap_yen=r8.basic_deduction_yen - dec_basic,
            )
        )

    # 3. Check 特定親族特別控除 (19-22yo, 62万超〜123万円以下 / 給与136万超〜197万円以下)
    form_reclassified_123_to_136 = (
        r8.tokutei_shinzoku_deduction_total_yen == 0
        and dec_tokutei == 630_000
        and (dec_fuyo == 0 or dec_fuyo is None)
        and r8.fuyo_deduction_total_yen >= 630_000
        and any(
            19 <= d.age < 23 and 1_230_000 < d.salary_yen <= 1_360_000
            for d in hh_inp.dependents
        )
    )
    if dec_tokutei is not None and dec_tokutei != r8.tokutei_shinzoku_deduction_total_yen:
        if r8.tokutei_shinzoku_deduction_total_yen > 0 and dec_tokutei == 0:
            findings.append(
                AuditFinding(
                    code="MISSED_TOKUTEI_SHINZOKU",
                    severity="critical",
                    title="特定親族特別控除（19〜22歳・年収136万超〜197万円以下）の申告漏れ",
                    detail=(
                        "大学生年代（19〜22歳）の親族が扶養控除上限（給与136万円）を超えていますが、"
                        f"令和8年分『特定親族特別控除』として {r8.tokutei_shinzoku_deduction_total_yen:,}円 を控除可能です。"
                        "特定親族特別控除申告書の提出漏れを確認してください。"
                    ),
                    statutory_basis="所得税法第84条の2（国税庁 No.1177・令和8年4月改正のあらまし p.2）",
                    deduction_gap_yen=r8.tokutei_shinzoku_deduction_total_yen,
                )
            )
        elif form_reclassified_123_to_136:
            findings.append(
                AuditFinding(
                    code="LEGACY_R7_THRESHOLD_APPLIED",
                    severity="critical",
                    title="19〜22歳親族（年収123万超〜136万円以下）の申告書区分誤り（特定扶養親族へ異動）",
                    detail=(
                        "給与123万超〜136万円以下の19〜22歳親族は、令和8年12月1日改正により合計所得62万円以下となるため、"
                        "『特定親族特別控除申告書』ではなく『扶養控除等（異動）申告書（特定扶養親族 63万円）』への記載変更が必要です。"
                    ),
                    statutory_basis="国税庁『令和8年度税制改正Q&A』Q2-1・Q2-4",
                    deduction_gap_yen=0,
                )
            )
        else:
            findings.append(
                AuditFinding(
                    code="TOKUTEI_SHINZOKU_STEP_MISMATCH",
                    severity="high",
                    title="特定親族特別控除（9段階テーブル）の段階金額不一致",
                    detail=(
                        f"令和8年分の給与所得控除（最低74万円）適用後の法定控除額は "
                        f"{r8.tokutei_shinzoku_deduction_total_yen:,}円 ですが、申告額は {dec_tokutei:,}円 です。"
                    ),
                    statutory_basis="所得税法第84条の2（国税庁 No.1177）",
                    deduction_gap_yen=r8.tokutei_shinzoku_deduction_total_yen - dec_tokutei,
                )
            )

    # 4. Check 扶養控除 & legacy R7 58万/123万 wall drop-off
    if (
        not form_reclassified_123_to_136
        and dec_fuyo is not None
        and dec_fuyo != r8.fuyo_deduction_total_yen
    ):
        in_transition_band = any(
            d.age >= 16 and 1_230_000 < d.salary_yen <= 1_360_000 for d in hh_inp.dependents
        )
        if in_transition_band and dec_fuyo == r7.fuyo_deduction_total_yen:
            findings.append(
                AuditFinding(
                    code="LEGACY_R7_THRESHOLD_APPLIED",
                    severity="critical",
                    title="旧令和7年基準（123万円/58万円の壁）による扶養控除の適用漏れ",
                    detail=(
                        "親族の給与収入が123万超〜136万円以下のため、令和8年改正後の所得要件（合計所得62万円以下）を満たし、"
                        f"扶養控除 {r8.fuyo_deduction_total_yen:,}円 の対象となります（申告額 {dec_fuyo:,}円）。"
                        "扶養控除等申告書の異動欄に『令和8年12月1日 改正』と追記して適用してください。"
                    ),
                    statutory_basis="所得税法第84条・国税庁『令和8年度税制改正Q&A』Q2-1",
                    deduction_gap_yen=r8.fuyo_deduction_total_yen - dec_fuyo,
                )
            )
        else:
            findings.append(
                AuditFinding(
                    code="FUYO_DEDUCTION_MISMATCH",
                    severity="high",
                    title="扶養控除額の算定不一致",
                    detail=(
                        f"令和8年分の法定扶養控除合計は {r8.fuyo_deduction_total_yen:,}円 ですが、"
                        f"申告額は {dec_fuyo:,}円 です。"
                    ),
                    statutory_basis="所得税法第84条（国税庁 No.1180）",
                    deduction_gap_yen=r8.fuyo_deduction_total_yen - dec_fuyo,
                )
            )

    # 5. Check 配偶者控除・配偶者特別控除
    if dec_spouse is not None and dec_spouse != r8.spouse_result.deduction_yen:
        findings.append(
            AuditFinding(
                code="SPOUSE_DEDUCTION_MISMATCH",
                severity="high",
                title="配偶者控除・配偶者特別控除の算定不一致（136万/207万円基準）",
                detail=(
                    f"配偶者合計所得 {r8.spouse_result.spouse_total_income_yen:,}円・本人合計所得 "
                    f"{r8.total_income_yen:,}円 に対する令和8年分の法定控除額は "
                    f"{r8.spouse_result.deduction_yen:,}円 ですが、申告額は {dec_spouse:,}円 です。"
                ),
                statutory_basis="所得税法第83条・第83条の2（国税庁 No.1191・No.1195・Q2-3）",
                deduction_gap_yen=r8.spouse_result.deduction_yen - dec_spouse,
            )
        )

    # 6. Check 所得金額調整控除 & ひとり親控除 R9 premature 38万円 trap
    if dec_adj is not None and dec_adj != r8.income_adjustment_deduction_yen:
        findings.append(
            AuditFinding(
                code="SHOTOKU_CHOSEI_OR_HITORI_OYA_TRAP",
                severity="medium",
                title="所得金額調整控除（年収850万円超・23歳未満扶養等）の算定不一致",
                detail=(
                    f"法定の所得金額調整控除額は {r8.income_adjustment_deduction_yen:,}円 ですが、"
                    f"申告額は {dec_adj:,}円 です。"
                ),
                statutory_basis="租税特別措置法第41条の3の11（国税庁 No.1411）",
                deduction_gap_yen=r8.income_adjustment_deduction_yen - dec_adj,
            )
        )

    if dec_hitori is not None and dec_hitori != r8.hitori_oya_or_kafu_deduction_yen:
        hint = (
            "（ひとり親控除38万円への引上げは令和9年分以後のため、令和8年分年末調整は35万円です）"
            if dec_hitori == 380_000 and r8.hitori_oya_or_kafu_deduction_yen == 350_000
            else ""
        )
        findings.append(
            AuditFinding(
                code="SHOTOKU_CHOSEI_OR_HITORI_OYA_TRAP",
                severity="medium",
                title="ひとり親控除・寡婦控除の金額不一致",
                detail=(
                    f"令和8年分の法定控除額は {r8.hitori_oya_or_kafu_deduction_yen:,}円 ですが、"
                    f"申告額は {dec_hitori:,}円 です{hint}。"
                ),
                statutory_basis="国税庁『令和8年度税制改正Q&A』Q3-2",
                deduction_gap_yen=r8.hitori_oya_or_kafu_deduction_yen - dec_hitori,
            )
        )

    # Reconstruct declared-basis annual tax to quantify exact yen overpayment / underpayment
    eff_adj = dec_adj if dec_adj is not None else r8.income_adjustment_deduction_yen
    eff_emp_inc = max(0, r8.employment_income_before_adj_yen - eff_adj)
    eff_total_inc = eff_emp_inc + r8.other_income_yen
    eff_deductions = (
        r8.social_insurance_yen
        + (dec_basic if dec_basic is not None else r8.basic_deduction_yen)
        + (dec_spouse if dec_spouse is not None else r8.spouse_result.deduction_yen)
        + (dec_fuyo if dec_fuyo is not None else r8.fuyo_deduction_total_yen)
        + (dec_tokutei if dec_tokutei is not None else r8.tokutei_shinzoku_deduction_total_yen)
        + (dec_hitori if dec_hitori is not None else r8.hitori_oya_or_kafu_deduction_yen)
        + r8.kinro_gakusei_deduction_yen
        + r8.disability_deduction_yen
        + r8.other_statutory_deductions_yen
    )
    eff_taxable_raw = max(0, eff_total_inc - eff_deductions)
    _, _, _, _, _, declared_est_tax = compute_national_income_tax(
        eff_taxable_raw,
        housing_loan_credit_yen=hh_inp.housing_loan_credit_yen,
    )

    statutory_target_tax = (
        r7.annual_tax_yen
        if (last_pay_date and last_pay_date < STATUTORY_EFFECTIVE_DATE_R8)
        else r8.annual_tax_yen
    )
    overpayment = max(0, declared_est_tax - statutory_target_tax)
    underpayment = max(0, statutory_target_tax - declared_est_tax)

    if any(f.severity == "critical" for f in findings):
        status = "critical"
    elif findings:
        status = "action_required"
    else:
        status = "clean"

    return EmployeeAuditRecord(
        row_number=row_number,
        employee_id=emp_id,
        employee_name=emp_name,
        department=dept,
        status=status,
        salary_yen=salary_yen,
        total_income_r8_yen=r8.total_income_yen,
        statutory_basic_deduction_yen=r8.basic_deduction_yen,
        declared_basic_deduction_yen=dec_basic,
        statutory_spouse_deduction_yen=r8.spouse_result.deduction_yen,
        declared_spouse_deduction_yen=dec_spouse,
        statutory_fuyo_deduction_yen=r8.fuyo_deduction_total_yen,
        declared_fuyo_deduction_yen=dec_fuyo,
        statutory_tokutei_shinzoku_deduction_yen=r8.tokutei_shinzoku_deduction_total_yen,
        declared_tokutei_shinzoku_deduction_yen=dec_tokutei,
        statutory_income_adjustment_yen=r8.income_adjustment_deduction_yen,
        declared_income_adjustment_yen=dec_adj,
        statutory_annual_tax_r8_yen=r8.annual_tax_yen,
        declared_estimated_annual_tax_yen=declared_est_tax,
        annual_tax_r7_yen=r7.annual_tax_yen,
        r8_vs_r7_tax_relief_yen=r7.annual_tax_yen - r8.annual_tax_yen,
        tax_overpayment_yen=overpayment,
        tax_underpayment_yen=underpayment,
        year_end_refund_or_due_yen=r8.year_end_refund_or_due_yen,
        findings=tuple(findings),
    )


def audit_payroll_rows(
    rows: list[dict[str, Any]],
    *,
    detected_encoding: str = "utf-8",
) -> BatchAuditSummary:
    """Audit a list of parsed payroll row dicts and return an aggregate summary."""
    if not rows:
        raise NenmatsuInputError("Payroll CSV contains zero employee data rows.")

    records: list[EmployeeAuditRecord] = []
    counts_by_code: dict[str, int] = {}
    crit_count = 0
    high_count = 0
    med_count = 0

    for idx, raw_row in enumerate(rows, start=1):
        rec = audit_employee_dict(raw_row, row_number=idx)
        records.append(rec)
        for f in rec.findings:
            counts_by_code[f.code] = counts_by_code.get(f.code, 0) + 1
            if f.severity == "critical":
                crit_count += 1
            elif f.severity == "high":
                high_count += 1
            else:
                med_count += 1

    flagged = sum(1 for r in records if r.findings)
    clean = len(records) - flagged
    total_over = sum(r.tax_overpayment_yen for r in records)
    total_under = sum(r.tax_underpayment_yen for r in records)
    total_relief = sum(r.r8_vs_r7_tax_relief_yen for r in records)

    return BatchAuditSummary(
        tax_year=2026,
        statutory_effective_date=STATUTORY_EFFECTIVE_DATE_R8,
        detected_encoding=detected_encoding,
        total_employees=len(records),
        clean_employees=clean,
        flagged_employees=flagged,
        critical_findings_count=crit_count,
        high_findings_count=high_count,
        medium_findings_count=med_count,
        total_tax_overpayment_yen=total_over,
        total_tax_underpayment_yen=total_under,
        total_r8_vs_r7_tax_relief_yen=total_relief,
        finding_counts_by_code=counts_by_code,
        records=tuple(records),
    )


def audit_payroll_csv_text(csv_text: str, *, detected_encoding: str = "utf-8") -> BatchAuditSummary:
    """Parse and audit CSV text."""
    stripped = csv_text.lstrip("\ufeff").strip()
    if not stripped:
        raise NenmatsuInputError("CSV text is empty.")
    reader = csv.DictReader(io.StringIO(stripped))
    if not reader.fieldnames:
        raise NenmatsuInputError("CSV header row is missing.")
    rows = [r for r in reader if any(_clean_str(v) != "" for v in r.values())]
    return audit_payroll_rows(rows, detected_encoding=detected_encoding)


def audit_payroll_csv_bytes(raw_bytes: bytes) -> BatchAuditSummary:
    """Auto-detect encoding (UTF-8-BOM / UTF-8 / Shift-JIS cp932) and audit CSV bytes."""
    text, enc = decode_payroll_csv_bytes(raw_bytes)
    return audit_payroll_csv_text(text, detected_encoding=enc)


EXPORT_CSV_HEADERS: tuple[str, ...] = (
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
)


def format_audit_report_csv(summary: BatchAuditSummary) -> str:
    """Format batch audit results into clean Japanese accounting CSV text."""
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(EXPORT_CSV_HEADERS)

    status_ja = {
        "clean": "適正",
        "action_required": "要確認",
        "critical": "要是正（重大）",
    }

    for r in summary.records:
        codes = " / ".join(f.code for f in r.findings) if r.findings else "-"
        comments = " ｜ ".join(f"{f.title}: {f.detail}" for f in r.findings) if r.findings else "法定通り適正"
        writer.writerow(
            [
                r.employee_id,
                r.employee_name,
                r.department,
                status_ja.get(r.status, r.status),
                r.salary_yen,
                r.total_income_r8_yen,
                r.statutory_basic_deduction_yen,
                "" if r.declared_basic_deduction_yen is None else r.declared_basic_deduction_yen,
                r.statutory_spouse_deduction_yen,
                "" if r.declared_spouse_deduction_yen is None else r.declared_spouse_deduction_yen,
                r.statutory_fuyo_deduction_yen,
                "" if r.declared_fuyo_deduction_yen is None else r.declared_fuyo_deduction_yen,
                r.statutory_tokutei_shinzoku_deduction_yen,
                ""
                if r.declared_tokutei_shinzoku_deduction_yen is None
                else r.declared_tokutei_shinzoku_deduction_yen,
                r.statutory_income_adjustment_yen,
                r.statutory_annual_tax_r8_yen,
                r.declared_estimated_annual_tax_yen,
                r.r8_vs_r7_tax_relief_yen,
                r.tax_overpayment_yen,
                r.tax_underpayment_yen,
                len(r.findings),
                codes,
                comments,
            ]
        )
    return buf.getvalue()


def export_audit_report_bytes(summary: BatchAuditSummary, *, encoding: str = "utf-8-sig") -> bytes:
    """Encode audit report CSV into Excel-friendly UTF-8 with BOM (`utf-8-sig`) or Shift-JIS (`cp932`)."""
    csv_text = format_audit_report_csv(summary)
    norm_enc = encoding.strip().lower()
    if norm_enc in ("utf-8-sig", "utf8-bom", "bom"):
        return csv_text.encode("utf-8-sig")
    if norm_enc == "utf-8":
        return csv_text.encode("utf-8")
    if norm_enc in ("cp932", "shift_jis", "shift-jis", "sjis"):
        return csv_text.encode("cp932", errors="replace")
    raise NenmatsuInputError(f"Unsupported export encoding {encoding!r}; choose utf-8-sig, utf-8, or cp932.")


def build_sample_audit_csv() -> str:
    """Build an 8-row realistic Japanese corporate payroll CSV covering key R8 (2026) traps."""
    headers = [
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
    ]
    sample_rows = [
        # 1. CRITICAL: 20yo university child earned 1,520,000 -> eligible for full 630,000 特定親族特別控除, missed (0)!
        [
            "EMP-2601",
            "佐藤 健一",
            "製造第一部",
            "6200000",
            "912000",
            "80000",
            "184000",
            "2026-12-25",
            "0",
            "1",
            "47",
            "1320000",
            "佐藤 翔太",
            "20",
            "1520000",
            "",
            "",
            "",
            "1040000",
            "380000",
            "0",
            "0",
            "0",
            "0",
        ],
        # 2. CRITICAL: 72yo parent earned 1,320,000 -> under R8 (132万 - 74万 = 58万 <= 62万) qualifies for 48万老人扶養! Old R7 rule dropped to 0!
        [
            "EMP-2602",
            "鈴木 美咲",
            "経理財務課",
            "5400000",
            "795000",
            "40000",
            "152000",
            "2026-12-25",
            "0",
            "0",
            "",
            "",
            "鈴木 和子",
            "72",
            "1320000",
            "",
            "",
            "",
            "1040000",
            "0",
            "0",
            "0",
            "0",
            "0",
        ],
        # 3. HIGH: Middle-income employee (salary 5,100,000 -> total income 3,640,000 <= 4,890,000) entered R7 680,000 basic deduction instead of R8 1,040,000!
        [
            "EMP-2603",
            "高橋 誠",
            "営業推進部",
            "5100000",
            "750000",
            "60000",
            "146000",
            "2026-12-25",
            "0",
            "1",
            "42",
            "1760000",
            "",
            "",
            "",
            "",
            "",
            "",
            "680000",
            "310000",
            "0",
            "0",
            "0",
            "0",
        ],
        # 4. CRITICAL: 21yo child earned 1,300,000 -> R8 switches from 特定親族特別控除申告書 back to 扶養控除等申告書 (特定扶養 63万, Q2-4)!
        [
            "EMP-2604",
            "田中 由美",
            "人事総務課",
            "9200000",
            "1260000",
            "100000",
            "580000",
            "2026-12-25",
            "0",
            "0",
            "",
            "",
            "田中 陽菜",
            "21",
            "1300000",
            "",
            "",
            "",
            "620000",
            "0",
            "0",
            "630000",
            "0",
            "0",
        ],
        # 5. HIGH + MEDIUM: Single parent entered R9 380,000 instead of R8 350,000 (Q3-2) & child earned 1,720,000 (step 41万 vs old 31万)!
        [
            "EMP-2605",
            "伊藤 剛",
            "情報システム室",
            "4600000",
            "676000",
            "50000",
            "98000",
            "2026-12-25",
            "1",
            "0",
            "",
            "",
            "伊藤 蓮",
            "19",
            "1720000",
            "",
            "",
            "",
            "1040000",
            "0",
            "0",
            "310000",
            "0",
            "380000",
        ],
        # 6. HIGH: Mid-year overseas transfer with last salary paid 2026-11-20 (< 2026-12-01, Q1-3)!
        [
            "EMP-2606",
            "渡辺 彩",
            "海外事業部",
            "4200000",
            "610000",
            "0",
            "92000",
            "2026-11-20",
            "0",
            "0",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "1040000",
            "0",
            "0",
            "0",
            "0",
            "0",
        ],
        # 7. CLEAN: Part-time employee right at the 1,780,000 wall -> 0 yen income tax, 100% compliant!
        [
            "EMP-2607",
            "山本 隆",
            "物流センター",
            "1780000",
            "256000",
            "0",
            "18500",
            "2026-12-25",
            "0",
            "0",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "1040000",
            "0",
            "0",
            "0",
            "0",
            "0",
        ],
        # 8. CLEAN: Executive household with 20yo child at 1,860,000 (11万 特定親族特別控除) & 17yo child (38万 一般扶養 + 15万 所得金額調整控除), 100% compliant!
        [
            "EMP-2608",
            "中村 恵",
            "経営企画室",
            "10200000",
            "1380000",
            "120000",
            "790000",
            "2026-12-25",
            "0",
            "1",
            "45",
            "1650000",
            "中村 陸",
            "20",
            "1860000",
            "中村 葵",
            "17",
            "0",
            "620000",
            "380000",
            "380000",
            "110000",
            "150000",
            "0",
        ],
    ]

    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(headers)
    writer.writerows(sample_rows)
    return buf.getvalue()

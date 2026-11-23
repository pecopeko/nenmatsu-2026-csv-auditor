"""Statutory calculation engine for Reiwa 8 (2026) Japanese Year-End Tax Adjustment (年末調整).

Verified directly against National Tax Agency (`nta.go.jp`) statutory sources:
- NTA Tax Answer No.1410 (給与所得控除 / 所得税法別表第五 / 租税特別措置法第29条の4)
- NTA Tax Answer No.1411 (所得金額調整控除 / 租税特別措置法第41条の3の11)
- NTA Tax Answer No.1199 (基礎控除 / 所得税法第86条・租税特別措置法第41条の16の2)
- NTA Tax Answer No.1180 (扶養控除 / 所得税法第84条)
- NTA Tax Answer No.1177 (特定親族特別控除 / 所得税法第84条の2)
- NTA Tax Answer No.1191 & No.1195 (配偶者控除・配偶者特別控除 / 所得税法第83条・第83条の2)
- NTA Tax Answer No.2260 (所得税の税率・復興特別所得税 102.1%)
- 国税庁『令和8年4月 源泉所得税の改正のあらまし』 & 『令和8年度税制改正Q&A（令和8年5月）』
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

STATUTORY_EFFECTIVE_DATE_R8 = "2026-12-01"
SUPPORTED_TAX_YEARS = (2025, 2026)

# 9-step statutory bracket table for 特定親族特別控除 (所得税法第84条の2 / NTA No.1177).
# Lower bound is > 620,000 in R8 (2026) and > 580,000 in R7 (2025).
TOKUTEI_SHINZOKU_STEPS: tuple[tuple[int, int, str], ...] = (
    (850_000, 630_000, "STEP1_LE_850K_630K"),
    (900_000, 610_000, "STEP2_LE_900K_610K"),
    (950_000, 510_000, "STEP3_LE_950K_510K"),
    (1_000_000, 410_000, "STEP4_LE_1000K_410K"),
    (1_050_000, 310_000, "STEP5_LE_1050K_310K"),
    (1_100_000, 210_000, "STEP6_LE_1100K_210K"),
    (1_150_000, 110_000, "STEP7_LE_1150K_110K"),
    (1_200_000, 60_000, "STEP8_LE_1200K_60K"),
    (1_230_000, 30_000, "STEP9_LE_1230K_30K"),
)

# 9-step statutory bracket table for 配偶者特別控除 (所得税法第83条の2 / NTA No.1195).
# Tuple: (spouse_total_income_max, tier1_le_9m, tier2_le_9_5m, tier3_le_10m)
SPOUSE_SPECIAL_STEPS: tuple[tuple[int, int, int, int], ...] = (
    (950_000, 380_000, 260_000, 130_000),
    (1_000_000, 360_000, 240_000, 120_000),
    (1_050_000, 310_000, 210_000, 110_000),
    (1_100_000, 260_000, 180_000, 90_000),
    (1_150_000, 210_000, 140_000, 70_000),
    (1_200_000, 160_000, 110_000, 60_000),
    (1_250_000, 110_000, 80_000, 40_000),
    (1_300_000, 60_000, 40_000, 20_000),
    (1_330_000, 30_000, 20_000, 10_000),
)

# Progressive national income tax rate brackets (所得税法第89条 / NTA No.2260).
# Tuple: (upper_bound_inclusive_or_none, rate_permille, quick_deduction_yen)
INCOME_TAX_BRACKETS: tuple[tuple[int | None, int, int], ...] = (
    (1_949_000, 50, 0),
    (3_299_000, 100, 97_500),
    (6_949_000, 200, 427_500),
    (8_999_000, 230, 636_000),
    (17_999_000, 330, 1_536_000),
    (39_999_000, 400, 2_796_000),
    (None, 450, 4_796_000),
)


class NenmatsuInputError(ValueError):
    """Raised when statutory payroll or household input values are invalid."""



@dataclass(frozen=True)
class DependentInput:
    """Single relative entry for 扶養控除 or 特定親族特別控除 evaluation."""

    name: str = "親族"
    age: int = 20
    salary_yen: int = 0
    other_income_yen: int = 0
    is_cohabiting_ascendant: bool = False
    is_special_disability: bool = False

    def __post_init__(self) -> None:
        if self.age < 0 or self.age > 130:
            raise ValueError(f"Dependent age out of range: {self.age}")
        if self.salary_yen < 0 or self.other_income_yen < 0:
            raise ValueError("Dependent income amounts must be non-negative integers.")


@dataclass(frozen=True)
class DependentEvalResult:
    """Statutory evaluation of a single relative."""

    name: str
    age: int
    salary_yen: int
    other_income_yen: int
    employment_income_yen: int
    total_income_yen: int
    category: str
    form_type: str
    deduction_yen: int
    step_code: str
    is_fuyo_shinzoku: bool
    is_under23_fuyo: bool
    next_cliff_salary_yen: int | None
    margin_to_next_cliff_yen: int | None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class SpouseEvalResult:
    """Statutory evaluation of spouse deduction (配偶者控除 / 配偶者特別控除 / 同一生計配偶者)."""

    has_spouse: bool
    spouse_age: int
    spouse_salary_yen: int
    spouse_other_income_yen: int
    spouse_employment_income_yen: int
    spouse_total_income_yen: int
    category: str
    deduction_yen: int
    is_doitsu_seikei_spouse: bool
    taxpayer_income_band: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class HouseholdTaxInput:
    """Complete household input for year-end tax adjustment calculation."""

    salary_yen: int
    other_income_yen: int = 0
    social_insurance_yen: int | None = None
    life_insurance_deduction_yen: int = 0
    earthquake_insurance_deduction_yen: int = 0
    ideco_small_enterprise_yen: int = 0
    is_hitori_oya: bool = False
    is_kafu: bool = False
    is_kinro_gakusei: bool = False
    is_self_special_disability: bool = False
    housing_loan_credit_yen: int = 0
    withheld_tax_yen: int = 0
    is_resident: bool = True
    has_spouse: bool = False
    spouse_age: int = 40
    spouse_salary_yen: int = 0
    spouse_other_income_yen: int = 0
    spouse_is_special_disability: bool = False
    dependents: tuple[DependentInput, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class YearTaxBreakdown:
    """Full statutory breakdown for a single tax year (2026 R8 or 2025 R7)."""

    tax_year: int
    salary_yen: int
    employment_income_before_adj_yen: int
    employment_deduction_yen: int
    income_adjustment_deduction_yen: int
    employment_income_yen: int
    other_income_yen: int
    total_income_yen: int
    social_insurance_yen: int
    social_insurance_estimated: bool
    basic_deduction_yen: int
    basic_deduction_tier: str
    spouse_result: SpouseEvalResult
    dependent_results: tuple[DependentEvalResult, ...]
    fuyo_deduction_total_yen: int
    tokutei_shinzoku_deduction_total_yen: int
    hitori_oya_or_kafu_deduction_yen: int
    kinro_gakusei_deduction_yen: int
    disability_deduction_yen: int
    other_statutory_deductions_yen: int
    total_income_deductions_yen: int
    taxable_income_raw_yen: int
    taxable_income_rounded_yen: int
    marginal_rate_percent: int
    base_income_tax_yen: int
    housing_loan_credit_applied_yen: int
    net_base_tax_yen: int
    annual_tax_yen: int
    withheld_tax_yen: int
    year_end_refund_or_due_yen: int
    estimated_net_take_home_yen: int
    life_insurance_general_cap_yen: int

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["spouse_result"] = self.spouse_result.to_dict()
        d["dependent_results"] = [r.to_dict() for r in self.dependent_results]
        return d


def _validate_tax_year(tax_year: int) -> None:
    if tax_year not in SUPPORTED_TAX_YEARS:
        raise ValueError(f"Unsupported tax_year {tax_year}; expected one of {SUPPORTED_TAX_YEARS}.")


def _validate_non_negative_int(value: int, field_name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field_name} must be an integer yen amount, got {type(value).__name__}.")
    if value < 0:
        raise ValueError(f"{field_name} must be >= 0, got {value}.")
    return value


def estimate_social_insurance_yen(salary_yen: int) -> int:
    """Standard ~14.4% employee social insurance approximation when exact amount is omitted."""
    _validate_non_negative_int(salary_yen, "salary_yen")
    if salary_yen < 1_060_000:
        return 0
    return (salary_yen * 144) // 1_000


def compute_employment_income(salary_yen: int, tax_year: int = 2026) -> int:
    """Compute 給与所得控除後の給与等の金額 per 所得税法別表第五 & 措法29条の4 (NTA No.1410).

    Matches National Tax Agency `No.1410` official `computeR08` / `computeR07Plus` exact integer rules.
    """
    _validate_tax_year(tax_year)
    x = _validate_non_negative_int(salary_yen, "salary_yen")

    if tax_year == 2026:
        if x <= 740_999:
            return 0
        if x < 2_191_000:
            return x - 740_000
        if x < 2_193_000:
            return 1_451_000
        if x < 2_196_000:
            return 1_453_000
        if x < 2_200_000:
            return 1_456_000
        if x < 3_600_000:
            b = (x // 4_000) * 4_000
            return (b * 7) // 10 - 80_000
        if x < 6_600_000:
            b = (x // 4_000) * 4_000
            return (b * 8) // 10 - 440_000
        if x < 8_500_000:
            return (x * 9) // 10 - 1_100_000
        return x - 1_950_000

    # tax_year == 2025 (令和7年分)
    if x <= 650_999:
        return 0
    if x < 1_900_000:
        return x - 650_000
    if x < 3_600_000:
        b = (x // 4_000) * 4_000
        return (b * 7) // 10 - 80_000
    if x < 6_600_000:
        b = (x // 4_000) * 4_000
        return (b * 8) // 10 - 440_000
    if x < 8_500_000:
        return (x * 9) // 10 - 1_100_000
    return x - 1_950_000


def compute_income_adjustment_deduction(salary_yen: int, is_eligible: bool) -> int:
    """Compute 子ども・特別障害者等を有する者等の所得金額調整控除 (NTA No.1411, 1円未満端数切上げ)."""
    x = _validate_non_negative_int(salary_yen, "salary_yen")
    if not is_eligible or x <= 8_500_000:
        return 0
    capped = min(x, 10_000_000)
    return (capped - 8_500_000 + 9) // 10


def compute_basic_deduction(
    total_income_yen: int,
    tax_year: int = 2026,
    *,
    is_resident: bool = True,
) -> tuple[int, str]:
    """Compute 基礎控除額 and statutory tier code per NTA No.1199 (所法86・措法41の16の2)."""
    _validate_tax_year(tax_year)
    inc = _validate_non_negative_int(total_income_yen, "total_income_yen")

    if not is_resident:
        if inc <= 23_500_000:
            amt = 620_000 if tax_year == 2026 else 580_000
            return amt, f"NONRES_LE_23500K_{amt // 10_000}0K"
        if inc <= 24_000_000:
            return 480_000, "NONRES_LE_24000K_480K"
        if inc <= 24_500_000:
            return 320_000, "NONRES_LE_24500K_320K"
        if inc <= 25_000_000:
            return 160_000, "NONRES_LE_25000K_160K"
        return 0, "NONRES_GT_25000K_0"

    if tax_year == 2026:
        if inc <= 1_320_000:
            return 1_040_000, "R8_LE_1320K_1040K"
        if inc <= 3_360_000:
            return 1_040_000, "R8_LE_3360K_1040K"
        if inc <= 4_890_000:
            return 1_040_000, "R8_LE_4890K_1040K"
        if inc <= 6_550_000:
            return 670_000, "R8_LE_6550K_670K"
        if inc <= 23_500_000:
            return 620_000, "R8_LE_23500K_620K"
        if inc <= 24_000_000:
            return 480_000, "R8_LE_24000K_480K"
        if inc <= 24_500_000:
            return 320_000, "R8_LE_24500K_320K"
        if inc <= 25_000_000:
            return 160_000, "R8_LE_25000K_160K"
        return 0, "R8_GT_25000K_0"

    # tax_year == 2025 (令和7年分)
    if inc <= 1_320_000:
        return 950_000, "R7_LE_1320K_950K"
    if inc <= 3_360_000:
        return 880_000, "R7_LE_3360K_880K"
    if inc <= 4_890_000:
        return 680_000, "R7_LE_4890K_680K"
    if inc <= 6_550_000:
        return 630_000, "R7_LE_6550K_630K"
    if inc <= 23_500_000:
        return 580_000, "R7_LE_23500K_580K"
    if inc <= 24_000_000:
        return 480_000, "R7_LE_24000K_480K"
    if inc <= 24_500_000:
        return 320_000, "R7_LE_24500K_320K"
    if inc <= 25_000_000:
        return 160_000, "R7_LE_25000K_160K"
    return 0, "R7_GT_25000K_0"


def fuyo_income_limit(tax_year: int = 2026) -> int:
    """Statutory total income limit for 扶養親族 / 同一生計配偶者 (620,000 in R8, 580,000 in R7)."""
    _validate_tax_year(tax_year)
    return 620_000 if tax_year == 2026 else 580_000


def evaluate_spouse_deduction(
    *,
    has_spouse: bool,
    taxpayer_total_income_yen: int,
    spouse_salary_yen: int,
    spouse_other_income_yen: int = 0,
    spouse_age: int = 40,
    tax_year: int = 2026,
) -> SpouseEvalResult:
    """Evaluate 配偶者控除, 配偶者特別控除, and 同一生計配偶者 status per NTA No.1191 & No.1195."""
    _validate_tax_year(tax_year)
    tp_inc = _validate_non_negative_int(taxpayer_total_income_yen, "taxpayer_total_income_yen")
    sp_sal = _validate_non_negative_int(spouse_salary_yen, "spouse_salary_yen")
    sp_oth = _validate_non_negative_int(spouse_other_income_yen, "spouse_other_income_yen")

    if not has_spouse:
        return SpouseEvalResult(
            has_spouse=False,
            spouse_age=spouse_age,
            spouse_salary_yen=0,
            spouse_other_income_yen=0,
            spouse_employment_income_yen=0,
            spouse_total_income_yen=0,
            category="none",
            deduction_yen=0,
            is_doitsu_seikei_spouse=False,
            taxpayer_income_band="none",
        )

    sp_emp = compute_employment_income(sp_sal, tax_year=tax_year)
    sp_total = sp_emp + sp_oth
    base_limit = fuyo_income_limit(tax_year)
    is_doitsu = sp_total <= base_limit

    if tp_inc <= 9_000_000:
        band = "LE_9M"
        band_idx = 0
    elif tp_inc <= 9_500_000:
        band = "GT_9M_LE_9_5M"
        band_idx = 1
    elif tp_inc <= 10_000_000:
        band = "GT_9_5M_LE_10M"
        band_idx = 2
    else:
        return SpouseEvalResult(
            has_spouse=True,
            spouse_age=spouse_age,
            spouse_salary_yen=sp_sal,
            spouse_other_income_yen=sp_oth,
            spouse_employment_income_yen=sp_emp,
            spouse_total_income_yen=sp_total,
            category="ineligible_taxpayer_over_10m",
            deduction_yen=0,
            is_doitsu_seikei_spouse=is_doitsu,
            taxpayer_income_band="GT_10M",
        )

    if sp_total <= base_limit:
        is_elderly = spouse_age >= 70
        elderly_table = (480_000, 320_000, 160_000)
        general_table = (380_000, 260_000, 130_000)
        ded = elderly_table[band_idx] if is_elderly else general_table[band_idx]
        cat = "haigusha_kojo_elderly" if is_elderly else "haigusha_kojo"
        return SpouseEvalResult(
            has_spouse=True,
            spouse_age=spouse_age,
            spouse_salary_yen=sp_sal,
            spouse_other_income_yen=sp_oth,
            spouse_employment_income_yen=sp_emp,
            spouse_total_income_yen=sp_total,
            category=cat,
            deduction_yen=ded,
            is_doitsu_seikei_spouse=True,
            taxpayer_income_band=band,
        )

    for max_inc, t1, t2, t3 in SPOUSE_SPECIAL_STEPS:
        if sp_total <= max_inc:
            ded = (t1, t2, t3)[band_idx]
            return SpouseEvalResult(
                has_spouse=True,
                spouse_age=spouse_age,
                spouse_salary_yen=sp_sal,
                spouse_other_income_yen=sp_oth,
                spouse_employment_income_yen=sp_emp,
                spouse_total_income_yen=sp_total,
                category="haigusha_tokubetsu_kojo",
                deduction_yen=ded,
                is_doitsu_seikei_spouse=False,
                taxpayer_income_band=band,
            )

    return SpouseEvalResult(
        has_spouse=True,
        spouse_age=spouse_age,
        spouse_salary_yen=sp_sal,
        spouse_other_income_yen=sp_oth,
        spouse_employment_income_yen=sp_emp,
        spouse_total_income_yen=sp_total,
        category="ineligible_spouse_over_1330k",
        deduction_yen=0,
        is_doitsu_seikei_spouse=False,
        taxpayer_income_band=band,
    )


def evaluate_dependent(dep: DependentInput, tax_year: int = 2026) -> DependentEvalResult:
    """Evaluate 扶養控除 and 9-step 特定親族特別控除 per NTA No.1180 & No.1177."""
    _validate_tax_year(tax_year)
    emp_inc = compute_employment_income(dep.salary_yen, tax_year=tax_year)
    total_inc = emp_inc + dep.other_income_yen
    base_limit = fuyo_income_limit(tax_year)
    min_ded_base = 740_000 if tax_year == 2026 else 650_000

    # Young dependent (<16): no income tax fuyo deduction, but qualifies as <23 fuyo if income <= limit
    if dep.age < 16:
        is_fuyo = total_inc <= base_limit
        cliff_sal = max(0, base_limit + min_ded_base - dep.other_income_yen) if is_fuyo else None
        margin = (cliff_sal - dep.salary_yen) if (cliff_sal is not None and dep.salary_yen <= cliff_sal) else None
        return DependentEvalResult(
            name=dep.name,
            age=dep.age,
            salary_yen=dep.salary_yen,
            other_income_yen=dep.other_income_yen,
            employment_income_yen=emp_inc,
            total_income_yen=total_inc,
            category="nensho_fuyo" if is_fuyo else "ineligible_income_exceeded",
            form_type="扶養控除等申告書（住民税・所得金額調整用）" if is_fuyo else "対象外",
            deduction_yen=0,
            step_code="NENSHO_0" if is_fuyo else "INELIGIBLE_0",
            is_fuyo_shinzoku=is_fuyo,
            is_under23_fuyo=is_fuyo,
            next_cliff_salary_yen=cliff_sal,
            margin_to_next_cliff_yen=margin,
        )

    # University-age relative: 19 <= age < 23 (特定扶養親族 or 特定親族特別控除)
    if 19 <= dep.age < 23:
        if total_inc <= base_limit:
            # Note: even above base_limit up to 850,000 total income, deduction stays 630,000,
            # though form changes from 扶養控除等申告書 to 特定親族特別控除申告書!
            cliff_sal = max(0, base_limit + min_ded_base - dep.other_income_yen)
            margin = cliff_sal - dep.salary_yen if dep.salary_yen <= cliff_sal else None
            return DependentEvalResult(
                name=dep.name,
                age=dep.age,
                salary_yen=dep.salary_yen,
                other_income_yen=dep.other_income_yen,
                employment_income_yen=emp_inc,
                total_income_yen=total_inc,
                category="tokutei_fuyo",
                form_type="扶養控除等申告書",
                deduction_yen=630_000,
                step_code="FUYO_TOKUTEI_630K",
                is_fuyo_shinzoku=True,
                is_under23_fuyo=True,
                next_cliff_salary_yen=cliff_sal,
                margin_to_next_cliff_yen=margin,
            )

        for upper_inc, ded_yen, step_code in TOKUTEI_SHINZOKU_STEPS:
            if total_inc <= upper_inc:
                # In R8, 850k..1230k + 740k = 1,590k..1,970k (< 2,191k so exact linear!).
                # In R7, 850k..1230k + 650k = 1,500k..1,880k (< 1,900k so exact linear!).
                cliff_sal = max(0, upper_inc + min_ded_base - dep.other_income_yen)
                margin = cliff_sal - dep.salary_yen if dep.salary_yen <= cliff_sal else None
                return DependentEvalResult(
                    name=dep.name,
                    age=dep.age,
                    salary_yen=dep.salary_yen,
                    other_income_yen=dep.other_income_yen,
                    employment_income_yen=emp_inc,
                    total_income_yen=total_inc,
                    category="tokutei_shinzoku_tokubetsu",
                    form_type="特定親族特別控除申告書",
                    deduction_yen=ded_yen,
                    step_code=step_code,
                    is_fuyo_shinzoku=False,
                    is_under23_fuyo=False,
                    next_cliff_salary_yen=cliff_sal,
                    margin_to_next_cliff_yen=margin,
                )

        return DependentEvalResult(
            name=dep.name,
            age=dep.age,
            salary_yen=dep.salary_yen,
            other_income_yen=dep.other_income_yen,
            employment_income_yen=emp_inc,
            total_income_yen=total_inc,
            category="ineligible_over_1230k",
            form_type="対象外",
            deduction_yen=0,
            step_code="OVER_1230K_0",
            is_fuyo_shinzoku=False,
            is_under23_fuyo=False,
            next_cliff_salary_yen=None,
            margin_to_next_cliff_yen=None,
        )

    # Elderly dependent (age >= 70) or general dependent (16..18, 23..69)
    if total_inc <= base_limit:
        cliff_sal = max(0, base_limit + min_ded_base - dep.other_income_yen)
        margin = cliff_sal - dep.salary_yen if dep.salary_yen <= cliff_sal else None
        if dep.age >= 70:
            ded = 580_000 if dep.is_cohabiting_ascendant else 480_000
            cat = "rojin_fuyo_dokyo" if dep.is_cohabiting_ascendant else "rojin_fuyo"
            code = "FUYO_ROJIN_DOKYO_580K" if dep.is_cohabiting_ascendant else "FUYO_ROJIN_480K"
        else:
            ded = 380_000
            cat = "ippan_fuyo"
            code = "FUYO_IPPAN_380K"
        return DependentEvalResult(
            name=dep.name,
            age=dep.age,
            salary_yen=dep.salary_yen,
            other_income_yen=dep.other_income_yen,
            employment_income_yen=emp_inc,
            total_income_yen=total_inc,
            category=cat,
            form_type="扶養控除等申告書",
            deduction_yen=ded,
            step_code=code,
            is_fuyo_shinzoku=True,
            is_under23_fuyo=(dep.age < 23),
            next_cliff_salary_yen=cliff_sal,
            margin_to_next_cliff_yen=margin,
        )

    return DependentEvalResult(
        name=dep.name,
        age=dep.age,
        salary_yen=dep.salary_yen,
        other_income_yen=dep.other_income_yen,
        employment_income_yen=emp_inc,
        total_income_yen=total_inc,
        category="ineligible_income_exceeded",
        form_type="対象外",
        deduction_yen=0,
        step_code="OVER_LIMIT_0",
        is_fuyo_shinzoku=False,
        is_under23_fuyo=False,
        next_cliff_salary_yen=None,
        margin_to_next_cliff_yen=None,
    )


def compute_national_income_tax(
    taxable_income_raw_yen: int,
    housing_loan_credit_yen: int = 0,
) -> tuple[int, int, int, int, int, int]:
    """Compute (rounded_taxable, marginal_rate_pct, base_tax, credit_applied, net_base_tax, annual_tax_yen).

    Applies 所得税法第89条速算表, 1,000円未満切捨て on taxable income, 102.1% 復興特別所得税,
    and 100円未満切捨て on 年調年税額 using exact integer arithmetic.
    """
    _validate_non_negative_int(housing_loan_credit_yen, "housing_loan_credit_yen")
    if taxable_income_raw_yen <= 0:
        return 0, 0, 0, 0, 0, 0

    rounded = (taxable_income_raw_yen // 1_000) * 1_000
    if rounded < 1_000:
        return 0, 0, 0, 0, 0, 0

    base_tax = 0
    marginal_pct = 5
    for upper, permille, quick_ded in INCOME_TAX_BRACKETS:
        if upper is None or rounded <= upper:
            base_tax = (rounded * permille) // 1_000 - quick_ded
            marginal_pct = permille // 10
            break

    credit_applied = min(base_tax, housing_loan_credit_yen)
    net_base_tax = base_tax - credit_applied
    # Exact 102.1% with 100円未満切捨て: floor((net_base_tax * 1021 / 1000) / 100) * 100
    annual_tax = ((net_base_tax * 1021) // 100_000) * 100
    return rounded, marginal_pct, base_tax, credit_applied, net_base_tax, annual_tax


def calculate_household_year_tax(inp: HouseholdTaxInput, tax_year: int = 2026) -> YearTaxBreakdown:
    """Compute complete statutory Year-End Tax Adjustment breakdown for `tax_year` (2026 or 2025)."""
    _validate_tax_year(tax_year)
    _validate_non_negative_int(inp.salary_yen, "salary_yen")
    _validate_non_negative_int(inp.other_income_yen, "other_income_yen")

    dep_results = tuple(evaluate_dependent(d, tax_year=tax_year) for d in inp.dependents)
    has_under23_fuyo = any(r.is_under23_fuyo for r in dep_results)
    has_fuyo_special_disability = any(
        d.is_special_disability and r.is_fuyo_shinzoku for d, r in zip(inp.dependents, dep_results)
    )

    emp_before_adj = compute_employment_income(inp.salary_yen, tax_year=tax_year)
    emp_deduction = inp.salary_yen - emp_before_adj

    # Preliminary spouse check for 同一生計配偶者 special disability eligibility
    sp_emp_pre = compute_employment_income(inp.spouse_salary_yen, tax_year=tax_year) if inp.has_spouse else 0
    sp_doitsu_pre = inp.has_spouse and ((sp_emp_pre + inp.spouse_other_income_yen) <= fuyo_income_limit(tax_year))
    adj_eligible = (
        inp.is_self_special_disability
        or has_under23_fuyo
        or has_fuyo_special_disability
        or (sp_doitsu_pre and inp.spouse_is_special_disability)
    )
    inc_adj_ded = compute_income_adjustment_deduction(inp.salary_yen, is_eligible=adj_eligible)
    emp_income = max(0, emp_before_adj - inc_adj_ded)
    total_income = emp_income + inp.other_income_yen

    basic_ded, basic_tier = compute_basic_deduction(
        total_income,
        tax_year=tax_year,
        is_resident=inp.is_resident,
    )

    spouse_res = evaluate_spouse_deduction(
        has_spouse=inp.has_spouse,
        taxpayer_total_income_yen=total_income,
        spouse_salary_yen=inp.spouse_salary_yen,
        spouse_other_income_yen=inp.spouse_other_income_yen,
        spouse_age=inp.spouse_age,
        tax_year=tax_year,
    )

    fuyo_total = sum(r.deduction_yen for r in dep_results if r.is_fuyo_shinzoku)
    tokutei_shinzoku_total = sum(
        r.deduction_yen for r in dep_results if r.category == "tokutei_shinzoku_tokubetsu"
    )

    # ひとり親控除 (R8: 350,000 when total_income <= 5,000,000; note 380,000 applies from R9!)
    hitori_or_kafu = 0
    if inp.is_hitori_oya and total_income <= 5_000_000:
        hitori_or_kafu = 350_000
    elif inp.is_kafu and total_income <= 5_000_000:
        hitori_or_kafu = 270_000

    # 勤労学生控除 (R8: total_income <= 890,000; R7: <= 850,000 -> 270,000)
    kinro_limit = 890_000 if tax_year == 2026 else 850_000
    kinro_ded = 270_000 if (inp.is_kinro_gakusei and total_income <= kinro_limit) else 0

    # 障害者控除 (特別障害者 400,000; 同居特別障害者 simplification 400,000)
    disability_ded = 0
    if inp.is_self_special_disability:
        disability_ded += 400_000
    if spouse_res.is_doitsu_seikei_spouse and inp.spouse_is_special_disability:
        disability_ded += 400_000
    for d, r in zip(inp.dependents, dep_results):
        if d.is_special_disability and r.is_fuyo_shinzoku:
            disability_ded += 400_000

    if inp.social_insurance_yen is None:
        soc_ins = estimate_social_insurance_yen(inp.salary_yen)
        soc_est = True
    else:
        soc_ins = _validate_non_negative_int(inp.social_insurance_yen, "social_insurance_yen")
        soc_est = False

    # R8 expansion: general new life insurance cap rises from 40,000 to 60,000 with under-23 fuyo (total 120,000 cap)
    life_general_cap = 60_000 if (tax_year == 2026 and has_under23_fuyo) else 40_000
    life_ded = min(_validate_non_negative_int(inp.life_insurance_deduction_yen, "life_insurance_deduction_yen"), 120_000)
    eq_ded = min(_validate_non_negative_int(inp.earthquake_insurance_deduction_yen, "earthquake_insurance_deduction_yen"), 50_000)
    ideco_ded = _validate_non_negative_int(inp.ideco_small_enterprise_yen, "ideco_small_enterprise_yen")
    other_stat_ded = life_ded + eq_ded + ideco_ded

    total_deductions = (
        soc_ins
        + basic_ded
        + spouse_res.deduction_yen
        + fuyo_total
        + tokutei_shinzoku_total
        + hitori_or_kafu
        + kinro_ded
        + disability_ded
        + other_stat_ded
    )

    taxable_raw = max(0, total_income - total_deductions)
    rounded_taxable, marginal_pct, base_tax, credit_applied, net_base_tax, annual_tax = (
        compute_national_income_tax(taxable_raw, housing_loan_credit_yen=inp.housing_loan_credit_yen)
    )

    withheld = _validate_non_negative_int(inp.withheld_tax_yen, "withheld_tax_yen")
    refund_or_due = withheld - annual_tax
    net_take_home = inp.salary_yen - soc_ins - annual_tax

    return YearTaxBreakdown(
        tax_year=tax_year,
        salary_yen=inp.salary_yen,
        employment_income_before_adj_yen=emp_before_adj,
        employment_deduction_yen=emp_deduction,
        income_adjustment_deduction_yen=inc_adj_ded,
        employment_income_yen=emp_income,
        other_income_yen=inp.other_income_yen,
        total_income_yen=total_income,
        social_insurance_yen=soc_ins,
        social_insurance_estimated=soc_est,
        basic_deduction_yen=basic_ded,
        basic_deduction_tier=basic_tier,
        spouse_result=spouse_res,
        dependent_results=dep_results,
        fuyo_deduction_total_yen=fuyo_total,
        tokutei_shinzoku_deduction_total_yen=tokutei_shinzoku_total,
        hitori_oya_or_kafu_deduction_yen=hitori_or_kafu,
        kinro_gakusei_deduction_yen=kinro_ded,
        disability_deduction_yen=disability_ded,
        other_statutory_deductions_yen=other_stat_ded,
        total_income_deductions_yen=total_deductions,
        taxable_income_raw_yen=taxable_raw,
        taxable_income_rounded_yen=rounded_taxable,
        marginal_rate_percent=marginal_pct,
        base_income_tax_yen=base_tax,
        housing_loan_credit_applied_yen=credit_applied,
        net_base_tax_yen=net_base_tax,
        annual_tax_yen=annual_tax,
        withheld_tax_yen=withheld,
        year_end_refund_or_due_yen=refund_or_due,
        estimated_net_take_home_yen=net_take_home,
        life_insurance_general_cap_yen=life_general_cap,
    )


def compare_r8_vs_r7(inp: HouseholdTaxInput) -> dict[str, Any]:
    """Side-by-side statutory comparison of Reiwa 8 (2026) vs Reiwa 7 (2025) for the same household."""
    r8 = calculate_household_year_tax(inp, tax_year=2026)
    r7 = calculate_household_year_tax(inp, tax_year=2025)
    return {
        "r8_2026": r8.to_dict(),
        "r7_2025": r7.to_dict(),
        "delta": {
            "employment_deduction_diff_yen": r8.employment_deduction_yen - r7.employment_deduction_yen,
            "basic_deduction_diff_yen": r8.basic_deduction_yen - r7.basic_deduction_yen,
            "spouse_deduction_diff_yen": r8.spouse_result.deduction_yen - r7.spouse_result.deduction_yen,
            "fuyo_deduction_diff_yen": r8.fuyo_deduction_total_yen - r7.fuyo_deduction_total_yen,
            "tokutei_shinzoku_diff_yen": (
                r8.tokutei_shinzoku_deduction_total_yen - r7.tokutei_shinzoku_deduction_total_yen
            ),
            "total_deductions_diff_yen": r8.total_income_deductions_yen - r7.total_income_deductions_yen,
            "annual_tax_savings_yen": r7.annual_tax_yen - r8.annual_tax_yen,
            "take_home_gain_yen": r8.estimated_net_take_home_yen - r7.estimated_net_take_home_yen,
        },
    }


def simulate_wall_checkpoints(
    base_inp: HouseholdTaxInput,
    *,
    target: str = "child",
    checkpoints_yen: tuple[int, ...] = (
        1_030_000,
        1_230_000,
        1_360_000,
        1_500_000,
        1_590_000,
        1_690_000,
        1_780_000,
        1_880_000,
        1_970_000,
        2_070_000,
    ),
) -> list[dict[str, Any]]:
    """Simulate statutory deductions, parent/taxpayer tax savings, and own tax across key wall checkpoints."""
    rows: list[dict[str, Any]] = []
    baseline_no_target_inp: HouseholdTaxInput
    if target == "child":
        other_deps = tuple(d for idx, d in enumerate(base_inp.dependents) if idx > 0)
        baseline_no_target_inp = HouseholdTaxInput(
            salary_yen=base_inp.salary_yen,
            other_income_yen=base_inp.other_income_yen,
            social_insurance_yen=base_inp.social_insurance_yen,
            life_insurance_deduction_yen=base_inp.life_insurance_deduction_yen,
            earthquake_insurance_deduction_yen=base_inp.earthquake_insurance_deduction_yen,
            ideco_small_enterprise_yen=base_inp.ideco_small_enterprise_yen,
            is_hitori_oya=base_inp.is_hitori_oya,
            is_kafu=base_inp.is_kafu,
            is_kinro_gakusei=base_inp.is_kinro_gakusei,
            is_self_special_disability=base_inp.is_self_special_disability,
            housing_loan_credit_yen=base_inp.housing_loan_credit_yen,
            withheld_tax_yen=base_inp.withheld_tax_yen,
            is_resident=base_inp.is_resident,
            has_spouse=base_inp.has_spouse,
            spouse_age=base_inp.spouse_age,
            spouse_salary_yen=base_inp.spouse_salary_yen,
            spouse_other_income_yen=base_inp.spouse_other_income_yen,
            spouse_is_special_disability=base_inp.spouse_is_special_disability,
            dependents=other_deps,
        )
    else:
        baseline_no_target_inp = HouseholdTaxInput(
            salary_yen=base_inp.salary_yen,
            other_income_yen=base_inp.other_income_yen,
            social_insurance_yen=base_inp.social_insurance_yen,
            life_insurance_deduction_yen=base_inp.life_insurance_deduction_yen,
            earthquake_insurance_deduction_yen=base_inp.earthquake_insurance_deduction_yen,
            ideco_small_enterprise_yen=base_inp.ideco_small_enterprise_yen,
            is_hitori_oya=base_inp.is_hitori_oya,
            is_kafu=base_inp.is_kafu,
            is_kinro_gakusei=base_inp.is_kinro_gakusei,
            is_self_special_disability=base_inp.is_self_special_disability,
            housing_loan_credit_yen=base_inp.housing_loan_credit_yen,
            withheld_tax_yen=base_inp.withheld_tax_yen,
            is_resident=base_inp.is_resident,
            has_spouse=False,
            dependents=base_inp.dependents,
        )

    baseline_r8 = calculate_household_year_tax(baseline_no_target_inp, tax_year=2026)

    for sal in checkpoints_yen:
        if target == "self":
            step_inp = HouseholdTaxInput(
                salary_yen=sal,
                other_income_yen=base_inp.other_income_yen,
                social_insurance_yen=None,
                life_insurance_deduction_yen=base_inp.life_insurance_deduction_yen,
                earthquake_insurance_deduction_yen=base_inp.earthquake_insurance_deduction_yen,
                ideco_small_enterprise_yen=base_inp.ideco_small_enterprise_yen,
                is_hitori_oya=base_inp.is_hitori_oya,
                is_kafu=base_inp.is_kafu,
                is_kinro_gakusei=base_inp.is_kinro_gakusei,
                is_self_special_disability=base_inp.is_self_special_disability,
                housing_loan_credit_yen=base_inp.housing_loan_credit_yen,
                withheld_tax_yen=0,
                is_resident=base_inp.is_resident,
                has_spouse=base_inp.has_spouse,
                spouse_age=base_inp.spouse_age,
                spouse_salary_yen=base_inp.spouse_salary_yen,
                spouse_other_income_yen=base_inp.spouse_other_income_yen,
                spouse_is_special_disability=base_inp.spouse_is_special_disability,
                dependents=base_inp.dependents,
            )
            r8 = calculate_household_year_tax(step_inp, tax_year=2026)
            r7 = calculate_household_year_tax(step_inp, tax_year=2025)
            rows.append(
                {
                    "checkpoint_salary_yen": sal,
                    "target_total_income_r8_yen": r8.total_income_yen,
                    "deduction_category_r8": r8.basic_deduction_tier,
                    "deduction_r8_yen": r8.basic_deduction_yen,
                    "deduction_r7_yen": r7.basic_deduction_yen,
                    "household_annual_tax_r8_yen": r8.annual_tax_yen,
                    "household_annual_tax_r7_yen": r7.annual_tax_yen,
                    "tax_savings_vs_r7_yen": r7.annual_tax_yen - r8.annual_tax_yen,
                    "own_income_tax_r8_yen": r8.annual_tax_yen,
                    "estimated_take_home_r8_yen": r8.estimated_net_take_home_yen,
                }
            )
            continue

        if target == "spouse":
            step_inp = HouseholdTaxInput(
                salary_yen=base_inp.salary_yen,
                other_income_yen=base_inp.other_income_yen,
                social_insurance_yen=base_inp.social_insurance_yen,
                life_insurance_deduction_yen=base_inp.life_insurance_deduction_yen,
                earthquake_insurance_deduction_yen=base_inp.earthquake_insurance_deduction_yen,
                ideco_small_enterprise_yen=base_inp.ideco_small_enterprise_yen,
                is_hitori_oya=base_inp.is_hitori_oya,
                is_kafu=base_inp.is_kafu,
                is_kinro_gakusei=base_inp.is_kinro_gakusei,
                is_self_special_disability=base_inp.is_self_special_disability,
                housing_loan_credit_yen=base_inp.housing_loan_credit_yen,
                withheld_tax_yen=base_inp.withheld_tax_yen,
                is_resident=base_inp.is_resident,
                has_spouse=True,
                spouse_age=base_inp.spouse_age,
                spouse_salary_yen=sal,
                spouse_other_income_yen=base_inp.spouse_other_income_yen,
                spouse_is_special_disability=base_inp.spouse_is_special_disability,
                dependents=base_inp.dependents,
            )
            r8 = calculate_household_year_tax(step_inp, tax_year=2026)
            r7 = calculate_household_year_tax(step_inp, tax_year=2025)
            own_r8 = calculate_household_year_tax(HouseholdTaxInput(salary_yen=sal), tax_year=2026)
            rows.append(
                {
                    "checkpoint_salary_yen": sal,
                    "target_total_income_r8_yen": r8.spouse_result.spouse_total_income_yen,
                    "deduction_category_r8": r8.spouse_result.category,
                    "deduction_r8_yen": r8.spouse_result.deduction_yen,
                    "deduction_r7_yen": r7.spouse_result.deduction_yen,
                    "household_annual_tax_r8_yen": r8.annual_tax_yen,
                    "household_annual_tax_r7_yen": r7.annual_tax_yen,
                    "taxpayer_tax_reduction_r8_yen": baseline_r8.annual_tax_yen - r8.annual_tax_yen,
                    "tax_savings_vs_r7_yen": r7.annual_tax_yen - r8.annual_tax_yen,
                    "own_income_tax_r8_yen": own_r8.annual_tax_yen,
                    "estimated_take_home_r8_yen": own_r8.estimated_net_take_home_yen,
                }
            )
            continue

        # Default target == "child" (19-22yo student child as first dependent)
        base_child = base_inp.dependents[0] if base_inp.dependents else DependentInput(name="大学生の子", age=20)
        child_age = base_child.age if 19 <= base_child.age < 23 else 20
        updated_child = DependentInput(
            name=base_child.name,
            age=child_age,
            salary_yen=sal,
            other_income_yen=base_child.other_income_yen,
            is_cohabiting_ascendant=base_child.is_cohabiting_ascendant,
            is_special_disability=base_child.is_special_disability,
        )
        other_deps = tuple(d for idx, d in enumerate(base_inp.dependents) if idx > 0)
        step_inp = HouseholdTaxInput(
            salary_yen=base_inp.salary_yen,
            other_income_yen=base_inp.other_income_yen,
            social_insurance_yen=base_inp.social_insurance_yen,
            life_insurance_deduction_yen=base_inp.life_insurance_deduction_yen,
            earthquake_insurance_deduction_yen=base_inp.earthquake_insurance_deduction_yen,
            ideco_small_enterprise_yen=base_inp.ideco_small_enterprise_yen,
            is_hitori_oya=base_inp.is_hitori_oya,
            is_kafu=base_inp.is_kafu,
            is_kinro_gakusei=base_inp.is_kinro_gakusei,
            is_self_special_disability=base_inp.is_self_special_disability,
            housing_loan_credit_yen=base_inp.housing_loan_credit_yen,
            withheld_tax_yen=base_inp.withheld_tax_yen,
            is_resident=base_inp.is_resident,
            has_spouse=base_inp.has_spouse,
            spouse_age=base_inp.spouse_age,
            spouse_salary_yen=base_inp.spouse_salary_yen,
            spouse_other_income_yen=base_inp.spouse_other_income_yen,
            spouse_is_special_disability=base_inp.spouse_is_special_disability,
            dependents=(updated_child,) + other_deps,
        )
        r8 = calculate_household_year_tax(step_inp, tax_year=2026)
        r7 = calculate_household_year_tax(step_inp, tax_year=2025)
        child_res_r8 = r8.dependent_results[0]
        child_res_r7 = r7.dependent_results[0]
        own_r8 = calculate_household_year_tax(
            HouseholdTaxInput(salary_yen=sal, social_insurance_yen=0 if sal < 1_300_000 else None),
            tax_year=2026,
        )
        rows.append(
            {
                "checkpoint_salary_yen": sal,
                "target_total_income_r8_yen": child_res_r8.total_income_yen,
                "deduction_category_r8": child_res_r8.category,
                "form_type_r8": child_res_r8.form_type,
                "step_code_r8": child_res_r8.step_code,
                "deduction_r8_yen": child_res_r8.deduction_yen,
                "deduction_r7_yen": child_res_r7.deduction_yen,
                "household_annual_tax_r8_yen": r8.annual_tax_yen,
                "household_annual_tax_r7_yen": r7.annual_tax_yen,
                "taxpayer_tax_reduction_r8_yen": baseline_r8.annual_tax_yen - r8.annual_tax_yen,
                "tax_savings_vs_r7_yen": r7.annual_tax_yen - r8.annual_tax_yen,
                "own_income_tax_r8_yen": own_r8.annual_tax_yen,
                "estimated_take_home_r8_yen": own_r8.estimated_net_take_home_yen,
                "combined_family_net_r8_yen": r8.estimated_net_take_home_yen + own_r8.estimated_net_take_home_yen,
            }
        )

    return rows

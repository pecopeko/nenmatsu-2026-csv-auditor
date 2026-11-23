"""CLI for NENMATSUGATE — Reiwa 8 (2026) Year-End Tax Adjustment Simulator & HR CSV Auditor."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Sequence

from .calculator import (
    DependentInput,
    HouseholdTaxInput,
    NenmatsuInputError,
    compare_r8_vs_r7,
    simulate_wall_checkpoints,
)
from .csv_auditor import (
    BatchAuditSummary,
    audit_payroll_csv_bytes,
    audit_payroll_csv_text,
    build_sample_audit_csv,
    export_audit_report_bytes,
)


def _render_batch_text(summary: BatchAuditSummary) -> str:
    lines: list[str] = []
    lines.append(
        "NENMATSUGATE — 令和8年分（2026年分）年末調整 CSV 一括検算レポート "
        f"(施行基準日: {summary.statutory_effective_date}, 文字コード: {summary.detected_encoding})"
    )
    lines.append("=" * 84)
    lines.append(
        f"対象従業員: {summary.total_employees}名 | 適正: {summary.clean_employees}名 | "
        f"要確認・要是正: {summary.flagged_employees}名 "
        f"(重大 {summary.critical_findings_count} / 高 {summary.high_findings_count} / 中 {summary.medium_findings_count})"
    )
    lines.append(
        f"過大徴収（還付漏れ）合計: ¥{summary.total_tax_overpayment_yen:,} | "
        f"徴収不足合計: ¥{summary.total_tax_underpayment_yen:,} | "
        f"令和7年比 法定減税効果合計: ¥{summary.total_r8_vs_r7_tax_relief_yen:,}"
    )
    lines.append("-" * 84)
    for rec in summary.records:
        tag = "PASS" if rec.status == "clean" else ("CRIT" if rec.status == "critical" else "WARN")
        lines.append(
            f"[{tag}] {rec.employee_id} {rec.employee_name} ({rec.department}) | "
            f"年収 ¥{rec.salary_yen:,} | 法定年税額 ¥{rec.statutory_annual_tax_r8_yen:,} "
            f"(申告推計 ¥{rec.declared_estimated_annual_tax_yen:,} / 還付漏れ ¥{rec.tax_overpayment_yen:,})"
        )
        for f in rec.findings:
            lines.append(f"    - [{f.code}] {f.title} (控除差額: {f.deduction_gap_yen:+,}円)")
    return "\n".join(lines)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="nenmatsu-2026-auditor",
        description=(
            "NENMATSUGATE: Reiwa 8 (2026) 178万/136万/197万円の壁 & 特定親族特別控除 "
            "Statutory Calculator and HR Payroll CSV Batch Auditor."
        ),
    )
    parser.add_argument("csv_path", nargs="?", help="Path to HR payroll CSV file (UTF-8, UTF-8-BOM, or Shift-JIS).")
    parser.add_argument("--sample-csv", action="store_true", help="Run audit against the built-in 8-row HR sample CSV.")
    parser.add_argument("--write-sample", help="Write the 8-row sample HR CSV to a file path and exit.")
    parser.add_argument("--simulate", action="store_true", help="Run single-household R8 vs R7 statutory simulation.")
    parser.add_argument("--salary", type=int, default=6_000_000, help="Taxpayer annual salary in yen (for --simulate).")
    parser.add_argument("--spouse-salary", type=int, default=None, help="Spouse annual salary in yen (for --simulate).")
    parser.add_argument("--child-age", type=int, default=20, help="Dependent child age (for --simulate).")
    parser.add_argument("--child-salary", type=int, default=None, help="Dependent child annual salary in yen.")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="Stdout report format.")
    parser.add_argument("--export-csv", help="Write Excel-ready audit CSV report to the given path.")
    parser.add_argument(
        "--export-encoding",
        choices=("utf-8-sig", "utf-8", "cp932"),
        default="utf-8-sig",
        help="Character encoding for --export-csv (default: utf-8-sig with BOM for Excel).",
    )
    parser.add_argument(
        "--fail-on",
        choices=("none", "critical", "any"),
        default="none",
        help="Return exit code 2 when audit findings meet the chosen threshold.",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(list(argv) if argv is not None else None)

    try:
        if args.write_sample:
            out_path = Path(args.write_sample)
            out_path.write_bytes(build_sample_audit_csv().encode("utf-8-sig"))
            print(f"Wrote sample HR payroll CSV to {out_path}")
            return 0

        if args.simulate:
            deps: list[DependentInput] = []
            if args.child_salary is not None:
                deps.append(DependentInput(name="子", age=args.child_age, salary_yen=args.child_salary))
            inp = HouseholdTaxInput(
                salary_yen=args.salary,
                has_spouse=args.spouse_salary is not None,
                spouse_salary_yen=args.spouse_salary or 0,
                dependents=tuple(deps),
            )
            comp = compare_r8_vs_r7(inp)
            checkpoints = simulate_wall_checkpoints(inp, target="child" if deps else "self")
            payload = {"comparison": comp, "wall_checkpoints": checkpoints}
            if args.format == "json":
                print(json.dumps(payload, ensure_ascii=False, indent=2))
            else:
                r8 = comp["r8_2026"]
                r7 = comp["r7_2025"]
                delta = comp["delta"]
                print("NENMATSUGATE — 令和8年分 vs 令和7年分 世帯税額シミュレーション")
                print("=" * 72)
                print(
                    f"本人給与収入: ¥{r8['salary_yen']:,} | 令和8年合計所得: ¥{r8['total_income_yen']:,} "
                    f"(給与所得控除: ¥{r8['employment_deduction_yen']:,})"
                )
                print(
                    f"基礎控除: 令和8年 ¥{r8['basic_deduction_yen']:,} vs 令和7年 ¥{r7['basic_deduction_yen']:,} | "
                    f"特定親族特別控除: ¥{r8['tokutei_shinzoku_deduction_total_yen']:,}"
                )
                print(
                    f"年調年税額: 令和8年 ¥{r8['annual_tax_yen']:,} vs 令和7年 ¥{r7['annual_tax_yen']:,} "
                    f"(減税額: ¥{delta['annual_tax_savings_yen']:,})"
                )
            return 0

        if args.sample_csv:
            summary = audit_payroll_csv_text(build_sample_audit_csv(), detected_encoding="sample-utf8")
        elif args.csv_path:
            raw_bytes = Path(args.csv_path).read_bytes()
            summary = audit_payroll_csv_bytes(raw_bytes)
        else:
            parser.error("Provide a csv_path, --sample-csv, --write-sample, or --simulate.")
            return 1

        if args.export_csv:
            export_bytes = export_audit_report_bytes(summary, encoding=args.export_encoding)
            Path(args.export_csv).write_bytes(export_bytes)

        if args.format == "json":
            print(json.dumps(summary.to_dict(), ensure_ascii=False, indent=2))
        else:
            print(_render_batch_text(summary))

        if args.fail_on == "critical" and summary.critical_findings_count > 0:
            return 2
        if args.fail_on == "any" and summary.flagged_employees > 0:
            return 2
        return 0
    except (NenmatsuInputError, OSError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

# NENMATSUGATE — 令和8年分（2026年分）年末調整 178万・136万・197万円の壁 ＆ 特定親族特別控除 一括CSV検算

- **Live App**: https://pecopeko.github.io/nenmatsu-2026-csv-auditor/
- **Privacy Guarantee**: `<meta http-equiv="Content-Security-Policy" content="... connect-src 'none' ...">` — 100% ブラウザ内完結（外部サーバーへのデータ送信はブラウザエンジンレベルで遮断）
- **Statutory Basis**: 国税庁 (`nta.go.jp`) 令和8年12月1日施行 税制改正（基礎控除最大104万円・給与所得控除最低74万円・扶養要件62万円/136万円・19〜22歳特定親族特別控除9段階63万〜3万円）に1円単位で完全準拠

## 使い方

1. **世帯・手取りシミュレータ**: 本人・配偶者・大学生年代（19〜22歳）の子の給与収入を入力し、令和8年分と令和7年分の控除額・年税額・手取り差額を即時比較します。
2. **経理・労務向け CSV 一括検算**: 給与ソフトから書き出したCSV（UTF-8 / UTF-8 BOM / Shift-JIS 自動判定）をドロップすると、特定親族特別控除の申告漏れ・旧123万円基準ミス・基礎控除104万円区分誤り・11月30日以前退職者の施行日前トラップを自動検出し、Excel用BOM付CSVを出力します。

## ローカルテスト

```bash
node --test ./test/engine.test.mjs
```

## 関連バックオフィス実務ツール

- **BOOTH『経理・バックオフィス自動化オフライン5点セット』（¥1,980）**: https://pecopeko1011.booth.pm/items/9179705
- **Zenn Book『実践ガイド』（¥1,200）**: https://zenn.dev/pecopeko/books/afml-quant-and-local-ai-guard

Apache-2.0 · Crafted by peco

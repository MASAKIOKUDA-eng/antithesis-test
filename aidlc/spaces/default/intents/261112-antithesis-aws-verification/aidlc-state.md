# AI-DLC State — 261112-antithesis-aws-verification

- Intent: Antithesis を AWS 上で検証するための IaC（AWS CDK / cdkd デプロイ）
- Scope: `mvp`（Ideation の Market Research / Team Formation / Rough Mockups は対象外）
- Construction walk: unit-major（Unit ごとに設計 → コード生成）
- Interaction: 非同期（クラウドセッション）。各ゲートは「前提を明記して仮承認」とし、
  人の承認待ち項目は `inception/requirements-analysis/requirements-questions.md` に集約

凡例: `[x]` 完了 / `[S]` スキップ（スコープ外） / `[?]` 人の承認待ち

## Phase 0: Initialization
- [x] 0.1 Workspace Scaffold
- [x] 0.2 Workspace Detection — greenfield（README.md のみ）
- [x] 0.3 State Initialization

## Phase 1: Ideation
- [x] 1.1 Intent Capture & Framing → `ideation/intent-capture/intent-statement.md`
- [S] 1.2 Market Research（添付の解説資料で代替）
- [x] 1.3 Feasibility & Constraints → `ideation/feasibility/feasibility.md`
- [x] 1.4 Scope Definition → `ideation/scope-definition/scope.md`
- [S] 1.5 Team Formation
- [S] 1.6 Rough Mockups（UI なし）
- [?] 1.7 Approval & Handoff → `verification/phase-check-ideation.md`

## Phase 2: Inception
- [S] 2.1 Reverse Engineering（既存コードなし）
- [S] 2.2 Practices Discovery
- [x] 2.3 Requirements Analysis → `inception/requirements-analysis/`
- [S] 2.4 User Stories（利用者は検証担当者 1 種のみ。要件の受け入れ基準で代替）
- [x] 2.6 Units Generation → `inception/units-generation/units.md`
- [x] 2.9 Delivery Planning → `inception/delivery-planning/delivery-plan.md`
- [?] Verification Gate 2 → `verification/phase-check-inception.md`

## Phase 3: Construction
| Unit | 3.1 Functional | 3.2 NFR Req | 3.3 NFR Design | 3.4 Infra Design | 3.5 Code Gen |
| --- | --- | --- | --- | --- | --- |
| U1 sut-harness | [x] | [S]（U2 に集約） | [S] | [S] | [x] |
| U2 aws-pipeline | [S]（U1 の振る舞いを実行するだけ） | [x] | [x] | [x] | [x] |
| U3 ci-integration | [S] | [S] | [S] | [S] | [x] |

- [x] 3.6 Build and Test → `construction/build-and-test/build-and-test.md`
- [x] 3.7 CI Pipeline → `.github/workflows/ci.yml`
- [?] Verification Gate 3 → `verification/phase-check-construction.md`

## Phase 4: Operation
- [x] 4.3 Deployment Execution（手順書のみ。実デプロイは AWS 認証情報が必要なため未実施）
  → `operation/deployment-execution/runbook.md`
- [S] 4.1 / 4.2 / 4.4–4.7（検証環境のため対象外。必要になったら Feedback Loop で追加）

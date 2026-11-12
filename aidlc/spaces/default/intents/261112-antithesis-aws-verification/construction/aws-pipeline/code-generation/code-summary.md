# U2 Code Generation Summary

| パス | 内容 |
| --- | --- |
| `infra/bin/app.ts` | App。cdk-nag（AwsSolutions）を Validations プラグインとして登録 |
| `infra/lib/config.ts` | context の読み込みと検証（不正値は synth で失敗） |
| `infra/lib/feature-flags.ts` | CDK フィーチャーフラグ |
| `infra/lib/antithesis-verification-stack.ts` | スタック本体、cdk-nag の個別承認（理由付き） |
| `infra/buildspec/buildspec.yml` | CodeBuild の処理（synth 時に埋め込み） |
| `infra/test/stack.test.ts` | セキュリティ基準・モード切替・OIDC・cdk-nag・入力検証のテスト |

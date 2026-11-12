# CI/CD の設定と運用

このリポジトリを運用する開発者向けの手順。CI はローカルと同じツールで検査し、CD は検査済みの ZIP を AWS へ配置する。Plan・Apply は CodeBuild の GitHub Actions ランナーで実行し、AWS 認証にはサービスロールを使う。Identity Center、OIDC Provider、GitHub に保存する長期 AWS アクセスキーは不要。

1. ローカルの Terraform CLI は `direnv allow` または `nix develop` で用意する。
2. Terraform Cloud の `KenyYahat` 組織に Workspace を用意し、実行モードを `Local` にする。
3. CodeBuild とサービスロールを作り、既存 state を移行してから GitHub の `production-plan` と `production` Environment を設定する。
4. `main` にマージして生成された plan をレビューし、GitHub の `Approve and deploy` で承認する。

初回は「Terraform Cloud の準備」から「GitHub の設定」まで順に実施する。日々の検査・更新・復旧は後半を参照する。Terraform Cloud・AWS・GitHub の設定変更、state の移行、実デプロイは、この実装作業では実行していない。

## 検査とデプロイの流れ

| 起点・ジョブ | 処理 |
| --- | --- |
| PR・merge queue・手動 CI | CI を実行。AWS と Terraform Cloud の認証情報は渡さない |
| Web の並列ジョブ | Biome lint、format、TypeScript typecheck、Vitest、pnpm audit |
| ARM64 ビルド | 本番ビルド、配布パッケージ単独起動テスト、AWS 用 ZIP と `dist` の保存 |
| ビルド後の E2E | 同じ `dist` をダウンロードし、Playwright で検査 |
| Terraform の並列ジョブ | アプリと初期設定の各構成で fmt、init、validate、モック test |
| インフラ検査 | デプロイスクリプトのテスト、TFLint、Trivy による設定の監査 |
| Secret 検査 | Gitleaks で取得した Git 履歴全体を検査。出力はマスク |
| CI 設定の検査 | actionlint、ShellCheck、shfmt、nixfmt、statix、`actions.lock` の整合性・取得元の検証 |
| `main` の push・手動 `Deploy AWS` | 同じ CI を呼び出し、全検査の成功後に `production-plan` で plan を生成 |
| `Apply reviewed plan` | `production` の Required reviewers による承認を待ち、保存済み plan を適用 |

`Deploy AWS`（`.github/workflows/deploy.yml`）の中で、Plan と Apply を別ジョブに分けている。CI は GitHub-hosted runner、Plan は CodeBuild の `typign-plan`、Apply は `typign-apply` で実行する。Plan の成功後、Apply は `production` Environment の承認を待つ。承認後に同じコミットを checkout し、その run の ZIP と保存済み plan を取得する。再ビルドや plan の再生成は行わない。適用後は `/health` とトップページへの HTTP アクセスを確認する。

CI・Plan・承認待ち・Apply を含む workflow 全体を `concurrency` で直列化し、実行中の apply を後続 push でキャンセルしない。GitHub の concurrency は実行順を保証せず、待機中の古い run が新しい run に置き換わる場合がある。state の保存とロックは Terraform Cloud が管理する。state はアップロードしない。Web の成果物、失敗時の E2E 結果、保存済み plan の ZIP、レビュー用テキストは7日間保持する。

### plan をレビューして適用する

1. Actions の `Deploy AWS` で `Plan production` が成功したら、対象コミットを確認する。
2. 実行サマリーの `Open the plan review` を開き、ブラウザで追加・変更・削除を確認する。レビュー用 artifact 名は `terraform-plan-review-<run attempt>.txt`。同じサマリーから保存済み plan の ZIP（`terraform-plan-<run ID>-<run attempt>-<commit SHA>`）も取得できる。
3. 同じ workflow run の `Review deployments` を開き、`production` を選んで `Approve and deploy` を押す。適用を見送る場合は `Reject` を選ぶ。
4. Apply の結果と HTTP 検査を確認する。

run ID や SHA256 の入力は不要。Plan ジョブが出力した SHA256 と artifact ID を Apply ジョブへ直接渡す。Apply は復号後の plan SHA256、生成元コミット・run ID・リポジトリ、ZIP の SHA256、Terraform の版、生成から7日以内であることを検証してから適用する。state が更新されて plan が古くなった場合は Terraform も適用を拒否する。期限切れや state 更新時は `Deploy AWS` を再実行し、新しく生成された plan のレビューと承認をやり直す。

承認待ちの間は後続のデプロイも待機する。古い run を適用しない場合は、その run を Reject または Cancel してから次の run を進める。

plan バイナリには sensitive な値も含まれるため、共通 secret `TF_PLAN_PASSPHRASE` を使い GPG / AES256 で暗号化する。平文の plan は一時ディレクトリにだけ置き、終了時に削除する。`review.txt` は `terraform show -no-color` の出力で、sensitive と指定された値はマスクされる。ただし、sensitive と指定されていない設定値は表示されるため、レビュー用ファイルも公開・転送しない。[保存 plan の仕様](https://developer.hashicorp.com/terraform/cli/commands/plan)を参照する。

承認者は `production` の Required reviewers に登録する。自分の変更を自分で承認する運用では `Prevent self-review` を無効にする。第三者の承認を必須にする場合は有効にする。管理者による承認の迂回を認めない場合は、管理者の保護ルール回避も無効にする。[GitHub の承認操作](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments)を参照する。

## ローカルで同じ検査を実行する

`flake.lock` と各ツールの定義はローカル・CI で共通。CI は必要な shell だけを取得し、Nix store と pnpm store をキャッシュする。Nix cache の保存は `main` の push に限定する。

| shell | 含めるツール |
| --- | --- |
| `default` | Terraform 1.17.1と開発・検査用ツール全体。`direnv allow` または `nix develop` で利用 |
| `ci-web` | Node.js、pnpm、Biome、jq、curl、zip、GNUのファイル・テキスト操作ツール、dash |
| `ci-infra` | TFLint、Trivy、デプロイ検証用のGNUツール、dash、jq、GnuPG |
| `ci-security` | Gitleaks、Git |
| `ci-workflows` | actionlint、ShellCheck、shfmt、nixfmt、statix、GitHub CLI、gh-actions-lock |
| `ci-deploy` | AWS CLI v2、curl、unzip、GNU coreutils、GitHub CLI、jq、GnuPG |

Terraform 本体はローカル用の `default` shell にだけ含める。`nix/terraform.nix` が `.terraform-version` を読み、公式の1.17.1バイナリをOS・CPUごとのSHA256で検証して導入する。CI用の shell には含めず、`hashicorp/setup-terraform` が同じ `.terraform-version` を読んで導入する。Terraformのライセンス許可は、このパッケージに限定している。

Node.js は `app/.node-version` の 24.21.0。固定済み nixpkgs の Node を使い、指定した版との一致を Nix の評価時に検査する。Linux では公式 ELF の独自加工によるクラッシュを避けるため、nixpkgs のビルドとバイナリキャッシュを使う。pnpm は `app/package.json` と flake の両方で 11.11.0 を指定し、CI が一致を検査する。Playwright の Chromium は pnpm lockfile に従い、Linux で必要なシステムライブラリは `playwright install --with-deps` で用意する。

```sh
nix develop .#ci-web
pnpm --dir app install --frozen-lockfile
pnpm --dir app lint
pnpm --dir app format:check
pnpm --dir app typecheck
pnpm --dir app test
nix develop .#ci-infra --command sh infra/tests/scripts/deploy.test.sh
nix develop .#ci-infra --command sh infra/tests/scripts/check-approval.test.sh
pnpm --dir app build
pnpm --dir app test:package
pnpm --dir app exec playwright install chromium
pnpm --dir app test:e2e
pnpm --dir app run audit
```

整形を反映するときは `pnpm --dir app format` を使う。Web は `app/biome.json` の対象ファイルを検査する。`pnpm --dir app audit` は pnpm 組み込みコマンドで、CI と同じ high 以上の失敗条件を使うには `pnpm --dir app run audit` を実行する。

アプリのスクリプトは `app/scripts/`、そのテストは `app/tests/scripts/` に置く。デプロイのスクリプトとテストは `infra/scripts/` と `infra/tests/scripts/` に置き、すべてPOSIX shで実行する。本番サーバーは `app/src/server/index.ts` に置き、`pnpm --dir app build` が `app/dist/index.js` へコンパイルする。配布ファイルの選択と本番依存の準備は `app/scripts/lib/package.sh` に共通化し、ZIP 作成と起動テストから呼び出す。

```sh
nix develop .#ci-workflows --command shellcheck --shell=sh app/scripts/*.sh app/scripts/lib/*.sh app/tests/scripts/*.sh infra/scripts/*.sh infra/tests/scripts/*.sh infra/tests/scripts/fixtures/*.sh
nix develop .#ci-workflows --command shfmt -ln posix -i 2 -d app/scripts app/tests/scripts infra/scripts infra/tests/scripts
# sh の整形を反映するときは shfmt の -d を -w に変更する。
```

```sh
nix develop .#ci-infra --command tflint --chdir=infra --recursive --config="$PWD/infra/.tflint.hcl"
nix develop .#ci-infra --command trivy config --exit-code 1 --severity HIGH,CRITICAL \
  --skip-files '**/*.tfplan' --skip-files '**/*.tfstate*' infra
nix develop .#ci-security --command gitleaks git --redact --log-opts=--all .
nix develop .#ci-workflows --command actionlint
nix develop .#ci-workflows --command nixfmt --check flake.nix nix/*.nix
nix develop .#ci-workflows --command statix check .
```

Terraform の検査は、ローカルのデプロイ用ディレクトリとは別の、認証情報・tfvars・state を置かない checkout で行う。`init -backend=false` で Terraform Cloud の初期化を無効にし、AWS Provider はテスト内でモックに置き換える。CI に Terraform Cloud のトークンは不要。

```sh
terraform -chdir=infra init -backend=false -input=false -lockfile=readonly
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
terraform -chdir=infra test
# infra/bootstrap に対しても同じ4コマンドを実行する。
```

## Terraform Cloud の準備

state は Terraform Cloud（現在の名称は HCP Terraform）に保存する。Terraform CLI は 1.17.1 に固定し、`cloud` ブロックで次の Workspace を指定している。

| 構成 | Organization | Workspace | 実行する場所 |
| --- | --- | --- | --- |
| `infra/` | `KenyYahat` | `typign` | GitHub Actions または開発者の端末 |
| `infra/bootstrap/` | `KenyYahat` | `typign-bootstrap` | 管理者の端末 |

1. `KenyYahat` 組織に、CLI-driven workflow の Workspace `typign` と `typign-bootstrap` を作る。
2. 両方の Settings → General → Execution Mode を `Local` に設定する。
3. Workspace の Terraform version も 1.17.1 に揃える。
4. ローカルで `terraform login` を実行し、Terraform Cloud に認証する。

`Local` は、plan/apply を CLI の実行元で動かし、state を Terraform Cloud へ保存するモード。CD では GitHub Actions 上で AWS の一時認証情報と検査済み ZIP を使うため、このモードにする。Remote モードでは実行場所が Terraform Cloud 側へ移り、Actions の認証情報やローカルの ZIP はそのまま利用できない。[実行モードの公式仕様](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/settings#execution-mode)を参照する。

Local モードでは Terraform Cloud の Workspace variables は評価されない。CD の入力値は引き続き GitHub Environment と `TF_VAR_*` から渡す。GitHub でデプロイを管理するため、同じ Workspace で VCS の自動 apply は有効にしない。

CD 用には `typign` の state の読み書きとロックを許可した API トークンを用意し、GitHub の両 Environment の secret `TF_API_TOKEN` に登録する。workflow はデプロイステップにだけ `TF_TOKEN_app_terraform_io` として渡す。`typign-bootstrap` へのアクセスは管理者が使うトークンに限定し、CD 用トークンには付けない。[自動実行の認証方法](https://developer.hashicorp.com/terraform/tutorials/automation/automate-terraform)も参照する。

## AWS の初期設定

### Identity Center を使わずにローカルで認証する

初期設定を行う IAM ユーザーまたは既存のフェデレーションロールで、AWS コンソールへサインインできることを確認する。AWS CLI 2.32.0 以降の `aws login` はコンソールの認証から一時認証情報を取得できる。利用主体には `SignInLocalDevelopmentAccess` と初期設定するリソースの管理権限が必要。[AWS の公式手順](https://docs.aws.amazon.com/signin/latest/userguide/command-line-sign-in.html)を参照する。

Terraform の Provider・backend からも使えるよう、AWS CLI を呼ぶ認証プロファイルを作る。認証情報そのものは設定ファイルに書かない。

```sh
nix develop .#ci-deploy
aws login --profile typign-console --region ap-northeast-1
aws configure set region ap-northeast-1 --profile typign
aws configure set credential_process \
  'aws configure export-credentials --profile typign-console --format process' \
  --profile typign
export AWS_PROFILE=typign
aws sts get-caller-identity
```

ブラウザを開けない環境では `aws login --remote` を使える。セッション期限が切れたら `aws login --profile typign-console` で更新する。CD ではこのプロファイルを使わず、CodeBuild のサービスロールから一時認証情報を取得する。

### CodeBuild ランナーを作る

`infra/bootstrap/` は、Plan・Apply 用の CodeBuild プロジェクト、各サービスロール、ロググループ、GitHub webhook を作る。通常の CD ではこの構成を apply せず、初回と初期設定を変更するときに管理者が実行する。OIDC Provider は作成しない。

1. 対象リージョンの CodeBuild コンソールで GitHub の既定ソース認証を設定する。GitHub OAuth App で接続し、`yahatapp/typign` にアクセスを許可する。Terraform の webhook 作成前に接続を済ませる。OAuth 認証情報は Terraform で作成・保存しない。
2. GitHub 接続には repository webhook の作成、Actions runner の登録、Actions と Deployments の読み取り権限を許可する。承認待ちを正しく扱うため、Actions・Deployments の参照権限も必要。[CodeBuild の公式手順](https://docs.aws.amazon.com/codebuild/latest/userguide/action-runner.html)と[承認待ちの注意点](https://docs.aws.amazon.com/codebuild/latest/userguide/action-runner-troubleshoot-webhook.html)を参照する。
3. tfvars を設定し、bootstrap を適用する。

```sh
# 初回のみコピー。既存の tfvars は上書きしない。
cp infra/bootstrap/terraform.tfvars.example infra/bootstrap/terraform.tfvars
# CD を起動するユーザーの数値 ID。組織 ID やログイン名ではない。
gh api user --jq .id
```

`aws_account_id`、`aws_region`、`github_repository`、`function_name` を実環境に合わせ、`allowed_github_actor_ids` に数値ユーザー ID を文字列で登録する。main への push や手動実行を行うユーザーが複数いる場合は全員を列挙する。未登録のユーザー・bot の起動は webhook で拒否され、ジョブが待機する。

```sh
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan -out=bootstrap.tfplan
terraform -chdir=infra/bootstrap show -no-color bootstrap.tfplan
# 差分を確認してから実行。保存 plan の apply は追加確認なしで進む。
terraform -chdir=infra/bootstrap apply bootstrap.tfplan
terraform -chdir=infra/bootstrap output
```

- `typign-plan` のロールはアプリの AWS リソースを読み取る。`typign-apply` のロールがデプロイ権限を持つ。両ロールの信頼条件は CodeBuild サービス、対象アカウント、対応するプロジェクト ARN に限定する。
- webhook は `WORKFLOW_JOB_QUEUED`、workflow 名 `Deploy AWS`、許可したユーザー ID のすべてに一致する場合だけ起動する。`HEAD_REF` はこのイベントで利用できないため、ブランチは webhook で制限しない。`main` の制限は workflow の push 条件・両ジョブの `if` と、両 Environment の Deployment branches で行う。公開リポジトリの PR 検査には AWS 権限を持つランナーを使わない。workflow 名やプロジェクト名を変える場合は Terraform と YAML を合わせる。
- GitHub 側で `main` の変更をレビュー対象とし、承認者は `production` に設定する。CodeBuild の実行ロールは GitHub の承認機能とは別に AWS 権限を管理する。
- Nix は CodeBuild コンテナ内で single-user モード、sandbox 無効で実行する。ツールは従来どおり flake、Terraform は `setup-terraform` で固定する。コンテナごとの checkout パスが異なるため、Plan・Apply は同じ `/tmp/typign-release` へファイルを配置して実行する。
- bootstrap の state は `KenyYahat / typign-bootstrap`。CodeBuild の実課金・利用枠、プロジェクトアカウント固有の SCP、OAuth 接続・ジョブの実行は実環境で確認する。

既に OIDC 版の bootstrap を実行した場合は、同じ Workspace の state を維持する。古い `create_oidc_provider` は tfvars から削除し、`allowed_github_actor_ids` を追加して plan を作り直す。失敗した apply でも一部リソースが作成済みの場合があるため、state を削除したり、以前の plan を再適用したりしない。既存の `typign-github-deploy` ロールは同じ Terraform アドレスで管理し、信頼先を CodeBuild に更新する。

### 既存 state を Terraform Cloud へ移行する

既存のローカル state を使っている場合、デプロイを止め、元の checkout でバックアップしてから `terraform init` を実行する。移行先の `KenyYahat / typign` に別の環境の state がないことも確認する。

```sh
# 既存のローカル state がある場合だけ実行する。
mkdir -p "$HOME/.local/state/typign"
cp -p infra/terraform.tfstate "$HOME/.local/state/typign/terraform.tfstate.before-cloud"
chmod 600 "$HOME/.local/state/typign/terraform.tfstate.before-cloud"

terraform login
terraform -chdir=infra init
terraform -chdir=infra state list
```

`init` で既存 state のコピーを確認されたら、移行先が `KenyYahat / typign` であることを確認して進める。Cloud への移行では `-backend-config` や `-migrate-state` を追加しない。`.terraform/` には移行元の情報があるため、移行前に削除しない。[公式の移行手順](https://developer.hashicorp.com/terraform/cli/cloud/settings#migrate-state-data)を参照する。

既に S3 backend を利用している場合も、元の backend を初期化した checkout と AWS 認証を維持し、`terraform state pull` でバックアップしてから `terraform init` の案内に従う。新規環境にはコピーする state がないため、そのまま初期化できる。

`infra/bootstrap/` に既存のローカル state がある場合も、別途バックアップして同じ手順で `typign-bootstrap` へ移行する。`state list` と plan で管理対象が引き継がれたことを確認してから、CD を有効にする。

## GitHub の設定

1. Settings → Environments に `production-plan` と `production` を作る。
2. 両 Environment の Deployment branches を Selected branches にし、`main` だけを許可する。この設定で他ブランチの配置を防ぐ。
3. 両 Environment の variables に次の値を登録する。`FUNCTION_NAME` と `ENDPOINT_NAME` は Plan 側で使い、Apply は保存済みの入力値を使う。
4. `production` の Required reviewers を有効にし、承認者を1人以上登録する。`production-plan` は自動実行用にする。
5. `main` のルールで `CI required` を必須チェックにし、ワークフローの変更もレビュー対象にする。

| Variable | 値 |
| --- | --- |
| `AWS_ACCOUNT_ID` | 配置先の12桁の ID |
| `AWS_REGION` | `ap-northeast-1` など |
| `FUNCTION_NAME` | bootstrap とアプリの `function_name`。既定は `typign-dev` |
| `ENDPOINT_NAME` | 既存環境なら現在の値。既定は `dev` |

両 Environment の secret `TF_API_TOKEN` に Terraform Cloud の API トークンを登録する。Repository secret `TF_PLAN_PASSPHRASE` には暗号化用の十分に長いランダム値を登録する。たとえば `openssl rand -base64 48` で生成し、Git に保存しない。Plan と Apply は同じ secret を使用する。値を変更すると既存の plan は復号できなくなるため、plan を再生成する。長期 AWS キーを GitHub Secrets に登録する手順はない。AWS の一時認証情報は CodeBuild がサービスロールから供給する。`AWS_ROLE_ARN` と `id-token: write` は不要。既定の `contents: read` と、認証情報を残さない checkout を使用する。

Required reviewers は必須。Plan の実行前と Apply の AWS 認証前に API で保護ルールを検証し、Environment が存在しない・取得できない・承認者が未登録の場合は処理を止める。ジョブのトークンには、この確認用に `actions: read` を付けている。[Environment の取得 API](https://docs.github.com/en/rest/deployments/environments#get-an-environment)を参照する。

最初の実行前には、既存環境の `terraform.tfvars` の値が workflow の値・Terraform の既定値と一致することを確認する。既定値以外のスケーリング・ログ保存期間・タグを引き継ぐ場合は、対応する `TF_VAR_*` を Plan ジョブへ追加する。

GitHub 側の Environment、secret、承認ルールと、CodeBuild の GitHub OAuth 接続は初回に手動設定する。

## Action とツールの更新

すべての外部 `uses` を40桁のコミット SHA で固定し、公式ツールで `.github/workflows/actions.lock` も生成している。GitHub の資料では lockfile の実行時適用は Enterprise Cloud 向け。対象プランでなくても SHA 固定は有効で、CI が lockfile の整合性と参照先を検証する。[GitHub の仕様](https://docs.github.com/en/actions/how-tos/secure-your-work/lock-workflow-dependencies)を参照する。

同一リポジトリの `uses: ./.github/workflows/ci.yml` は呼び出し元と同じコミットから読み込まれる。lockfile は外部の再利用 workflow 呼び出しを固定しないため、今後追加する場合はその呼び出しも SHA 固定する。

外部 Action を追加・更新するときは、公式リポジトリのリリースからコミットを確認し、`uses: owner/repo@40桁のSHA # vX.Y.Z` を変更して再生成する。

```sh
nix develop .#ci-workflows
gh auth login
gh-actions-lock --no-narrow
gh-actions-lock --verify --no-narrow
git diff -- .github/workflows
```

`--no-narrow` は SHA をタグへ書き戻さずに lockfile を生成するために必要。lockfile 内の SHA とタグの両エントリーは公式ツールが生成する。手で編集しない。`nix/actions-lock.nix` はこの動作を確認した v0.4.0 の公式バイナリをハッシュ付きで固定している。

Dependabot は Actions・npm・Terraform Provider のバージョン更新を週1回確認し、更新があれば1件の PR にまとめる。セキュリティ更新は別の PR で届く。Actions の更新時は、SHA と lockfile が両方更新されていることを PR で確認する。nixpkgs は `nix flake update nixpkgs` で更新する。Node.js の更新時は固定する nixpkgs と `app/.node-version` を、pnpm の更新時は `packageManager` と flake の版・ハッシュを合わせる。

Provider の更新時は、ローカルと CI で使う OS・CPU のチェックサムを公式レジストリから追加する。CI の `init -lockfile=readonly` は維持し、lockfile の検証を省略しない。

```sh
terraform -chdir=infra providers lock \
  -platform=darwin_arm64 -platform=linux_amd64 -platform=linux_arm64
terraform -chdir=infra/bootstrap providers lock \
  -platform=darwin_arm64 -platform=linux_amd64 -platform=linux_arm64
```

## 監査の判定と確認済みの範囲

- pnpm --dir app audit は開発依存も含め、high・critical を検出したら失敗する。2026-10-30 の検査では `@hono/node-server` 1.19.17 に moderate の [GHSA-rmxm-3fg6-px4f](https://github.com/advisories/GHSA-rmxm-3fg6-px4f) が1件ある。major 更新が必要なため、この CI/CD 設定では依存関係を変更していない。
- Trivy は high・critical で失敗する。配布用 S3 の SSE-S3 を設定する1か所だけ、顧客管理 KMS キーを求める `AVD-AWS-0132` を理由付きコメントで除外している。他のルールは除外していない。
- Gitleaks は履歴を検査する。GitHub 側の Secret scanning / Push protection が利用できる場合は併用できる。検出済みの秘密は削除だけで済ませず、失効・再発行する。
- ローカルの macOS ARM64 で Web 単体64件、E2E 13件、デプロイスクリプト12件・承認設定の検証6件、Terraform モック11件が成功した。配布パッケージ起動、型検査・ビルド・lint・format、各種静的検査も確認した。GitHub の Linux runner、Terraform Cloud への接続・移行、CodeBuild ランナーの起動、AWS への apply は未実行。

## 失敗したとき

| 症状 | 確認・対処 |
| --- | --- |
| bootstrap の OIDC 作成が SCP で拒否 | 現行構成は OIDC 不要。tfvars とコードを更新して plan を作り直す |
| webhook 作成で HEAD_REF が拒否される | 修正版で plan を再生成して apply。state は維持し、古い保存 plan は再利用しない |
| CodeBuild ジョブが待機する | OAuth 接続、webhook、許可 actor ID、main、workflow 名と runner label のプロジェクト名を確認 |
| Required reviewers の検証失敗 | `production` の承認者登録と API 参照権限を確認。設定は GitHub 側で行う |
| plan の期限切れ・SHA256 不一致 | 対象 run と review.txt を再確認。新しい plan が必要なら再生成してレビューする |
| plan で大量の新規作成 | apply せず、Terraform Cloud の Organization/Workspace と既存 state の移行、function/endpoint 名を確認 |
| Terraform Cloud の認証失敗 | `TF_API_TOKEN` の有効期限と `typign` の state に対する権限を確認 |
| Remote 実行になっている | Workspace の Execution Mode を `Local` にする。AWS 認証と ZIP は Actions 上で使用する |
| Terraform の state lock | 実行中の CI・ローカル apply と Workspace のロックを確認。所有者を確認するまで force-unlock しない |
| AWSCC の AccessDenied | Cloud Control と Lambda の双方の IAM 権限を確認。実環境で不足したアクションは対象リソースへ絞って追加 |
| lockfile 検証失敗 | Action の更新元を確認して `gh-actions-lock --no-narrow` で再生成 |
| apply 後の health 失敗 | CloudWatch Logs と Terraform のリビジョンを確認。workflow は失敗として記録されるが、自動で前の版には戻さない |

戻す場合は、原因となったコミットを revert して `main` へマージする。CI で再検査した成果物をデプロイする。Terraform state の版を戻す操作はアプリのロールバックには使わない。

| 用語 | 意味 |
| --- | --- |
| サービスロール | CodeBuild が AWS リソースを操作するときに使う IAM ロール |
| Environment | GitHub 上の配置先設定。変数とデプロイ可能なブランチを管理する |
| state / backend | Terraform の管理対象の記録と、その保存先 |
| lockfile | Action・Provider・依存パッケージ・ツールの取得先や版を固定するファイル |

解決しない場合は、失敗したジョブ名・エラー・コミット SHA をリポジトリの Issue またはこのチャットで共有する。トークン、state、認証情報を含む plan は共有しない。

最終更新日: 2026-11-03

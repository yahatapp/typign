# TerraformでTypignをAWS Lambda Web Functionsへ配置する

この構成は、配信用ZIPをS3へ置き、Web Function、リビジョン、HTTPSエンドポイントを作成する。個人の入力データはブラウザに保存し、AWSには共通画面と公開教材を配置する。

デプロイを行う開発者向けの手順。初回は「事前準備」「初回の配置」「適用後の確認」を読み、構成表や更新・削除の手順は必要なときに参照する。

1. 本番依存関係を含むZIPを作る。
2. AWSアカウントIDとplanの変更内容を確認して適用する。
3. 発行されたURLでHTTPとブラウザの動作を確かめる。

## 対応Provider

確認日: 2026-10-25。通常のAWS Providerの最新リリースは6.70.0で、Web Functionsの対応PRは未マージだった。一方、AWS Cloud Control Providerの最新リリース1.107.0には次のリソースが含まれている。両Providerの版は[versions.tf](versions.tf)と[lockfile](.terraform.lock.hcl)で固定する。

| Provider | 管理するもの |
| --- | --- |
| `hashicorp/aws` 6.70.0 | S3、実行ロール、CloudWatch Logs |
| `hashicorp/awscc` 1.107.0 | `awscc_lambda_web_function`、`awscc_lambda_web_function_revision`、`awscc_lambda_web_function_endpoint` |

出典: [AWS Providerのリリース](https://github.com/hashicorp/terraform-provider-aws/releases/tag/v6.70.0)、[未マージの対応PR](https://github.com/hashicorp/terraform-provider-aws/pull/50452)、[AWSCCの本体](https://github.com/hashicorp/terraform-provider-awscc/blob/v1.107.0/docs/resources/lambda_web_function.md)、[リビジョン](https://github.com/hashicorp/terraform-provider-awscc/blob/v1.107.0/docs/resources/lambda_web_function_revision.md)、[エンドポイント](https://github.com/hashicorp/terraform-provider-awscc/blob/v1.107.0/docs/resources/lambda_web_function_endpoint.md)。

## 事前準備

Node.js 24、pnpm 11.11.0、`zip`、Terraform 1.12以降を用意する。Terraform CLIは1.17.0で検査している。[.terraform-version](.terraform-version)も1.17.0を指定する。ZIPの作成手順はmacOS/Linux向けで、Windowsでの作成は未確認。

AWSの認証は、設定済みのSSOプロファイルなどを両Providerで共通に使う。例ではプロファイル名を`typign`とする。アクセスキーやトークンはTerraformファイルに書かない。AWS CLIを使う場合の認証方法は[AWS公式手順](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-quickstart.html)を参照する。

実行するIAM主体には、Cloud Control APIの操作に加え、Web Functionの作成・取得・更新・削除、実行ロールの管理と`iam:PassRole`、S3とログの管理権限が必要になる。AWSCCはCloud Control経由で操作するため、通常のLambda操作権限だけでは足りない。

既定のリージョンは東京。利用するアカウントとリージョンで、Web FunctionsとCloud Controlの対象リソースを作成できることを確認する。AWSへの実適用、東京リージョンでの起動、料金は未確認。

## 初回の配置

プロジェクトルートで実行する。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm package:aws

cp deploy/terraform/terraform.tfvars.example deploy/terraform/terraform.tfvars
```

`terraform.tfvars`の`aws_account_id`を実際の12桁のアカウントIDへ変更する。名前やリージョンもここで指定できる。AWS ProviderはアカウントIDを照合する。

`pnpm package:aws`は本番ビルド後、一時フォルダへ必要な成果物だけをコピーし、lockfileに従って本番依存関係を入れる。依存関係をZIP内に収めるため、一時フォルダでは通常のディレクトリ配置を使う。生成先は`artifacts/typign.zip`。ソース、個人データ、認証情報を追加で収集する処理はない。

```sh
export AWS_PROFILE=typign

terraform -chdir=deploy/terraform init
terraform -chdir=deploy/terraform fmt -check -recursive
terraform -chdir=deploy/terraform validate
terraform -chdir=deploy/terraform test

terraform -chdir=deploy/terraform plan -out=typign.tfplan
terraform -chdir=deploy/terraform apply typign.tfplan
```

`terraform test`は両Providerをモックに置き換える。AWSリソースを作らずに、公開エンドポイントの設定、S3の保護、コードの版指定、ログ権限、入力値の境界を確認する。実際の`plan`と`apply`にはAWSの認証が必要。

既にコンソールやCLIで同名のWeb Functionを作っている場合は、新規作成の前に名前を変えるか、既存リソースをimportする。AWSCCの本体・リビジョン・エンドポイントはそれぞれARNでimportできる。S3・IAM・ログも含めて既存構成を引き継ぐ場合は、対象をすべて確認してからplanを作る。

## 作成するリソース

| 対象 | 設定 |
| --- | --- |
| Web Function | `typign-dev`、Node.js 24、リクエスト上限時間30秒 |
| リビジョン | ZIPのSHA256をキーにしたS3オブジェクトと、そのversion IDを参照 |
| エンドポイント | `dev`、HomeRegion、ApplicationManaged、管理するリビジョンへ100%配信 |
| アクセス量 | 実行環境数は最大2、1環境の同時処理数は16、毎秒100リクエスト |
| S3 | 非公開、版管理あり、AES256暗号化、Lambdaの取得権限は対象関数・アカウントへ限定 |
| 実行ロール | 対象のロググループへ書き込む権限のみ |
| ログ | 集約用と`.local`の2グループ、保存期間14日 |

ApplicationManagedなので、このアプリはURLへアクセスできる人が利用できる。ログイン機能は付けていない。HTTPSエンドポイントへ直接アクセスする構成とし、CloudFront、独自ドメイン、WAF、VPC、利用者の認証・クラウド保存は追加していない。

実行環境数の下限は2。リクエスト上限は`0`、`100〜1000`の100刻み、`2000〜10000`の1000刻みを受け付けるschemaに合わせている。リージョンで利用可能な値がさらに限定される場合は、AWSのエラーに従って調整する。これらは月額の課金上限ではないため、AWS Budgetsで費用アラートも設定する。

ログは[Web Functionsの権限仕様](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-permissions.html)に従い、集約先と`.local`の両方を作成する。S3オブジェクトの取得は[配信コードの権限仕様](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-code-s3.html)に従う。

## 適用後の確認

```sh
terraform -chdir=deploy/terraform output
curl --fail-with-body "$(terraform -chdir=deploy/terraform output -raw health_url)"
```

`/health`が`{"status":"ok","version":"0.1.0"}`を返したら、`url`出力のHTTPS URLをPC Chromeで開く。診断→セット変更→練習→未見文での確認→振り返りを通し、4種類の単独開始、記録の再読み込み、JSON書き出し・復元、直接アクセス、404、読み込み後の通信断を確認する。

RevisionやEndpointの`Active`だけではサーバーの起動成功を保証しない。失敗時は`log_groups`出力を基にCloudWatch Logsで起動エラーを調べる。[AWSの起動確認仕様](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-code-s3.html)

個人の記録はURLごとのブラウザ保存になる。ローカル環境から移す場合はJSONを書き出し、AWSのURL側で復元する。復元は全体置換。AWSへ配置した後も、コーチは利用者のChrome内蔵LLMで動く。実モデル20例の検証画面は開発時専用のため、本番URLにはない。

## 更新と切り戻し

更新前に、戻す版のZIPを別名で保管する。

```sh
pnpm package:aws
terraform -chdir=deploy/terraform plan -out=typign.tfplan
terraform -chdir=deploy/terraform apply typign.tfplan
```

ZIPまたはサービス設定が変わると、新しいリビジョンを作り、エンドポイントの参照を変更してから古いリビジョンを削除する。名前を維持した通常の更新ではエンドポイントを作り直さない。過去のリビジョンを保持する構成ではないため、戻す場合は以前の配信用ZIPを指定して新しいリビジョンとして適用する。

更新もTerraformで管理し、CLIの自動デプロイとは併用しない。配信する版は`revision_weights`で明示している。

## 停止・削除

新規アクセスを止めるには、`terraform.tfvars`の`rate_limit`を`0`にして、planを確認して適用する。保存料などは残るため、利用を終えた場合はリソースを削除する。

S3の全バージョン削除は既定で禁止している。配信用ZIPの全バージョンを捨ててよいと確認した場合は、先に`force_destroy_artifacts = true`を設定して通常のapplyを行う。その後、次の手順で削除する。利用者の練習データはこのバケットに保存していない。

```sh
terraform -chdir=deploy/terraform plan -destroy -out=destroy.tfplan
terraform -chdir=deploy/terraform apply destroy.tfplan
```

`force_destroy_artifacts = false`でバケットが空でない場合、S3バケットの削除に失敗する。他のリソースは削除済みの場合があるため、planで残っている対象を確認する。

## stateの保管

stateは初期状態ではローカル保存。`.terraform/`、state、plan、`terraform.tfvars`、配信用ZIPはGit対象から外し、`.terraform.lock.hcl`は保持する。stateを失わないよう保管し、共同運用やCIへ移す際はアクセス制御とロックを備えたリモートバックエンドを用意する。

## ローカルでの検証結果

- Terraform 1.17.0で`fmt`、`validate`、モックテスト6件を確認した。
- 配信用ZIPを一時フォルダに展開し、依存関係の追加インストールなしで起動した。`AWS_LAMBDA_HTTP_ENDPOINT`を指定した起動は187msで、HTML、Flight、静的ファイル、4画面への直接アクセス、404を確認した。
- 検証環境はmacOS / Arm64 / Node.js 24.22.0。実AWSへのplan・apply・配信の確認はまだ行っていない。

## 用語と問い合わせ

| 用語 | 意味 |
| --- | --- |
| Provider | TerraformからAWSなどのAPIを操作するプラグイン |
| リビジョン | 配信コードと設定の変更できないスナップショット |
| plan | 作成・更新・削除するリソースの差分 |
| state | Terraformが管理対象と実際のリソースを結び付ける記録 |

手順で解決しない場合は、失敗したコマンド、エラー内容、TerraformとProviderの版を添えてこのチャットで相談する。認証情報やstate全文は共有しない。

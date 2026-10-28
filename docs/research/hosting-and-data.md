# ホスティング・データ保存の調査

確認日: **2026-10-20（日本時間）**。企画・選定用の調査であり、アカウントの確認や契約・デプロイは実施していない。料金は公式ページの表示に基づくUSD、税別等の条件は各社による。無料枠は変更され得るため、公開直前に利用アカウントと選ぶプランで再確認する。

## 現行方針はWeb FunctionsとRSCを使う構成へ更新

ユーザーの指定を受け、初期ホストはAWS Lambda Web Functions、UIはVite / Vite+とReactの非同期UI・RSC、HTTP層はHonoへ更新した。以下の静的MVPの比較は前回調査として残す。現行の採用構成・費用の境界・統合の検証項目は[技術設計](../architecture.md)を参照。

Web Functionsは2026年10月12日のAWS公式発表で提供開始を確認。標準Node.js HTTP serverとnative streamingに対応する。CPUだけでなくメモリ・リクエスト等の費用も確認し、Event Functionsの無料枠をそのまま適用しない。[AWS発表](https://aws.amazon.com/about-aws/whats-new/2026/10/aws-lambda-web-functions/)、[料金](https://aws.amazon.com/lambda/pricing/)

## 参考: 静的MVPを前提にした前回の比較

一般公開するMVPでも、タイピングの計測、個人別の分析、出題、履歴保存はブラウザだけで成立する。**TypeScript + React/Vite、IndexedDB + Dexie、教材JSON**を中心とし、Honoは必要なWeb/APIの境界に使う。最初から認証、同期用DB、分析DB、常駐サーバーを設ける必要はない。

AWSから始める希望には、次の2案がある。

1. **運用の簡単さを優先:** Amplify HostingでViteの静的成果物を公開する。Hono APIが必要になった時だけLambda等を追加する。AWSの期間限定特典後には配信・ビルド費が発生し得る。
2. **AWSで低費用を長く続ける候補:** S3の非公開バケット + CloudFrontの**flat-rate Freeプラン**。現在は継続的な$0/月の配信枠があるため、「AWSの無料期間が切れたら必ず移行」とは限らない。ただしS3のリクエスト等は別枠であり、アプリ全体が無条件に無料になるわけではない。

移行作業そのものを減らすなら、Cloudflare Workers + Static Assetsが比較上有力。静的配信とHonoの小さなAPIを同じ構成に置ける。Google Cloud/Firebase、Azureにも継続的な無料枠はあるので、「メガクラウドに無料の公開先が無い」とは判断しない。

## ホストの比較

| 候補 | 確認できた無料枠・対象 | 期限と超過時 | Typignへの判断 |
| --- | --- | --- | --- |
| AWS Amplify Hosting | 料金表に旧来の12か月枠として標準ビルド1,000分/月、CDN保存5GB、転送15GB/月。新規向け案内は2025-07-15以降の最大$200クレジット方式 | アカウント制度による。通常料金は標準ビルド$0.01/分、保存$0.023/GB月、転送$0.15/GB。新規アカウントに旧12か月枠をそのまま適用しない | Git連携と公開作業の簡便さを優先する候補。SSR、WAF、バックエンドを追加すれば別料金 |
| AWS S3 + CloudFront flat-rate Free | **1 distributionあたり$0/月、1Mリクエスト/月、100GB転送/月、S3 Standard保存5GB相当の月次クレジット** | このプランに期間限定の記載なし。CloudFront部分は超過料金なし。大きな超過が継続すると配信性能の調整があり得る。AWSアカウント自体を有効に保つ必要あり | AWSでの継続運用候補。S3のPUT/GET等、ドメイン登録、別のAPI/ログ等の対象外料金を見積もる |
| Google Firebase Hosting Spark | Hosting保存10GB。直近のHosting専用ドキュメントはCDN転送10GB/月を記載 | Sparkは支払情報なしで利用可能。保存超過で新規デプロイ不可、転送超過は猶予後に翌月までサイト停止。Blazeでは超過分課金 | 静的サイトのメガクラウド候補。SparkでHonoサーバーやCloud Functionsまで無料で動くという意味ではない |
| Google Cloud Run | request-based billingの無料枠: 2Mリクエスト/月、180,000 vCPU秒/月、360,000 GiB秒/月。us-central1等Tier 1料金を基準とする金額割引 | 請求先アカウント単位でプロジェクト横断集計。超過は課金。地域・課金方式により実効枠が異なる。転送・ビルド・イメージ保存等も確認が必要 | Hono Node.jsをコンテナにする場合の移植先。静的MVPを置くだけなら必須ではない |
| Azure Static Web Apps Free | subscriptionあたり転送100GB/月、appあたり合計保存500MB、1環境250MB、独自ドメイン2、managed Functions API対応 | 期間限定の記載なし。超過転送の購入不可。超過後の停止・復旧の正確なタイミングは今回未確認。FreeはSLAなし、公式表ではpersonal projects向け | 継続無料のメガクラウド候補。静的MVPには容量十分と考えられる。一般公開とSLAの必要性は別に判断する |
| Cloudflare Workers + Static Assets Free | **静的assetリクエスト・保存は無料**。動的Workerは100,000リクエスト/日、CPU 10ms/呼出 | 期間限定の記載なし。Workerを先に実行する経路が無料上限を超えると429。Paidはアカウント最低$5/月、以後従量 | 小さなSPAとHonoに適合。静的配信にWorker処理を毎回挟まない設定が重要 |

出典: [Amplify料金](https://aws.amazon.com/amplify/pricing/)、[CloudFront料金](https://aws.amazon.com/cloudfront/pricing/)、[CloudFront flat-rateの条件・超過時](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)、[Firebase Hostingの使用量](https://firebase.google.com/docs/hosting/usage-quotas-pricing)、[Firebaseプラン](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)、[Cloud Run料金](https://cloud.google.com/run/pricing)、[Azure SWAの上限](https://learn.microsoft.com/en-us/azure/static-web-apps/quotas)、[Azure SWAプラン](https://learn.microsoft.com/en-us/azure/static-web-apps/plans)、[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)、[Static Assets課金](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)。すべて2026-10-20に実ページを確認。

**Firebaseの表示差:** [総合料金ページ](https://firebase.google.com/pricing)はHosting転送を360MB/日と表示する一方、2026-10-13更新のHosting専用ドキュメントは10GB/月と記載する。日次と月次はピーク日の扱いが異なり、同一視しない。本表は専用ドキュメントを採用し、公開直前に選択プロジェクトの実際の上限表示を確認する。Firebase HostingとFirebase **App Hosting**は別サービスであり、後者のCloud Run等の料金を混ぜない。

## AWSの無料制度はアカウントの作成時期で分ける

- **2025-07-15より前のアカウント:** 旧制度の、アカウント作成後12か月の対象サービス枠とAlways Freeを区別する。2026-10-20時点では、通常の12か月枠は既に終了している時期。既存アカウントに新規クレジットが復活する前提を置かない。
- **2025-07-15以降:** 新規顧客に登録時$100、対象アクティビティで最大追加$100。Free planは最長6か月、またはクレジット消費まで。Free planの終了は「有料でそのまま走る」とは限らず、アカウント・関連プロジェクトの停止になる。Paid planでは残クレジットを超える利用等に課金される。
- **2026年10月の新サインアップ体験:** 現在のFAQは新体験への言及があり、クレジット6か月という説明と、一部に12か月という旧説明が混在している。クレジット期限を一律に断定せず、Settings/Billing画面の当該アカウントの失効日を採用する。

出典: [AWS無料枠FAQ](https://aws.amazon.com/free/free-tier-faqs/)、[2025改定告知](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/)、[アカウント作成日前後の制度比較](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html)。確認日2026-10-20。AWSのアカウントFree planと、個別サービスCloudFrontのflat-rate Free planは別物。前者の期限が来たら、後者が$0でもアカウント停止の影響を受け得る。

### AWSで始める具体案

**最小案:** CIでViteの`dist`を作り、Amplify Hostingに静的公開する。教材も版付きJSONとして同梱する。入力中は外部APIを呼ばず、分析・保存は端末内で完結する。ルーティング、HTTPS、キャッシュ、公開後の費用確認を行う。

**継続費用を重視する案:** CIの同じ`dist`をS3へアップロードし、CloudFront flat-rate Freeで配信する。バケットは非公開で、Origin Access ControlによりCloudFront経由に制限する。S3 Standardの保存クレジットは、S3リクエスト料金まで含むものではない。フロントのファイル名にハッシュを付け、不要な更新・キャッシュミスを減らす。CloudFrontへの単なる「従量制distribution作成」と、flat-rate Free選択を取り違えない。

**APIを追加する条件:** 複数端末同期、公開教材投稿、サーバーでの認可などが実際に必要になった時。HonoのLambdaアダプターを使い、入口をLambda、業務ロジックをランタイム非依存のTypeScriptとする。Lambdaの一般的な無料枠は1Mリクエスト/月・400,000GB秒/月だが、API Gateway、ログ、ネットワーク等は別料金で、AWSのアカウント利用条件も別途適用される。不要なAPIを無料枠消費のために追加しない。

出典: [Hono Lambda](https://hono.dev/docs/getting-started/aws-lambda)、[Lambda料金](https://aws.amazon.com/lambda/pricing/)、[CloudFront flat-rate](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)。確認日2026-10-20。

### Azure Functionsの無料枠を混ぜない

Static Web Apps内蔵のmanaged APIと、別に作るFunctionsアプリは扱いが異なる。単独FunctionsのConsumptionはsubscription全体で1M実行/月・400,000GB秒/月、Flex Consumptionのon-demandは250,000実行/月・100,000GB秒/月。無料grantは対象の有料従量subscriptionに適用され、ストレージアカウントやネットワークは別料金。プラン名を省いて「Functionsは月100万回まで無料」とだけ設計しない。[Azure Functions料金](https://azure.microsoft.com/en-us/pricing/details/functions/)、確認日2026-10-20。

## データ保存と分析

### MVPでは分析DBを持たない

目的は個人の文字・2〜3文字の並び・修正操作・日次の傾向を分析すること。まずセッション終了時にTypeScriptで集計し、履歴と集計をIndexedDBへ保存する。これは「サーバーで大規模SQL分析しなければ個別最適化できない」問題ではない。公開ユーザー全員の生打鍵を中央へ送る必要もない。

| 層 | 保存候補 | 役割 |
| --- | --- | --- |
| 端末内 | IndexedDB + Dexie | 設定、セッション、短期間の生イベント、並び別集計。MVPの標準 |
| ポータブルなバックアップ | バージョン付きJSON | ユーザー操作で書き出し・読み込み。ホストや端末の変更に備える |
| 高度な端末分析 | DuckDB-Wasm + 必要ならOPFS | 大量の履歴、CSV/Parquet取込、任意SQL等が必要になった段階 |
| 将来の同期 | D1、Postgres等 | アカウント・認可・競合解決・削除を設計してから導入 |
| 将来のサービス横断分析 | 専用分析基盤 | 任意の集計送信について目的・項目・同意を設計してから検討 |

[Dexie](https://dexie.org/docs)はIndexedDBのラッパーで、通常利用するだけでクラウド同期されるものではない。[DuckDB-Wasm](https://duckdb.org/docs/preview/clients/wasm/overview)はブラウザで動くSQL分析エンジン。高機能だが、ダウンロード量、Web Worker、メモリ、対応ブラウザ、永続化方式を増やすため、単純な個人集計のMVPには採用を急がない。OPFSも同期サービスやバックアップを提供する機能ではない。確認日2026-10-20。採用時はstable版の現行仕様を再確認する。

### ローカル保存の重要な境界

ブラウザ保存は、容量不足、ブラウザのデータ消去、プライベートモード等で失われ得る。`navigator.storage.persist()`等の検討はできるが、保存の永久保証やバックアップにはならない。保存失敗を表示し、書き出し・復元・全削除を公開前の要件にする。

**IndexedDBはオリジン（scheme/host/port）に紐づく。** `example.amplifyapp.com`から`example.workers.dev`に移ると、同じブラウザでも既存履歴を自動では読めない。一般公開前から独自ドメインを固定してHTTPSの同じオリジンで移行すれば、この問題を抑えられる。独自ドメインを持たない場合は、旧サイトがまだ動く間に書き出し、新サイトで読み込める導線を用意する。ドメイン登録費は各ホストの無料枠とは別。

出典: [MDN: Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)、確認日2026-10-20。

## 無料DB候補は同期が必要になった時に再比較する

| 候補 | 2026-10-20に確認したFreeの主な条件 | 評価 |
| --- | --- | --- |
| Cloudflare D1 | アカウント全体で読取5M行/日、書込100,000行/日、保存合計5GB。無料の読書き枠はUTC 00:00でリセット。超過はクエリエラー、保存超過は新規データ等を制限 | Workersとの組合せが簡単。中央に生打鍵を1打鍵1行で送る設計は書込を急消費。同期対象を集計・セッションに絞る検討が必要 |
| Neon | Free $0、期限なし・カード不要、100 CU時間/月/プロジェクト、保存1GB/プロジェクト | Postgresの移植性を重視する将来候補。計算資源・容量枠で停止等になる正確な挙動は今回未確認 |
| Supabase | Free $0/月、DB 500MB、非キャッシュ転送5GB、キャッシュ転送5GB、2 active projects、1週間非活動でpause | 認証・同期APIも一緒に欲しい時の候補。MVPには認証運用と依存が増える。pauseからの復帰要件も検討する |
| Turso | Free $0/月、保存5GB、読取500M行/月、書込10M行/月、100 DB | SQLite系を重視する将来候補。無料超過の正確な停止・復旧条件、同期機能の利用条件は今回未確認 |

出典: [D1料金と超過時](https://developers.cloudflare.com/d1/platform/pricing/)、[Neon料金](https://neon.com/pricing)、[Supabase料金](https://supabase.com/pricing)、[Turso料金](https://turso.tech/pricing)。すべて2026-10-20に実ページを確認。いずれもここでは主にアプリ用DBの候補であり、専用分析DBの代替として無条件に推奨するものではない。

D1は返却行数ではなく読み取った行数を数え、インデックスの更新も書込みを増やす。無料枠を「APIリクエスト件数」と取り違えない。将来の匿名集計基盤にCloudflare Analytics Engine等を使う余地はあるが、MVPのユーザー別の履歴保存とは目的が異なるため今回は選定しない。

## 移行境界と運用

HonoはAWS Lambda、Node.js、Workersへの公式導入経路を持つ。HTTPのRequest/Responseを使うルートとドメインロジックを分け、環境変数、認証、DB、ファイル配信、ランタイムアダプターを入口へ限定する。ただしHonoを使うだけで各社のIaC、認証、DB、ログ、秘密情報管理まで同じになるわけではない。[Hono Lambda](https://hono.dev/docs/getting-started/aws-lambda)、[Hono Workers](https://hono.dev/docs/getting-started/cloudflare-workers)、[Hono Node.js](https://hono.dev/docs/getting-started/nodejs)、確認日2026-10-20。

無料枠の終了ごとにクラウドを巡回する方式では、DNS/TLS、CI、SPAルーティング、キャッシュ、ログ、認証の設定を繰り返し変更する。旧環境の削除漏れ、履歴のオリジン変更、特典の適格性の誤認も起こり得る。**一度選んだ継続無料枠内に保つか、小額の運用費を許容するか**を先に判断した方が、学習価値の改善に時間を使える。

公開前に必要なのは、AWSアカウント作成日・現在のplan・残クレジット・失効日、独自ドメインの有無、許容月額上限、上限超過時に停止してよいかの確認。予算アラートは一般に課金停止そのものではない。今回の資料だけでユーザーの実アカウントの利用資格・請求額は確定しない。

推奨する着手順は、ローカルで入力計測の検証 → IndexedDBと書き出し復元 → 静的公開 → 必要な時にだけHono API・同期DBを追加、となる。これならAWS開始、Google/Azureへの移行、Cloudflareへの移行のいずれにも、MVPの価値を担う計測・分析エンジンを持ち運べる。

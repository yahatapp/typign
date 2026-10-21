# Typign 技術設計案

2026年10月時点の公式資料を確認した設計案。デプロイ、推論、RSC統合の実機検証はまだ行っていない。最新の製品方針は[企画書](product-concept.md)を参照。

## 採用方針

**Hono + Vite / Vite+ + Reactの非同期UI・RSCを、AWS Lambda Web Functionsで動かす。個人の入力データと低遅延の練習処理はブラウザに置く。**

Next.js等の大きなフレームワークは使わない。必要なルーティングとRSC配信の統合層を自分たちで保守するため、その範囲を絞って検証する。LLMの推論をAWSへ常設する構成は採らず、提供方式は独立した境界にする。

| 部分 | 第一候補 | 担当すること |
| --- | --- | --- |
| 言語 | TypeScript | UI、分析、教材、計画の契約を共有する |
| 開発・ビルド | Vite / Vite+ | 開発サーバー、複数環境のビルド、検査とテスト |
| UI | React、Suspense、Transitions、Actions | 入力の即時表示と、分析・コーチ等の非同期操作を分ける |
| RSC統合 | `@vitejs/plugin-rsc` | RSC / SSR / browserのビルドとランタイム接続 |
| HTTP | Hono + `@hono/node-server` | HTML、Flight、教材、明示的APIを配信する |
| 実行環境 | Lambda Web Functions、Node.js 24 / Arm64 | 標準HTTPサーバーとして起動する |
| 配信 | LambdaのHTTPS endpoint、必要に応じCloudFront | 独自ドメイン、静的成果物、キャッシュ |
| 個人データ | IndexedDB + Dexie | 入力履歴、集計、目標、コーチの計画と結果 |
| コーチ | 一つのLLM方式 + 制限した分析操作 | 根拠付きの説明、セット提案、変更、振り返り |

## Lambda Web Functionsは、通常のNode.js HTTPサーバーとして使う

AWSは2026年10月12日にWeb Functionsの提供開始を発表した。Hono等でHTTPポートをlistenするモデルで、既存のLambdaイベントハンドラーへ変換するLWAは不要。東京リージョンも提供開始時の対象に含まれる。[AWS発表](https://aws.amazon.com/about-aws/whats-new/2026/10/aws-lambda-web-functions/)

公開時点の実行環境はNode.js 24 / Arm64。既定の起動ファイルはパッケージ直下の `index.js` で、環境変数からlisten先を読む。起動時間の制限があるため、RSCの本番成果物を含む起動を測る。HonoのNode HTTP接続層は使うが、これはLambda専用のイベント変換アダプターとは役割が異なる。[AWSランタイム](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-runtimes.html)、[Hono Node.js](https://hono.dev/docs/getting-started/nodejs)

ネイティブHTTPストリーミングが使える一方、WebSocket upgradeは非対応。MVPのHTML・Flight・コーチ応答は、HTTPストリームや通常のリクエストで設計する。ローカルLLMの場合、コーチの生成ストリームをサーバー経由にする必要はない。[AWSネットワーク仕様](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-networking.html)

一つの実行環境が複数リクエストを同時処理するため、個人の文脈・セッションをグローバルな変数へ置かない。無トラフィック時は縮退する。MVPは東京の単一リージョンから始め、複数リージョン運用は後で判断する。[スケーリング](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-scaling.html)

### CPU以外の費用も含めて見積もる

| 料金要素 | 設計で確認すること |
| --- | --- |
| active CPU | SSR、RSC、リクエスト処理で消費するCPU時間 |
| 実消費メモリ | 環境が存在する期間のメモリ。リクエスト間も対象 |
| リクエスト | HTML、Flight、API、キャッシュされない成果物のアクセス |
| 転送・周辺サービス | CloudFront、S3、ログ、ドメイン等の別費用 |

I/O待ちのCPU時間が課金されない仕組みであり、CPU時間だけを払うサービスとは説明しない。従来のEvent Functionsの無料枠をWeb Functionsへそのまま適用せず、東京の単価・対象アカウントの特典・上限設定を確認する。[Lambda料金](https://aws.amazon.com/lambda/pricing/)

独自ドメインではCloudFrontを前段に置く。originへのIAM認証と、必要になった場合の利用者認証は別に設計する。CloudFront経由のアクセス制御はAWSのOACパターンを参照する。[endpoint仕様](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-endpoints.html)、[アクセス制御](https://docs.aws.amazon.com/lambda/latest/dg/web-functions-endpoint-access-control.html)

ハッシュ付きJS/CSS等は長期キャッシュし、HTML、Flight、APIとは配信規約を分ける。最初は同じ成果物から配信して構成を絞り、必要なら静的ファイルをS3へ分離する。CloudFrontのプランが必要なキャッシュ設定を満たすかも検証する。CloudFrontのFreeという名称は、Web Functionsまで無料にする意味ではない。

## Async ReactとRSCの役割を分ける

本プロジェクトでいうAsync Reactは、Suspense、Transitions、Actions等を使って、待機中・処理中・成功・失敗をUIとして扱う方針を指す。独立したフレームワーク名や、すべてのコンポーネントをasync関数にするという意味ではない。[公式Working Group](https://github.com/reactwg/async-react)

| 機能 | Typignでの用途 |
| --- | --- |
| async Server Components | 教材・公開情報・共通構造のサーバー側読み込み |
| Streaming SSR | 初期HTMLを段階的に届ける |
| RSC / Flight | Server Componentの結果をSSR層やブラウザへ渡す |
| `use` / Suspense | 分析やコーチの読み込み部分に待機状態を設ける |
| Transitions | 画面遷移や分析の更新を、入力の即時反応と分ける |
| Actions / `useActionState` | セット再提案などの進行中・失敗・再試行を扱う |

Client Componentのrenderをasyncにせず、Promiseを読む場合はその寿命を管理する。RSCとHTMLのSSRは別の工程として扱う。[React Server Components](https://react.dev/reference/rsc/server-components)、[React `use`](https://react.dev/reference/react/use)

Vite+はVite、Vitest、Oxlint等をまとめたツールチェーンで、アプリのRSCルーターを自動で提供するものではない。Vite公式には `@vitejs/plugin-rsc` と最小RSCテンプレートの案内がある。採用時はVite+が内包するViteとpluginの組み合わせを検証する。[Vite+](https://www.viteplus.dev/guide)、[Vite公式プラグイン](https://vite.dev/plugins/)

### 小さくても、統合層の責務は残る

| 責務 | MVPで決める規約 |
| --- | --- |
| URL・画面 | 今日、練習、記録、分析。直接アクセス、戻る・進む、404、フォーカス移動 |
| ビルド | RSC実行用、SSR用、browser用の入口とimport境界 |
| HTML・Flight | 別の経路で配信し、キャッシュの取り違えを避ける。詳細はスパイクで固定 |
| 初期表示 | HTMLと初期Flightの整合、hydration、JS/CSS manifestの引き渡し |
| データ変更 | MVPは明示的Hono APIとReact Actionsを基本案にする。Server Functionsは必要な操作だけ検証 |
| エラー・中断 | stream開始前後のエラー、Error Boundary、離脱時abort、再試行 |
| キャッシュ・更新 | 教材、HTML、Flight、静的成果物を分け、デプロイ版を揃える |

低レベルなRSC統合は、公式starterを起点に必要部分を絞る。サンプルのURLやheader規約をReactの標準仕様とは扱わない。[pluginと公式starter](https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-rsc)

ReactはRSC自体をstableとする一方、バンドラー実装向けAPIでは19.x内のminor更新にも互換性を保証していない。ViteのEnvironment APIにも成熟度の留保がある。React / React DOM / RSC runtime / plugin / Viteの動いた組み合わせをlockfileで固定し、本番ビルドを確認して更新する。[Reactの注記](https://react.dev/reference/rsc/server-components)、[Environment API](https://vite.dev/guide/api-environment-frameworks)

Server Functionを導入する場合、呼出元の入力検証、必要な認証・認可、CSRF、再実行時の動作を各操作で設計する。サーバーの関数を呼べること自体が、利用者の権限を保証するわけではない。[React `use server`](https://react.dev/reference/rsc/use-server)

## ブラウザとサーバーの境界

| ブラウザ | 共有する純粋な処理 | サーバー |
| --- | --- | --- |
| 打鍵時刻と入力状態、ローマ字判定、IndexedDB、個人の集計、端末内LLM、今日の個別セット | 指標定義、教材の条件、比較処理、計画schema、根拠と出力の検証 | Hono、RSC / SSR、公開教材、共通構造、必要な明示的API |

サーバーで動くRSCから、ブラウザのIndexedDBを直接参照しない。個人の履歴・分析・コーチはClient Component側で読み、RSCには公開教材や共通情報を担当させる。個人データをRSCで表示するためだけに、サーバーへ送る構成にはしない。

打鍵の時刻は入力イベント時に記録する。Reactの再描画やネットワーク応答の時刻で代用しない。入力の即時更新はTransitionへ入れず、分析・グラフ・コーチの更新を分ける。[React `startTransition`](https://react.dev/reference/react/startTransition)、[単調時計](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now)

## コーチは、分析操作と計画検証を通して働く

推論方式を交換しても、学習の記録や指標が変わらない構成にする。LLMには、計算済みの小さな文脈と、許可された問い合わせだけを提供する。

| 操作の案 | 返すもの |
| --- | --- |
| `getPatternEvidence` | 対象の出題・誤り候補・期間・条件・サンプル数・根拠ID |
| `compareConditions` | 同じ入力方式・配列・教材条件での比較と、比較できない理由 |
| `getRetentionChecks` | 習った対象のうち、後日確認していないもの |
| `buildPlanCandidates` | 目標・時間・教材条件を満たすセット候補 |
| `validatePlan` | 教材ID、4種のモード、合計時間、根拠ID、確認課題の分離の検査 |

これはMVP向けの内部API案であり、すべてのモデルがnative tool callingを行える前提ではない。モデルに許可された操作と引数を構造化して出してもらい、アプリが検査・実行する方式も検証する。任意SQL・コード実行は導入しない。

LLMの提案には、狙い、根拠ID、対象、練習の種類、時間、教材ID、次の確認項目を持たせる。原本データをモデルが書き換えることは許さず、変更希望を受けた場合は新しい版の提案を作る。本人が選んだ版と、実際に実施した内容を別に残す。

高度分析の初期実装は、条件を揃えた比較、件数付きの傾向、複数回の再現、練習直後と後日の区別まで。変化点検出や確率的な技能推定は、データと評価例が揃ってから追加する。疲労・心理・実際の指使いの原因推定は行わない。

## データの中心は、時系列の記録と根拠の参照

| 記録 | 主要項目の案 |
| --- | --- |
| 観測 | session ID、教材・分析の版、相対時刻、入力・修正、配列・実際の表記経路・端末等の条件スナップショット、計測カバー率 |
| 根拠 | evidence ID、対象、集計期間、分子・分母、比較条件、元セッション参照 |
| 個人の文脈 | 目標、時間、好み、本人の感想、確認・編集・削除状態 |
| 計画 | plan IDと版、目標、各ブロック、根拠参照、モデル・プロンプト・schemaの版 |
| 実施 | 選んだplan版、実際の練習、変更・中断、結果の参照 |
| 確認 | 未見教材の結果、後日確認、まだ分からないこと、次回の確認予定 |

生イベントは従来案の短期保持を維持し、集計・計画・結果は本人が削除するまでローカルで保持する案。生データが期限で消えたら、根拠表示でも詳細再生ができないことを示す。集計定義の変更前後を無条件に混ぜない。

IndexedDB + Dexieで始め、セッション単位で集計する。コーチには全生イベントでなく必要な集計を渡す。DBをクラウドへ置かなくてもデータを製品の中心にできる。任意SQLや大量履歴の再集計が実測で必要ならDuckDB-Wasm / OPFSを再評価する。複数端末同期には別途サーバー保存と認可の設計が必要。

## 採用を確定するための検証

1. **Web配信:** production buildをNode.js 24 / Arm64相当、次にWeb Functionsで起動する。起動制限、直接URL、HTML streaming、Flight、hydration、404を確認する。
2. **非同期処理:** キャッシュ経由でもchunkが届くか、途中エラー・abort・古いタブ・デプロイ版の混在から回復するかを確かめる。
3. **同時処理:** 複数利用者の文脈が混ざらず、個人用の応答が共有キャッシュへ入らないことを確認する。
4. **入力の独立性:** 通信断やコーチ生成中でも入力を記録でき、同じ入力列の再計算結果が一致することを確かめる。
5. **コーチ:** 日本語で根拠付き提案、時間・重点変更、振り返り、無効な出力からの回復を通す。
6. **費用と保守:** CPUだけでなくメモリ・リクエスト・配信・ログを測る。RSC統合層の更新手順と対象バージョンを記録する。

未検証の統合を完成済みとは扱わない。ホストの移行ではHonoのHTTP境界を再利用できるが、Node用RSC成果物・ストリーム接続・配信設定は移植先で再確認する。

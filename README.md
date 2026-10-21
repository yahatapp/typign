# Typign

日々の入力データをもとに、AIコーチと自分に必要な練習を組み立てるパーソナルトレーニングサービスの企画。日本語のローマ字入力を中心に、英単語や記号も扱う。根拠付きのセット提案、会話による変更、実施後の振り返りをつなぎ、別の文章でも改善したかを確かめる。

トレーニングの柱は、限界まで速く打つ「スピード練習」、正確さを保てる最高速度を目指す「正確性練習」、反復して定着させる「苦手練習」、新しい並びを覚える「新パターン練習」の4種類。

## 現在の状態

企画・調査段階。アプリの実装やデプロイはまだ行っていません。一般公開を予定し、計測と個人データの保存はブラウザを中心にします。MVPからLLMコーチを検証する方針に更新しました。

技術方針は、Hono + AWS Lambda Web Functions、Vite / Vite+、Async ReactとRSC。Next.js等の大きなフレームワークは使わず、PC向けの白黒を基調としたトレーニングノートとして設計します。

## 企画資料

1. [プロジェクト企画・コンセプト](docs/product-concept.md) — 対象ユーザー、差別化、機能案、推奨技術、検証方針
2. [MVP仕様案](docs/mvp-scope.md) — 最初に作る範囲、入力と分析の要件、公開前の受け入れ条件
   - [技術設計](docs/architecture.md) — Web Functions、Vite・RSC、個人データとLLMの境界
   - [UI設計方針](docs/design-direction.md) — トレーニングノートを軸とする画面とデザイン
3. [競合調査](docs/research/competitors.md)
4. [学習設計・計測の調査](docs/research/learning-and-measurement.md)
5. [ホスティング・データベースの調査](docs/research/hosting-and-data.md)
6. [LLM連携の調査](docs/research/llm-options.md)

外部仕様・無料枠の確認日は各資料に記載。学習効果、利用資格、アカウントごとの無料枠など、未検証の事項は推奨設計と区別しています。

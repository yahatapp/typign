# Typign 競合調査

確認日: **2026-10-20**。公式サイト、公式ヘルプ、運営者の公開リポジトリを検索し、以下の出典を実際に開いて確認した。利用者インタビュー、各サービスの全機能の実機検証、商標調査は実施していない。

## 企画への結論

追加調査で、**TypeWPM AI Coach**が近い直接競合と分かった。公式には、キー・文字ペアの観測から作る7日プログラム、再構成、任意のChrome内蔵AIによる説明、ブラウザ保存が案内されている。「AIコーチ＋データ＋日々のセット＋ローカル推論」まで重なる。これは公式の提供説明を確認したもので、学習効果や通信の実測検証ではない。[TypeWPM公式](https://www.typewpm.com/ai-typing-coach/)

Typignの現行方針では、日本語ローマ字・英単語・記号の混在に加え、提案から根拠へ辿ること、会話による制約付きの再計画、計画と未見・後日確認の結果を結ぶことを差別化仮説とする。競合に無いとの断言はせず、実際の操作と継続利用で比較する。

**「タイポを分析し、個人に合った練習を出す」だけでは差別化できない。AIによる練習文生成も既存機能である。** keybr はキー別統計から弱いキーを重点出題し、TypingClub は弱点に応じた動的レッスンを持つ。Typing.com は苦手キーを含む意味のある文章を TypeAI で生成すると公式に案内している。[keybr](https://github.com/aradzie/keybr.com/blob/master/README.md)、[TypingClub handbook](https://elementary.typingclub.com/m/edclubdocs/media/pdf/typing-jungle-handbook.pdf)、[Typing.com TypeAI](https://www.typing.com/whats-new/1724963998/personalized-practice-now-powered-by-ai)

また、「既存は速度、Typign は正確性」という整理も弱い。Ngram Type には正確率の合格閾値があり、Monkeytype にも誤入力で失敗する難易度設定がある。ホームポジションや運指ガイドも TypingClub 等が提供している。[Ngram Type](https://github.com/ranelpadon/ngram-type)、[Monkeytype settings](https://monkeytype.com/settings?highlight=minWpm)

Typign の検証対象は、**日本語ローマ字・英単語・記号が混在する仕事文脈で、転置などの誤りと修正負荷を把握し、短い練習の効果を確かめられること**とするのがよい。これは調査から導いた差別化仮説であり、市場に同機能が存在しないという断言ではない。

## 競合比較（8サービス）

「未確認」は今回確認した公式資料に明示がなかったことを示す。機能が存在しないことを意味しない。「ブラウザで利用可能」と「入力データが外部送信されない」は区別する。

| サービス | 公式に確認できた機能 | 適応学習・AI | ローカル性・データ保存について確認できた範囲 | Typign の既存代替となる点 |
|---|---|---|---|---|
| **keybr** | 打鍵ごとの記録、キー別統計、目標速度、習熟に応じた文字追加、進捗グラフ | 弱いキーに集中するレッスンを自動生成。LLMコーチングは未確認 | 公開ソースからローカル環境を起動する案内あり。ホスト版の完全なローカル保存・無送信性は今回未確認 | 苦手分析、個別出題、成長可視化を強く代替。[公式 README](https://github.com/aradzie/keybr.com/blob/master/README.md) |
| **Monkeytype** | 多様なテスト長・言語、引用文、数字・句読点、リアルタイムのミス・速度・正確率、アカウントでの速度履歴 | Expert は誤った単語の確定で失敗、Master は1打の誤りで失敗。適応カリキュラム・LLMは今回未確認 | オープンソース。アカウント履歴あり。ホスト版の完全なローカル保存・無送信性は未確認 | 快適な練習UI、正確性重視の設定、速度測定、履歴。[公式 README](https://github.com/monkeytypegame/monkeytype)、[公式設定説明](https://monkeytype.com/settings?highlight=minWpm) |
| **e-typing** | ローマ字・英語・かな、腕試し、ランキング、会員カルテにスコア推移・苦手キー・苦手指、段階的練習メニュー | 苦手の可視化は確認。苦手に応じた自動生成・LLMは未確認 | 会員カルテで記録を提供。ローカル専用運用は未確認 | 日本語ローマ字入力の練習、弱点表示、継続的な成績確認。[公式サイト](https://www.e-typing.ne.jp/)、[会員機能](https://www.e-typing.ne.jp/signup/)、[カルテの説明](https://www.e-typing.ne.jp/help/006.asp) |
| **寿司打** | 時間内に入力するローマ字ゲーム、複数ローマ字表記の受理、表示・音設定、無料のブラウザ利用 | 適応学習・LLMは未確認 | ブラウザで利用可能。入力ログや保存方式は未確認 | 日本語の短時間練習、遊びによる継続動機、複数入力表記。[公式サイト](https://sushida.net/) |
| **TypingClub** | キーごとの手の姿勢ガイド、段階的レッスン、ゲーム、動画、バッジ、過去入力の再生、F/J を押さえる Anchoring Lessons | Typing Jungle 上級部の Dynamic Lessons は各学習者の弱点・進捗から動的生成。LLM利用は未確認 | アカウントなしで開始可、任意プロフィールで進捗保存。無送信・ローカル専用は未確認 | ホームポジション習得、運指の学習、適応出題、履歴再生。[公式サイト](https://www.typingclub.com/)、[公式 handbook pp.8–10](https://elementary.typingclub.com/m/edclubdocs/media/pdf/typing-jungle-handbook.pdf) |
| **Typing.com** | 苦手キーを追跡し、そのキーを含む物語・文章を題材別に生成 | **TypeAI による個別文章生成を公式確認**。学習前の大文字を苦手キーとして推奨しない改善も公式告知。会話型コーチングや利用モデルは未確認 | ローカルLLM・無送信運用は未確認 | 「苦手分析＋AIで意味のある文章を作る」という当初案と直接重なる。[TypeAIの説明](https://www.typing.com/whats-new/1724963998/personalized-practice-now-powered-by-ai)、[2025年の改善](https://www.typing.com/whats-new/1748442625/) |
| **Ngram Type** | bigram / trigram / tetragram / 単語、Top 50–200、カスタム入力、組み合わせと反復、最低WPM・正確率を満たすまで次に進まない設定 | 短い文字列の集中的な反復。苦手を自動検出して順位付けする仕組み・LLMは今回未確認 | 設定をブラウザに保存し再読込することを公式 README が明記。すべての打鍵ログの保存・無送信性まで確認したものではない | `ing` 等の連続入力、正確率基準、短い反復練習、ローカル設定。[公式アプリ](https://ranelpadon.github.io/ngram-type/)、[公式 README](https://github.com/ranelpadon/ngram-type) |
| **TypeWPM AI Coach** | キー・文字ペアの誤りと遅延、直近を重視した個人記録、本人の数値に基づく7日プログラム、再構成 | ウォームアップ、苦手、ペア、正確性、スプリントを組み合わせる。Chrome内蔵AIによる説明は任意 | 個人記録とプログラムはlocalStorage、AIも端末内と公式説明。通信の実測は未実施 | 日々の個別セットとローカルAIが直接重なる。[公式ページ](https://www.typewpm.com/ai-typing-coach/) |

Monkeytype の本体・設定URLは開いたが、本文抽出では JavaScript 必須画面になった。基本機能は公式リポジトリ、難易度設定は公式設定ページの検索インデックスの説明を根拠にした。実機での設定操作は未実施。

## 差別化仮説

### 1. 日本語の仕事文脈から弱点へ落とし込む

AIへの指示、仕様書、レビュー文、Markdown、英単語、記号を含む練習を用意する。ローマ字での日本語入力から英単語・記号への切り替えを含め、同じ苦手連続入力が別の文でも改善するかを見る。

- **既存代替:** e-typing の日本語練習、Monkeytype の言語・記号設定、Ngram Type のカスタム素材。
- **検証:** 対象ユーザーが一般的な例文より仕事に近い素材を選ぶか。未見の固定評価文でも改善するか。
- **断言しない点:** 日本語・技術用語・記号の混在練習が市場で未提供とは確認できていない。

### 2. 最高速度より「直す負担が減った」を示す

総打鍵に対する誤打鍵、転置候補、削除打鍵、誤り後の再入力などを分ける。「100文字あたりの余分な打鍵」を練習内の観測値として示し、苦手への練習と結ぶ。「修正に使った時間」は迷いや読み直しとの分離が難しいため、出す場合は定義付きの推定とし、MVPでは修正操作数を優先する。

- **既存代替:** keybr/e-typing の弱点表示、Monkeytype の正確率、Ngram Type の合格閾値。
- **検証:** 正確率だけでは分からない改善が見えるか。利用者が数値を理解して次の練習を選べるか。
- **断言しない点:** 競合が修正時間や転置を扱っていないとは確認できていない。練習内で測った修正時間から、実務の生産性向上やストレス低減を直接証明することもできない。

### 3. 3–5分で「診断→重点練習→未見文で再確認」する

苦手を挙げるだけで終わらせず、一回の練習理由と改善の証拠を説明する。測定・集計・計画の制約検査は検証可能な処理で動かし、LLMは分析操作の選択、説明、提案、会話による再計画を担う。ローカル保存とエクスポートを備え、利用者が自分のデータを制御できる構成を価値の一部にする。

- **既存代替:** keybr/TypingClub の適応練習、Typing.com のAI生成、Ngram Type の短い反復と閾値。
- **検証:** AIなしの診断と練習だけでも継続されるか。翌日や未見文でも効果が残るか。LLMの説明を付けることに追加価値があるか。
- **断言しない点:** 短時間の適応学習やローカル保存単体の新規性は弱い。会話型AIを追加すれば成果が改善するという根拠は今回得ていない。

## 実装・メッセージへの示唆

- 「AI搭載」「個別最適化」「正確性重視」「ホームポジション」だけを主見出しにすると既存との違いが伝わりにくい。対象・仕事場面・測る成果を一緒に示す。
- MVPでは「日本語ローマ字＋英単語・記号」「連続入力と誤りの傾向」「短い重点練習」「未見文の再評価」を優先する。汎用チャットコーチは、その追加価値を後から検証できる。
- 通常の打鍵イベントだけでは実際にどの指を使ったか、手がホームポジションに戻ったかは確認できない。推奨指のガイドと、実際の運指検出を混同しない。
- 競合の機能説明はサービスの提供内容を確認する根拠であり、学習効果の独立した実証ではない。
- 不特定多数への公開前に、採用予定の「Typign」の商標、同名サービス、ドメインを別途確認する。本調査は商標調査ではない。

## 出典と確認範囲

以下はすべて **2026-10-20 に検索・オープン確認**。価格の網羅比較は本調査に含めない。

| 出典 | URL | 主に確認した内容 |
|---|---|---|
| keybr 公式 README | https://github.com/aradzie/keybr.com/blob/master/README.md | キー別記録、弱いキーの自動出題、段階的文字追加、ローカル起動案内 |
| Monkeytype 公式リポジトリ | https://github.com/monkeytypegame/monkeytype | テスト種別、ライブ表示、履歴、言語・数字・句読点 |
| Monkeytype 設定 | https://monkeytype.com/settings?highlight=minWpm | 難易度設定。オープン時はJS画面、説明は公式検索インデックスで確認 |
| e-typing トップ | https://www.e-typing.ne.jp/ | 入力種別、無料練習、腕試し |
| e-typing 会員機能 | https://www.e-typing.ne.jp/signup/ | カルテ、苦手キー・苦手指、段階的メニュー |
| e-typing ヘルプ | https://www.e-typing.ne.jp/help/006.asp | 成績記録とランキング |
| 寿司打 公式 | https://sushida.net/ | ゲーム、複数ローマ字表記、無料ブラウザ利用 |
| TypingClub 公式 | https://www.typingclub.com/ | 姿勢ガイド、入力再生、アカウント任意 |
| TypingClub 公式 handbook | https://elementary.typingclub.com/m/edclubdocs/media/pdf/typing-jungle-handbook.pdf | PDF印刷ページ8–10（PDFページ10–12）: 指のガイド、Dynamic Lessons、Anchoring Lessons |
| Typing.com TypeAI（2024-05-13） | https://www.typing.com/whats-new/1724963998/personalized-practice-now-powered-by-ai | 苦手キーを使うAI文章生成 |
| Typing.com 更新（2025-05-28） | https://www.typing.com/whats-new/1748442625/ | 学習段階を考慮したAI Problem Keys改善 |
| Ngram Type アプリ | https://ranelpadon.github.io/ngram-type/ | ソース種別、範囲、反復、閾値のUI |
| Ngram Type 公式 README | https://github.com/ranelpadon/ngram-type | カスタム素材、合格閾値、ブラウザ設定保存 |
| TypeWPM AI Coach | https://www.typewpm.com/ai-typing-coach/ | 個人別プログラム、再構成、任意の端末内AI、保存の説明。今回の企画再検討時に追加確認 |

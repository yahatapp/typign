import { defaultInput } from './romanization';
import type { Exercise, Segment, TrainingMode } from './types';

const k = (text: string): Segment => ({ type: 'kana', text });
const l = (text: string): Segment => ({ type: 'literal', text });
type Phrase = [display: string, segments: Segment[]];
const practice: Phrase[] = [
  ['変更の理由を説明する', [k('へんこうのりゆうをせつめいする')]],
  ['次の課題を記録する', [k('つぎのかだいをきろくする')]],
  ['小さな修正を先に試す', [k('ちいさなしゅうせいをさきにためす')]],
  ['今日の作業を整理する', [k('きょうのさぎょうをせいりする')]],
  ['確認した条件を残す', [k('かくにんしたじょうけんをのこす')]],
  ['入力の順番を確かめる', [k('にゅうりょくのじゅんばんをたしかめる')]],
  ['設計の意図を共有する', [k('せっけいのいとをきょうゆうする')]],
  ['新しい機能を追加する', [k('あたらしいきのうをついかする')]],
  ['手順を一つずつ確認する', [k('てじゅんをひとつずつかくにんする')]],
  ['原因が分かるまで調べる', [k('げんいんがわかるまでしらべる')]],
  ['画面が変わる条件を探す', [k('がめんがかわるじょうけんをさがす')]],
  ['結果を短い文にまとめる', [k('けっかをみじかいぶんにまとめる')]],
  ['APIの仕様を読む', [l('API'), k('のしようをよむ')]],
  ['READMEに手順を追記する', [l('README'), k('にてじゅんをついきする')]],
  ['typingの結果を保存する', [l('typing'), k('のけっかをほぞんする')]],
  ['runningの状態を確認する', [l('running'), k('のじょうたいをかくにんする')]],
  ['設定のkeyとvalueを確認する', [k('せっていの'), l('key'), k('と'), l('value'), k('をかくにんする')]],
  ['GET /apiの応答を見る', [l('GET /api'), k('のおうとうをみる')]],
  ['user_idを条件に加える', [l('user_id'), k('をじょうけんにくわえる')]],
  ['配列を[]で表す', [k('はいれつを'), l('[]'), k('であらわす')]],
  ['関数の()に値を渡す', [k('かんすうの'), l('()'), k('にあたいをわたす')]],
  ['時刻を12:30に設定する', [k('じこくを'), l('12:30'), k('にせっていする')]],
  ['キャッシュを一度消す', [k('きゃっしゅをいちどけす')]],
  ['チームの予定を調整する', [k('ちーむのよていをちょうせいする')]],
  ['ファイルの名前をそろえる', [k('ふぁいるのなまえをそろえる')]],
  ['全員が同じ条件で試す', [k('ぜんいんがおなじじょうけんでためす')]],
];
const evaluation: Phrase[] = [
  ['変更の内容を確認する', [k('へんこうのないようをかくにんする')]],
  ['前の結果を記録する', [k('まえのけっかをきろくする')]],
  ['短い説明を先に書く', [k('みじかいせつめいをさきにかく')]],
  ['今日の予定を共有する', [k('きょうのよていをきょうゆうする')]],
  ['比較した条件を残す', [k('ひかくしたじょうけんをのこす')]],
  ['入力の流れを確かめる', [k('にゅうりょくのながれをたしかめる')]],
  ['設計の理由を説明する', [k('せっけいのりゆうをせつめいする')]],
  ['必要な設定を追加する', [k('ひつようなせっていをついかする')]],
  ['処理を一つずつ調べる', [k('しょりをひとつずつしらべる')]],
  ['原因が同じかを確かめる', [k('げんいんがおなじかをたしかめる')]],
  ['表示が変わる条件を探す', [k('ひょうじがかわるじょうけんをさがす')]],
  ['課題を短い文にまとめる', [k('かだいをみじかいぶんにまとめる')]],
  ['APIの結果を確認する', [l('API'), k('のけっかをかくにんする')]],
  ['READMEに条件を記載する', [l('README'), k('にじょうけんをきさいする')]],
  ['testingの結果を保存する', [l('testing'), k('のけっかをほぞんする')]],
  ['loadingの状態を記録する', [l('loading'), k('のじょうたいをきろくする')]],
  ['設定のnameとvalueを調べる', [k('せっていの'), l('name'), k('と'), l('value'), k('をしらべる')]],
  ['GET /dataの応答を見る', [l('GET /data'), k('のおうとうをみる')]],
  ['item_idを一覧に加える', [l('item_id'), k('をいちらんにくわえる')]],
  ['空の配列を[]で示す', [k('からのはいれつを'), l('[]'), k('でしめす')]],
  ['関数の()に数を入れる', [k('かんすうの'), l('()'), k('にかずをいれる')]],
  ['時刻を13:20に変更する', [k('じこくを'), l('13:20'), k('にへんこうする')]],
  ['キャッシュの中身を調べる', [k('きゃっしゅのなかみをしらべる')]],
  ['チームの役割を確認する', [k('ちーむのやくわりをかくにんする')]],
  ['ファイルの場所をそろえる', [k('ふぁいるのばしょをそろえる')]],
  ['全員が別の文章で試す', [k('ぜんいんがべつのぶんしょうでためす')]],
];

const PATTERNS = ['ng', 'ing', 'sh', 'ch', 'ts', 'ky', 'nn', 'ai', 'ou', 'ei', 'ka', 'ri', 'ra', 'te', 'no', 'mi', 'th', 'pr', 're', 'co', 'ion', 'API', 'README', '()', '[]', '/', '_', ':', '-'];
const allModes: TrainingMode[] = ['speed', 'accuracy', 'weakness', 'new-pattern'];
const make = (id: string, display: string, segments: Segment[], purpose: Exercise['purpose'], category: Exercise['category'], difficulty: number, modes = allModes): Exercise => {
  const result: Exercise = { id, version: 1, display, reading: segments.map((segment) => segment.text).join(''), segments, category, purpose, difficulty, patterns: [], modes };
  const canonical = defaultInput(result);
  result.patterns = PATTERNS.filter((pattern) => canonical.includes(pattern));
  if (!result.patterns.length) result.patterns = [canonical.slice(0, Math.min(2, canonical.length))];
  return result;
};

/** Original authored material. Evaluation items are never selected as drills. */
export const EXERCISES: Exercise[] = [
  ...practice.map(([display, segments], index) => make(`phrase-p-${String(index + 1).padStart(2, '0')}`, display, segments, 'practice', segments.some((segment) => segment.type === 'literal') ? 'mixed' : 'japanese', index < 12 ? 2 : 3)),
  ...evaluation.map(([display, segments], index) => make(`phrase-e-${String(index + 1).padStart(2, '0')}`, display, segments, 'evaluation', segments.some((segment) => segment.type === 'literal') ? 'mixed' : 'japanese', index < 12 ? 2 : 3)),
  ...['typing', 'prompt', 'README', 'configuration', 'testing', 'running', 'string', 'training', 'request', 'response', 'function', 'keyboard'].map((text, index) => make(`word-${index + 1}`, text, [l(text)], 'practice', 'english', 1)),
  ...['ing ng ring', 'shi si shi', 'chi ti chi', 'tsu tu tsu', 'kya kyu kyo', 'API API', 'README README', 'n n\' nn'].map((text, index) => make(`drill-${index + 1}`, text, [l(text)], 'practice', 'drill', 1)),
  ...['() [] ()', '/api /data', 'key: value', 'user_id item_id', 'a-b a_b', '`code` ()'].map((text, index) => make(`symbol-${index + 1}`, text, [l(text)], 'practice', 'symbols', 1)),
  ...['building', 'planning', 'CHANGELOG', 'validation', 'interface', 'compare'].map((text, index) => make(`word-e-${index + 1}`, text, [l(text)], 'evaluation', 'english', 1)),
  ...['[] () []', '/items /users', 'name: type', 'team_id task_id', 'x_y x-y', '`value` []'].map((text, index) => make(`symbol-e-${index + 1}`, text, [l(text)], 'evaluation', 'symbols', 1)),
];

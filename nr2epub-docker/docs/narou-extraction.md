# なろうHTML取得・抽出仕様

## 対象URL
- 作品トップ: https://ncode.syosetu.com/{ncode}/
- 話ページ: https://ncode.syosetu.com/{ncode}/{episode}/

## 取得ポリシー（実装状況）

### 実装済み
- ✅ User-Agent明示（デフォルト: Chrome 120.0相当）
- ✅ キャッシュ機能（メモリ + ファイルベース）
- ✅ 条件付きリクエスト（ETag/If-Modified-Since）
- ✅ なろう更新情報チェック（episodeUpdateTime）

### 未実装
- ⏱️ 取得間隔制限（現状：無制限）
- 🔄 リトライ機能（指数バックオフ）

## 作品トップの抽出（実装済み）

| 要素 | セレクタ | 実装 |
|---|---|---|
| 表題 | h1.p-novel__title | ✅ |
| 著者 | .p-novel__author a | ✅ |
| あらすじ | #novel_ex.p-novel__summary | ✅ |
| 最終更新 | .p-novel__date-published | ✅ |
| 章/話一覧 | .p-eplist__sublist | ✅ |
| 話タイトル | .p-eplist__subtitle | ✅ |
| 話リンク | a タグのhref | ✅ |
| 話番号 | a タグのhref末尾: /(\d+)/ | ✅ |

## 話ページの抽出（実装済み）

| 要素 | セレクタ | 実装 |
|---|---|---|
| 話タイトル | h1.p-novel__title | ✅ |
| 本文 | .js-novel-text.p-novel__text | ✅ |
| 前書き | .p-novel__text--preface | ✅ |
| 後書き | .p-novel__text--afterword | ✅ |

## 正規化と処理ルール

### ブロック分類
- **preface**: 前書き（.p-novel__text--preface）
- **body**: 本文（.js-novel-text.p-novel__text で前書き/後書き以外）
- **afterword**: 後書き（.p-novel__text--afterword）

各ブロックは `EpisodeBlock { kind, html, text }` として返却。

### インライン要素処理（実装）
- **ルビ**: `<ruby>` タグのHTML保持（XHTML生成時に処理）
- **傍点**: `<span>` class で処理（実装により異なる）
- **強調**: `<em>/<strong>` タグ保持
- **改ページ**: `<br>` や特定パターンから推定（実装：現状は基本的な対応）

### HTML/プレーンテキスト変換
- `html`: 元のHTML形式を保持（EPUB生成時に正規化）
- `text`: HTMLタグを除去したプレーンテキスト

## AozoraEpub3互換性

### セレクタ対応
| AozoraEpub3の定義 | 実装セレクタ | 備考 |
|---|---|---|
| TITLE | h1.p-novel__title | 作品・話両用 |
| AUTHOR | .p-novel__author a | |
| DESCRIPTION | #novel_ex.p-novel__summary | |
| HREF | .p-eplist__sublist a | 話リンク |
| CONTENT_PREAMBLE | .p-novel__text--preface | 前書き |
| CONTENT_ARTICLE | .js-novel-text.p-novel__text | 本文 |
| CONTENT_APPENDIX | .p-novel__text--afterword | 後書き |

### フォールバック（現状：未実装）
- セレクタが見つからない場合：エラーログ出力（代替処理なし）
- 話タイトルが空の場合：空文字列（代替処理なし）

将来的には、近接要素や代替セレクタでの抽出を検討。

## over18対応
- novel18.syosetu.com 対応：現状なし（将来予定）
- over18 Cookie (`COOKIE over18=yes`) の自動付与：未実装

## 検証状況
- ✅ なろう公式サイトの現在のHTML構造で検証済み
- ⏱️ HTML構造変更への対応は適時実施予定

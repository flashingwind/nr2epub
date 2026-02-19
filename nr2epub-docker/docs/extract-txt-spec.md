# extract.txt 仕様書

## 概要

`extract.txt` は、AozoraEpub3互換のWeb小説サイト抽出ルール定義ファイルです。  
各サイトのHTML構造に応じたCSSセレクタと正規表現を定義することで、サイト固有のコーディングなしに作品情報と本文を抽出できます。

## ファイル配置

```
./web/
  ├── ncode.syosetu.com/
  │   └── extract.txt
  ├── kakuyomu.jp/
  │   └── extract.txt
  ├── novelist.jp/
  │   └── extract.txt
  └── ...
```

## 書式

### 基本構文

```
キー	CSSセレクタ[:位置][,セレクタ2[:位置]]	[正規表現パターン]	[置換文字列]
```

- **タブ区切り** で各フィールドを区切ります
- `#` または `##` で始まる行はコメント
- 空行は無視

### 位置指定

CSSセレクタの後に `:位置` を指定して要素を絞り込みます：

| 指定 | 意味 |
|------|------|
| `:0` | 最初の要素 |
| `:1` | 2番目の要素 |
| `:-1` | 最後の要素 |
| (省略) | すべての要素 |

### 複数セレクタ

カンマ区切りで複数のセレクタを指定できます。**前方優先**で処理されます：

```
TITLE	.p-novel__title:0,.novel_title:0
```

→ `.p-novel__title:0` が見つかればそれを使用、なければ `.novel_title:0` を試行

### 正規表現置換

タブ区切りの3番目と4番目で正規表現パターンと置換を指定：

```
AUTHOR	.novel_writername:0	作者：	
```

→ `作者：田中太郎` から `作者：` を除去して `田中太郎` を抽出

## 主要キー一覧

### 作品メタデータ（一覧ページ）

| キー | 説明 | 例 |
|------|------|-----|
| `SERIES` | シリーズタイトル | `.p-novel__series-link a:0` |
| `TITLE` | 作品タイトル | `.p-novel__title:0` |
| `AUTHOR` | 著者名 | `.p-novel__author:0` |
| `DESCRIPTION` | 作品説明 | `#novel_ex:0` |
| `COVER_IMG` | 表紙画像URL | `.novel_img img:0` |

### 目次・リンク（一覧ページ）

| キー | 説明 | 例 |
|------|------|-----|
| `HREF` | 各話へのリンク | `.p-eplist__sublist a` |
| `SUB_UPDATE` | 各話の更新日時 | `.p-eplist__update` |
| `SUBTITLE_LIST` | 一覧ページの話タイトル | `#maind .ss td a` |

### 本文抽出（各話ページ）

| キー | 説明 | 例 |
|------|------|-----|
| `CONTENT_CHAPTER` | 章タイトル（大見出し） | `.chapter_title:0` |
| `CONTENT_SUBTITLE` | 話タイトル（中見出し） | `.novel_subtitle:0` |
| `CONTENT_ARTICLE` | 本文 | `#novel_honbun:0` |
| `CONTENT_PREAMBLE` | 前書き | `#novel_p:0` |
| `CONTENT_APPENDIX` | 後書き | `#novel_a:0` |
| `CONTENT_IMG` | 挿絵画像 | `.novel_img img` |

### その他の設定

| キー | 説明 | 例 |
|------|------|-----|
| `PAGER_MAX` | ページャーの最大値 | `100` |
| `INDEX` | 目次コンテナ | `.p-eplist:0` |
| `LAST_PAGE` | 最終ページリンク | `.c-pager__item--last:0` |

## 実例

### 小説家になろう (ncode.syosetu.com)

```
################################
### 小説を読もう！
### https://yomou.syosetu.com/
################################

## 一覧ページの抽出設定
TITLE	.p-novel__title:0,.novel_title:0
AUTHOR	.p-novel__author:0,.novel_writername:0	作者：	
DESCRIPTION	#novel_ex:0
COVER_IMG	.novel_img img:0

## 各話へのリンク
HREF	.p-eplist__sublist a,.subtitle a
SUB_UPDATE	.p-eplist__update,.long_update

## 各話の抽出設定
CONTENT_CHAPTER	.chapter_title:0
CONTENT_SUBTITLE	.novel_subtitle:0
CONTENT_ARTICLE	#novel_honbun:0
CONTENT_PREAMBLE	#novel_p:0
CONTENT_APPENDIX	#novel_a:0
```

### カクヨム (kakuyomu.jp)

```
################################
### カクヨム
### https://kakuyomu.jp/works/
################################

## 一覧ページの抽出設定
TITLE	#workTitle a:0
AUTHOR	#workAuthor-activityName a:0
DESCRIPTION	#introduction:0

## 各話へのリンク
HREF	.widget-toc-items a
SUB_UPDATE	.widget-toc-episode-datePublished

## 各話の抽出設定
CONTENT_CHAPTER	.chapterTitle:0
CONTENT_SUBTITLE	.widget-episodeTitle:0
CONTENT_ARTICLE	.widget-episodeBody
```

## 正規表現の詳細

### パターン例

#### 1. 接頭辞除去

```
AUTHOR	.username:0	作者：	
```

→ `作者：田中太郎` → `田中太郎`

#### 2. HTMLタグ除去

```
TITLE	.novel_title:0	(^.*</div>)	
```

→ `<div class="label">改稿版</div>タイトル` → `タイトル`

#### 3. 複数パターン

```
CONTENT_SUBTITLE	.novel_subtitle	(（改稿版）)|(^.*<br />)	
```

→ `（改稿版）第1話` → `第1話`  
→ `<br />序章` → `序章`

#### 4. グループ抽出

```
CONTENT_UPDATE_LIST	.long_update	^([^<]+)(<span title="([^"]+)".*)?$	$1 公開　$3
```

→ `2024/01/15<span title="2024/01/15 10:00">` → `2024/01/15 公開　2024/01/15 10:00`

## 処理フロー

### 1. 作品一覧ページの処理

```
1. 作品URLからHTMLを取得
2. extract.txt を読み込み
3. TITLE, AUTHOR, DESCRIPTION, COVER_IMG を抽出
4. HREF で各話のリンクを抽出
5. SUB_UPDATE で更新日時を抽出（キャッシュ判定用）
```

### 2. 各話ページの処理

```
1. 各話URLからHTMLを取得
2. CONTENT_CHAPTER で章タイトルを抽出
3. CONTENT_SUBTITLE で話タイトルを抽出
4. CONTENT_PREAMBLE で前書きを抽出
5. CONTENT_ARTICLE で本文を抽出
6. CONTENT_APPENDIX で後書きを抽出
7. CONTENT_IMG で挿絵を抽出
```

## 実装における注意点

### 1. innerHTML vs textContent

- **メタデータ系** (TITLE, AUTHOR等): innerHTML を取得後、正規表現を適用してタグ除去
- **本文系** (CONTENT_ARTICLE等): 再帰的に処理してHTMLタグを青空文庫注記に変換

### 2. 位置指定の挙動

```typescript
const elements = $(selector);
if (position >= 0) {
  return elements.eq(position); // :0 → 最初の要素
} else if (position < 0) {
  return elements.eq(elements.length + position); // :-1 → 最後の要素
}
```

### 3. フォールバック処理

複数セレクタが指定された場合、順に試行して最初にマッチしたものを返す：

```typescript
const selectors = "..p-novel__title:0,.novel_title:0".split(",");
for (const selector of selectors) {
  const result = extract(selector);
  if (result) return result;
}
```

### 4. 正規表現の安全性

ユーザー入力ではなく管理下のファイルなので、信頼して正規表現を使用可能。  
ただし、不正な正規表現はエラーハンドリングが必要：

```typescript
try {
  const regex = new RegExp(pattern);
  return text.replace(regex, replacement);
} catch (error) {
  console.warn(`Invalid regex in extract.txt: ${pattern}`);
  return text;
}
```

## 今後の拡張

### 対応予定サイト

- `./web/` 配下に定義済み:
  - ncode.syosetu.com ✅
  - novel18.syosetu.com
  - novelist.jp
  - kakuyomu.jp
  - novelup.plus
  - syosetu.org
  - novel.fc2.com
  - www.akatsuki-novels.com
  - www.mai-net.net

### 実装予定機能

- [ ] extract.txt の動的読み込み
- [ ] サイト自動判定（URLからドメイン抽出）
- [ ] extract.txt のバリデーション
- [ ] カスタムextract.txtのサポート（ユーザー定義）

## 参考

- AozoraEpub3: https://github.com/kyukyunyorituryo/AozoraEpub3
- 本家の extract.txt: `AozoraEpub3/web/*/extract.txt`

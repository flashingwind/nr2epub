# EPUB テンプレート仕様

## EPUB3 ファイル構成
```
EPUB/
  mimetype                       （非圧縮、先頭固定）
  META-INF/
    container.xml                （パッケージドキュメント位置）
  OEBPS/
    content.opf                  （メタデータ・manifest・spine）
    nav.xhtml                    （目次、landmarks）
    toc.ncx                      （Kindle互換、階層目次）
    css/
      style.css                  （縦書きスタイル）
    xhtml/
      cover.xhtml                （表紙）
      title.xhtml                （表題）
      chapter-0001.xhtml         （本文、複数ファイル）
      ...
    images/
      cover.jpg                  （表紙画像）
      page-0001.jpg etc          （本文画像）
```

## XHTML テンプレート

### cover.xhtml（表紙）
- 表紙画像を1枚配置
- `<img src="../images/cover.jpg" style="width:100%;" />`
- コンテナのlanding page指定

### title.xhtml（表題ページ）
- 縦書き中央配置
- 要素: `<h1>` (タイトル)、`<author>` (著者)、`<date>` (公開日)
- スタイル: `.title`, `.author` クラス

### chapter-NNNN.xhtml（本文）
- エピソードまたは複数エピソードをセクション分割
- 前書き・本文・後書きを `<section>` で分離
- 各セクションに `<h2>` 見出し
- 段落は `<p>` で囲む

### nav.xhtml（目次）
- `<nav epub:type="toc">` に TOC リストを配置
- `<nav epub:type="landmarks">` にランドマーク（cover, bodymatter等）を配置
- EPUB3標準形式

## CSS スタイル（style.css）

### 基本（縦書き）
```css
body {
  writing-mode: vertical-rl;
  text-orientation: upright;
}
```

### クラス
| クラス | 用途 | CSS |
|---|---|---|
| `.body` | 本文 | 基本スタイル |
| `.title` | タイトル | フォントサイズ大、太字 |
| `.author` | 著者 | フォントサイズ小 |
| `.chapter` | 章見出し | フォントサイズ大 |
| `.ruby` | ルビ | ruby-position: over |
| `.tcy` | 縦中横 | text-combine: horizontal |
| `.page-break` | 改ページ | page-break-before: always |
| `.image-page` | 画像単ページ | 画像が100%表示 |
| `.center` | 中央寄せ | text-align: center |
| `.indent-n` | 字下げ | text-indent の段階 |

## メタデータ（content.opf）

### 必須要素
- `dc:title` - 作品タイトル
- `dc:creator` - 著者（著者名）
- `dc:language` - ja
- `dc:identifier` - UUID（urn:uuid:...）

### オプション要素
- `dcterms:modified` - 修正日時（ISO8601）
- `dc:publisher` - "小説家になろう"（固定）
- `dc:description` - あらすじ
- `dc:source` - 元URL

### EPUB3-specific
- `meta name="rendition:layout"` value="reflowable"
- `meta name="rendition:orientation"` value="portrait"
- `meta name="rendition:spread"` value="none"

## 実装済み機能（2025-02-19）
- ✅ cover.xhtml テンプレート
- ✅ title.xhtml テンプレート
- ✅ chapter-NNNN.xhtml テンプレート（可変エピソード対応）
- ✅ nav.xhtml 自動生成（TOC + landmarks）
- ✅ toc.ncx 自動生成（Kindle互換、階層構造）
- ✅ style.css（縦書き、基本クラス）
- ✅ content.opf メタデータ自動生成
- ✅ 画像処理（sharp による最適化）

## 今後の拡張予定
- 外字（GAIJI）画像埋め込み
- より詳細なランドマーク定義
- EPUB2後方互換オプション

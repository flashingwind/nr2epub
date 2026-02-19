# EPUB3出力仕様（Kindle向け）

## 基本構造
```
EPUB アーカイブ (ZIP形式)
├── mimetype
├── META-INF/
│   └── container.xml
└── OEBPS/
    ├── content.opf
    ├── nav.xhtml
    ├── toc.ncx
    ├── css/
    │   └── style.css
    ├── xhtml/
    │   ├── cover.xhtml
    │   ├── title.xhtml
    │   ├── chapter-0001.xhtml
    │   └── ...
    └── images/
        ├── cover.jpg
        └── ...
```

## メタデータ（content.opf）

### 主要要素
- `dc:title` - 作品タイトル
- `dc:creator` - 著者名
- `dc:language` - ja（固定）
- `dc:identifier` - urn:uuid:{UUID}
- `dc:description` - あらすじ
- `dc:publisher` - 小説家になろう（固定）
- `dcterms:modified` - 修正日時（ISO8601）

### manifest
- nav.xhtml（プロパティ: nav）
- toc.ncx（メディアタイプ: application/x-dtbncx+xml）
- XHTML ファイル（複数）
- CSS
- 画像ファイル（jpg, png）

### spine
読む順序
1. cover.xhtml
2. title.xhtml
3. chapter-0001.xhtml
4. chapter-0002.xhtml
5. ...

（目次ページは nav.xhtml で自動生成）

## nav.xhtml（EPUB3目次）

### 構成
- `<nav epub:type="toc">`:
  - `<ol>` リストで章/話階層を表現
  - 各アイテムにリンク

- `<nav epub:type="landmarks">`:
  - cover, bodymatter, toc など

### 例
```xml
<nav epub:type="toc">
  <ol>
    <li><a href="chapter-0001.xhtml">第1話</a></li>
    <li><a href="chapter-0002.xhtml">第2話</a></li>
  </ol>
</nav>
```

## toc.ncx（Kindle互換目次）

- Kindle では EPUBNav（nav.xhtml）に未対応の機種がある
- 互換性のため toc.ncx を併用
- 階層構造対応（navPoints）

## XHTMLテンプレート

### cover.xhtml（表紙）
- `<img src="../images/cover.jpg" />` で表紙画像を配置
- width: 100% で端末幅に合わせる
- content.opf に `<reference>` で landing-page 指定

### title.xhtml（表題ページ）
- 縦書き中央配置
- `<h1>` (タイトル)
- `<p class="author">` (著者)
- `<p class="published">` (公開日)

### chapter-NNNN.xhtml（本文）
- エピソード 1 = 1 ファイルに対応
- 各エピソード内の前書き・本文・後書きを `<section>` で分離
- 段落は `<p>` タグ使用

## CSS（style.css）

### 縦書き基本
```css
body {
  writing-mode: vertical-rl;
  text-orientation: upright;
  line-height: 1.8;
  font-size: 100%;
}
```

### 主要クラス
| クラス | 用途 |
|---|---|
| `.body` | 本文基底 |
| `.title` | タイトル（大きさ） |
| `.author` | 著者名 |
| `.chapter` | 章見出し |
| `.ruby` | ルビ（ruby-position: over） |
| `.tcy` | 縦中横（text-combine: horizontal） |
| `.page-break` | 強制改ページ |
| `.image-page` | 画像単ページ |
| `.center` | 中央寄せ |

## 画像処理（実装状況）

### 表紙
- 配置: cover.xhtml で 100% 幅表示
- フォーマット: jpg または png
- サイズ: sharp で最適化（maxWidth: 1272, maxHeight: 1696）

### 本文中の画像
- インライン配置（`<img>` タグ）
- 解像度最適化：sharp で JPEG 品質 medium
- WebP 非対応（互換性重視）
- 単ページ化：現状は実装されず

## 固定設定

| 項目 | 値 | 理由 |
|---|---|---|
| 画像単ページ化 | なし | 将来実装 |
| 余白除去 | なし | 将来実装 |
| 4バイト文字変換 | なし | 将来実装 |

## 互換基準

- ✅ EPUB3 標準に準拠
- ✅ Kindle デバイス（Paperwhite, Oasis等）で表示可能
- ⏱️ EPUBCheck 通過（検証予定）  
- ⏱️ AozoraEpub3 出力との差分比較（検証予定）

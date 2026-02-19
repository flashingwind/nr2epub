# EPUB Builder 実装仕様

## モジュール構成

### EpubBuilder
- メタデータ、manifest、spine を管理するメインクラス
- content.opf 生成
- 各アイテムの登録・順序管理

### EpubPackager
- EPUB ファイル構造を生成（ZIP形式）
- mimetype（非圧縮）を先頭に配置
- Stream または ファイル出力に対応

### テンプレートエンジン
- generateCoverXhtml: 表紙ページ生成
- generateTitleXhtml: 表題ページ生成
- generateChapterXhtml: 本文章ページ生成
- navXhtml生成（nav.xhtml）
- tocNcx生成（toc.ncx）

### スタイルシート
- style.css: 縦書き基本スタイル
- クラス: .body, .title, .ruby, .tcy, etc.

## 生成フロー

```
generateEpub({workTop, episodes})
  ↓
EpubBuilder 初期化（メタデータ設定）
  ↓
Manifest アイテム追加
  - cover.xhtml
  - title.xhtml
  - nav.xhtml
  - toc.ncx
  - chapter-0001.xhtml～N
  - style.css
  - cover.jpg etc（画像）
  ↓
Spine 構築（読む順序）
  - cover
  - title
  - nav
  - chapters...
  ↓
content.opf 生成
  ↓
nav.xhtml 生成（TOC）
  ↓
toc.ncx 生成（Kindle互換）
  ↓
XHTMLテンプレート展開
  - cover, title, chapters
  - 画像処理（埋め込み/参照）
  ↓
ZIP構築（archiver）
  - mimetype（先頭、非圧縮）
  - META-INF/container.xml
  - OEBPS/content.opf
  - OEBPS/nav.xhtml etc
  ↓
Stream 返却（メール/ダウンロード用）
```

## 実装済み機能

| 機能 | 実装 | ファイル |
|---|---|---|
| content.opf 生成 | ✅ | builder.ts |
| nav.xhtml 生成 | ✅ | generator.ts |
| toc.ncx 生成 | ✅ | builder.ts |
| 表紙テンプレート | ✅ | templates.ts |
| 表題テンプレート | ✅ | templates.ts |
| 本文テンプレート | ✅ | templates.ts |
| CSS生成 | ✅ | generator.ts, style.css |
| ZIP出力 | ✅ | packager.ts |
| Stream返却 | ✅ | packager.ts |
| 画像処理 | ✅ | generator.ts |

## 将来の拡張予定

- EPUB2互換オプション
- KF8（Kindle形式）対応
- 外字（GAIJI）の画像埋め込み

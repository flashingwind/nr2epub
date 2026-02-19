# nr2epub 概要

## 目的
- 小説家になろう（なろう）の作品を EPUB3（縦書き）に自動変換。
- 変換済み EPUB を**ダウンロード** または **メール送信** で配布。
- Web UI経由でブラウザから操作可能。

## スコープ

### 対応機能
- **取得・抽出**：なろう作品ページから メタデータと本文を自動抽出
- **カッシュ**：条件付きリクエストとなろう更新チェック付きキャッシュ
- **EPUB3生成**：縦書き、表紙、表題ページ、目次、本文xhtml、CSS
- **メール配送**：SMTP（TLS/STARTTLS）でEPUBを添付送信
- **Web UI**：ブラウザから URL入力 → ダウンロード/メール送信

### 出力フォーマット
- EPUB3（立書き固定）
- Kindle対応（nav.xhtml + toc.ncx）
- メタデータ：dc:title, dc:creator等

## 非スコープ

### 実装しない機能
- なろう以外のサイト対応（将来は検討）(./web/)
- GUIアプリケーション（現状：Web UI のみ）
- CLI インターフェース（将来対応予定）
- 設定ファイル（INI形式、将来実装予定）

## システム構成

```
┌─────────────────────────────────────────┐
│  ブラウザ（Web UI）                     │
│  - 作品URL入力                          │
│  - メール送信設定                       │
│  - ダウンロード/メール選択              │
└──────────────┬──────────────────────────┘
               │ HTTP
┌──────────────▼──────────────────────────┐
│  Express サーバー（Node.js）            │
│  - API エンドポイント                   │
│  - ジョブ管理                           │
└──────┬──────────────────┬───────────────┘
       │                  │
   ┌───▼────┐        ┌────▼─────┐
   │ なろう │        │ SMTP      │
   │ サーバ│        │ メール    │
   └────────┘        └──────────┘
```

## 主要モジュール

| モジュール | 役割 |
|---|---|
| [webnovel/](../src/webnovel/) | 小説サイト HTML 取得・抽出・正規化 |
| [epub/](../src/epub/) | EPUB3 生成・パッケージング |
| [mail/](../src/mail/) | SMTP メール送信 |
| [config/](../src/config/) | 設定管理（将来拡張） |
| [web/](../web/) | AozoraEpub3互換の抽出ルール定義 (未使用) |

### 抽出ルール (`./web/`)

`AozoraEpub3/web/` から移動したサイト別の抽出ルール定義ファイル群。  
**✅ 実装完了** - extract.txt パーサーとセレクター実装済み。

**実装状況**:
- ✅ extract.txt パーサー (`src/webnovel/extract-parser.ts`)
- ✅ CSS セレクター適用 (`src/webnovel/extract-selector.ts`)
- ✅ ドメイン別ローダー (`src/webnovel/extract-loader.ts`)
- ✅ 作品情報抽出 (`src/webnovel/extract-work-with-config.ts`)
- ✅ エピソード抽出 (`src/webnovel/extract-episode-with-config.ts`)
- ✅ EPUB3 検証完全合格 (EPUBCheck v4.2.6)

**利用可能なサイト定義**:
- ✅ `ncode.syosetu.com/` - 小説家になろう本家 (extract.txt 動作確認済み)
- ✅ `novel18.syosetu.com/` - なろう18禁版 (extract.txt 利用可能)
- ✅ `novelist.jp/` - ノベリスト (extract.txt 利用可能)
- ✅ `kakuyomu.jp/` - カクヨム (extract.txt 利用可能)
- その他 (novelup.plus, syosetu.org, etc.) - extract.txt 利用可能

**現在の実装**: `src/webnovel/selectors.ts` でハードコードされたセレクタを使用。  
**次のステップ**: 既存コードを extract.txt ベースに移行して複数サイト対応。

詳細: [extract.txt 仕様書](extract-txt-spec.md)

## 技術スタック

### バックエンド
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **HTML解析**: cheerio
- **EPUB ZIPパッケージ**: archiver
- **画像処理**: sharp
- **メール**: nodemailer

### フロントエンド
- **HTML/CSS/JavaScript**: バニラ JS（フレームワークなし）
- **ローカルストレージ**: 設定の保存・復元

### デプロイ
- **Docker Compose**: docker-compose.yml で構成

## 前提・制約

### なろう対応
- [ncode.syosetu.com](https://ncode.syosetu.com) のみ対応
- [novelist.jp](https://novelist.jp) は将来対応予定

### User-Agent
- 明示的な User-Agent を設定（ブラウザなりすまし回避）
- デフォルト: `Mozilla/5.0 (Chrome 120相当)`

### キャッシュ
- **メモリキャッシュ**: リアルタイムレスポンス用
- **ファイルキャッシュ**: `.cache/` ディレクトリ（24時間有効）
- **更新チェック**: なろう掲載話の「更新日時」をキャッシュ検証に活用

### セキュリティ
- SMTP 認証情報：環境変数で保持
- ファイル名：危険文字をサニタイズ（日本語は保持）

## 参照仕様
- 改造版 AozoraEpub3 v1.1.1b31Q：互換性の基準
- EPUB3 標準：構造・メタデータの準拠基準

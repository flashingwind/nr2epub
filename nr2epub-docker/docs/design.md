# 設計

## アーキテクチャ方針
- パイプライン型（取得 -> 抽出 -> 正規化 -> EPUB生成 -> 配送）をWeb UI経由でジョブベースの非同期処理として実装。
- 互換レイヤでAozoraEpub3の設定項目を解釈し、出力に反映。
- キャッシュを活用し、更新チェック付き条件付きリクエストで効率化。

## 処理フロー

### 取得・抽出（REST API）
1. クライアント: 作品URLと話番号を指定
2. サーバー: fetchWithCache でなろうHTMLを取得
3. サーバー: parseWorkTop / parseEpisode で抽出
4. レスポンス: メタデータ、本文ブロック等

### EPUB生成・配送（ジョブベース非同期）
1. クライアント: /api/generate-epub にPOST（sendEmail フラグで動作指定）
2. サーバー: jobId を生成して即座に202応答
3. サーバー（非同期）:
   - fetchWithCache で全話取得（キャッシュ活用）
   - parseWorkTop / parseEpisode で抽出
   - generateEpub で EPUB3ストリーム生成
   - ダウンロード: ストリーム返却 / メール: MailSender で送信
4. クライアント: /api/job-progress/:jobId でポーリング（500ms）して進捗確認

## 主要モジュール
1. **Fetcher** (fetchWithCache, fetchRemote)
   - ETag/If-Modified-Since対応の条件付きリクエスト
   - キャッシュ（メモリ + ファイルベース）
   - なろう更新情報チェック

2. **Parser** (parseWorkTop, parseEpisode)
   - JSoupライク(cheerio)でCSS セレクタ抽出
   - NarouWorkTop, NarouEpisode型を返却

3. **EPUB Generator** (generateEpub)
   - metadata生成（dc:title, dc:creator等）
   - manifest/spine構築
   - XHTMLテンプレート展開（cover, title, chapter）
   - CSS生成（縦書き）
   - 画像処理（sharp で最適化/リサイズ）
   - mimetype, content.opf, nav.xhtml, toc.ncx生成
   - archiver で ZIP形式出力 / Stream返却

4. **MailSender** (sendEpub)
   - nodemailer でSMTP送信
   - EPUB をメール添付（application/epub+zip）
   - ファイル名の日本語対応（サニタイズ）

5. **Cache** (NarouCache)
   - メモリキャッシュ（Map）
   - ファイルシステムキャッシュ（JSON）
   - 有効期限管理（24h）

6. **Config**
   - 環境変数からSMTP設定読み込み
   - クライアント側で SMTP設定上書き可能

## 中間表現

### NarouWorkTop
- url, title, author, summary, publishedText
- episodes: EpisodeSummary[]

### EpisodeSummary
- title, url, episode

### NarouEpisode
- url, episode, title
- blocks: EpisodeBlock[] (kind: "text" | "afterword", html, text)

### EpubMetadata
- title, author, description, published, identifier, language, modified

## キャッシュ戦略
1. **エピソードキャッシュ（episodeUpdateTime活用）**
   - キャッシュ済みエピソードの場合、作品トップから更新日時を確認
   - 最終更新日が一致 → キャッシュ返却（ネットワークなし）
   - 更新検出 → リモート取得 → キャッシュ更新

2. **目次ページキャッシュ（条件付きリクエスト）**
   - ETag/If-Modified-Since でサーバー問い合わせ（軽量）
   - 304応答 → キャッシュ返却
   - 200応答 → ダウンロード → キャッシュ更新

3. **メモリキャッシュ優先**
   - 同一セッション内で複数回アクセスする場合はメモリから高速返却

## エラーハンドリング
- 話単位での失敗: ログに記録し、スキップして継続
- 未対応注記: 警告ログ出力、本文は簡略表現で出力
- キャッシュ取得失敗: リモート取得へ自動フォールバック
- SMTP送信失敗: ジョブのエラー状態に反映

## セキュリティ
- SMTP認証情報は環境変数または安全な設定で保持
- Web UIからの SMTP設定上書きは可能（テスト用）
- ファイル名の危険文字をサニタイズ

## ディレクトリ構成
```
src/
  index.ts                  # Express サーバー、API実装
   webnovel/
    extract.ts              # parseWorkTop, parseEpisode
    extract-work.ts, extract-episode.ts
    selectors.ts            # CSS セレクタ定義
    types.ts                # NarouWorkTop, NarouEpisode等
    normalize.ts            # HTML正規化
    cache.ts                # キャッシュ実装
  epub/
    generator.ts            # generateEpub
    builder.ts              # EpubBuilder (manifest/spine)
    packager.ts             # createEpubZip, createEpubStream
    templates.ts            # XHTMLテンプレート
    structure.ts            # EPUB構造（mimetype等）
    style.css               # 縦書きCSS
    types.ts                # メタデータ型
  mail/
    sender.ts               # MailSender
  config/
    index.ts, fixed.ts      # 設定管理（現状：環境変数/リクエストのみ）
public/
  index.html                # Web UI
```

## 互換ポリシー
- AozoraEpub3の設定項目と挙動に準拠するが、現状は固定値/デフォルト値で実装
- なろう固有情報（連載話数、最終更新日）は メタデータに保持

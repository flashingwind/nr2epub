# ロードマップ

## フェーズ 0: 環境構築（完了）
- Docker Compose でサーバー起動可能に
- ブラウザからHTTP経由でアクセス可能なWeb UI構築
- Express + TypeScript による基本的なAPI実装

## フェーズ 1: 取得・解析（完了）
- ✅ なろうHTML取得（fetchWithCache）
- ✅ 条件付きリクエスト対応（ETag, If-Modified-Since）
- ✅ キャッシュ機能（メモリ + ファイルベース）
- ✅ なろう更新情報チェック（episodeUpdateTime）
- ✅ 作品トップ抽出（parseWorkTop）
- ✅ エピソード抽出（parseEpisode）

## フェーズ 2: 変換と出力（完了）
- ✅ EPUB3基本構造（mimetype, container.xml）
- ✅ メタデータ生成（content.opf）
- ✅ 目次生成（nav.xhtml, toc.ncx）
- ✅ XHTMLテンプレート（cover, title, chapter）
- ✅ 縦書きCSS生成（writing-mode: vertical-rl）
- ✅ 画像処理（sharp での最適化）
- ✅ ZIP形式出力（archiver）
- ✅ ストリーム返却（メール添付対応）

## フェーズ 3: メール配送（完了）
- ✅ SMTP送信（nodemailer）
- ✅ TLS/STARTTLS対応
- ✅ メール設定（環境変数 + Web UI設定）
- ✅ EPUB添付（application/epub+zip）
- ✅ ファイル名のサニタイズ（日本語対応）

## フェーズ 4: Web UI と非同期処理（完了）
- ✅ 作品URL入力フォーム
- ✅ エピソード指定（カンマ/範囲指定対応）
- ✅ ダウンロード / メール送信の切替
- ✅ ジョブベースの非同期処理
- ✅ ジョブ進捗表示（ポーリング）
- ✅ 設定の保存・復元（LocalStorage）
- ✅ エクスポート・インポート（JSON）

## フェーズ 5: 互換性検証と調整（進行中）

### 実施済みテスト
- ✅ 基本的なEPUB3構造生成（実装で確認）
- ✅ メタデータ出力（content.opf自動生成）

### 進行中のテスト
- 📋 EPUB3 Validation通過確認
  - テストツール: [EPUBCheck](https://www.w3.org/publishing/epubcheck/)
  - テスト対象: 短編1作品、連載5話
  - 実行方法: `scripts/test-epub-validation.sh`
  
- 🖥️ Kindle表示互換確認
  - テストツール: [Kindle Previewer](https://www.amazon.com/Kindle-Previewer)
  - 検証項目:
    - 縦書き表示正常性
    - ルビ・傍点表示
    - 画像配置
    - nav.xhtml + toc.ncx での目次表示
  - 状態: 手動テスト待機中

- 📊 AozoraEpub3との差分比較
  - 比較対象:
    - 同一作品で AozoraEpub3 と nr2epub で生成
    - ファイルサイズ、XHTML構造、CSSの違いを確認
  - 測定項目:
    - メタデータ正確性（title, author, description）
    - 本文ブロック構造（preface, body, afterword）
    - 目次生成（章/話の抽出完全性）

### 未実施のテスト
- ⏱️ パフォーマンス確認（1000話規模）
  - 目標: メモリ使用量、実行時間を測定
  - 予定: フェーズ6で最適化時に実施

## フェーズ 6: 追加機能（将来）

### 優先度1: ダウンロード機能完成
- ブラウザでの EPUB ダウンロード実装
  - 現状：ジョブ進捗のみ管理、ファイル取得なし
  - 計画：GET /api/epub/:jobId でストリーム返却
  - または：一時ファイル保存 → ダウンロード

- メール送信機能の拡充
  - 複数メールアドレスへの一括送信
  - 送信ログ保存

### 優先度2: 設定管理

**注**: `./web/` ディレクトリは `AozoraEpub3/web/` から移動済み。AozoraEpub3互換の抽出ルール（`extract.txt`）が各サイト用に用意されています。

- **web/extract.txt 形式の抽出ルール対応** ✅ **実装完了**
  - 現状: `./web/ncode.syosetu.com/extract.txt` 等が利用可能
  - 実装: extract.txt パーサーとセレクター実装完了
    - `src/webnovel/extract-parser.ts` - extract.txt 解析
    - `src/webnovel/extract-selector.ts` - CSS セレクタ適用
    - `src/webnovel/extract-loader.ts` - ドメイン別読み込み
    - `src/webnovel/extract-work-with-config.ts` - 作品情報抽出
    - `src/webnovel/extract-episode-with-config.ts` - エピソード抽出
  - テスト: ✅ 検証完了（EPUBCheck 完全合格）
  - ドキュメント: `docs/extract-txt-spec.md`
  - 対象サイト:
    - ✅ ncode.syosetu.com (なろう本家) - extract.txt 利用可能
    - ✅ novel18.syosetu.com - extract.txt 利用可能
    - ✅ novelist.jp - extract.txt 利用可能
    - ✅ kakuyomu.jp - extract.txt 利用可能
    - その他 (novelup.plus, syosetu.org, etc.) - extract.txt 利用可能
  - **次のステップ**: 既存のハードコードされたセレクタを extract.txt に置き換え

- INI ファイル設定対応
  - profile/*.ini の読み込み
  - 設定プリセット機能

- CLI インターフェース実装
  - コマンドライン引数対応
  - バッチ処理対応

### 優先度3: パフォーマンス・互換性
- リトライ機能
  - 指数バックオフ実装
  - 話単位での失敗時再試行

- 差分更新
  - 新エピソードのみ取得
  - キャッシュ有効期限管理

- パフォーマンステスト実施
  - 1000話規模での動作確認
  - メモリ・CPU 使用量測定

### 優先度4: 拡張機能
- 複数なろうサイト対応
  - novelist.jp
  - novel18.syosetu.com (over18対応)

- 画像処理の詳細設定化
  - 余白除去の有効/無効
  - 単ページ化の有効/無効
  - リサイズ方法の選択

- コメント処理の拡充
  - 会話文の自動判定
  - ツッコミ・地の文の区別

### 優先度低: 長期計画
- 外字（GAIJI）対応
  - 画像埋め込み
  - 代替文字への変換

- 横書き対応
  - CSS 制御で横書き選択可能に

- mobi 生成
  - Kindle 専用フォーマット対応

- GUIアプリ化
  - Electron 等でデスクトップ版提供

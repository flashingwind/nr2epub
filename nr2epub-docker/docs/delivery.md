# メール配送仕様

## 目的
- 生成したEPUBを指定されたメールアドレス（Kindle送信先など）へ送信する。

## 実装方式
- nodemailer を使用したSMTP送信
- TLS/STARTTLS対応
- 認証: ユーザー/パスワード、またはアプリパスワード（Gmail等）

## 配置
- src/mail/sender.ts (MailSender クラス)

## SMTP設定

### 環境変数（デフォルト）
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false        # true: ポート465 (SSL), false: ポート587 (TLS)
SMTP_USER=your-email@gmail.com
SMTP_PASS=app-password
```

### Web UIでの上書き
- SMTP設定を詳細設定で指定可能
- テスト用メール送信が容易に

## メール作成

### ヘッダ
- From: SMTP_USER（環境変数から自動取得）
- To: リクエストで指定
- Subject: `[EPUB] {title}`

### 本文
- シンプルなテキスト：`"EPUBファイルを添付しました:\n\n{title}"`

### 添付ファイル
- ファイル名: `[{author}]{title}.epub` （著者名がない場合は `{title}.epub`）
- Content-Type: `application/epub+zip`
- Content: EPUBバイナリ（Stream）

### ファイル名のサニタイズ
- ファイルシステムで許可されていない文字（\ / : * ? " < > |）を除去
- 日本語文字は保持
- 最大200文字

## API

### /api/generate-epub (sendEmail=true)
```
POST /api/generate-epub
Content-Type: application/json

{
  "workUrl": "https://ncode.syosetu.com/xxxxxx/",
  "episodeUrls": ["https://ncode.syosetu.com/xxxxxx/1/", ...],
  "author": "著者名",
  "title": "作品タイトル",
  "sendEmail": true,
  "recipient": "destination@example.com",
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "sender@gmail.com",
    "pass": "app-password"
  }
}

Response: 202 Accepted
{
  "jobId": "uuid-string",
  "message": "EPUB生成・送信を開始しました..."
}
```

### /api/send-epub (メール送信専用)
```
POST /api/send-epub
Content-Type: application/json

{
  "workUrl": "...",
  "episodeUrls": [...],
  "recipient": "destination@example.com",
  "smtp": {...},
  "author": "著者名",
  "title": "作品タイトル"
}

Response: 202 Accepted
{
  "jobId": "uuid-string",
  "message": "メール送信を開始しました..."
}
```

## ジョブ進捗確認
- GET /api/job-progress/:jobId
- クライアント側で 500ms ごとにポーリング
- 返り値:
  ```
  {
    "status": "processing" | "completed" | "error",
    "progress": 0-N,
    "total": N,
    "message": "メール送信中... (recipient@example.com)",
    "error": "エラーメッセージ（エラー時のみ）"
  }
  ```

## エラーハンドリング
- SMTP認証失敗: 400 bad request（接続前）/ ジョブエラー（接続後）
- ネットワークエラー: ジョブのエラー状態に記録
- リトライ: 現状は実装なし（将来機能）

## セキュリティ
- SMTP認証情報は環境変数で保持
- Web UIからのSMTP上書きは平文で送信（テスト環境向け）
- 本番環境ではHTTPS通信を必須とすること
- エクスポート設定時は認証情報をマスク表示

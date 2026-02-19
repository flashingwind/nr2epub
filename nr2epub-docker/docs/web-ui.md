# Web UI仕様

## 目的
- Docker Compose内で起動するWeb UIを提供し、なろう作品のEPUB生成とメール送信を行う。
- ブラウザから作品URLを入力し、ダウンロードまたはメール送信を選択。

## 機能
### 基本
- 作品URL入力
- 話番号の指定（カンマ区切りまたは範囲指定: 1,2,3 または 1-10）
- EPUB著者名・タイトルの手動入力

### ダウンロード
- 「EPUBをダウンロード」ボタン
- ブラウザのダウンロード機能でEPUBを保存
- リアルタイムで進捗を表示（ポーリング）

### メール送信
- 送信先メールアドレス入力
- SMTP設定（詳細設定で展開可能）入力
  - SMTPホスト、ポート、アカウント、パスワード
  - SSL/TLS設定
- 「メール送信」ボタン
  - 「ダウンロード」押下時と同処理
  - メールでEPUBファイル送信

### 設定管理
- 設定をブラウザ LocalStorage に保存
- 設定のエクスポート/インポート（JSON形式）
- キャッシュクリア機能

## API

### 取得・抽出
- POST /api/parse-work
  - 入力: { url }
  - 出力: { data: { title, author, summary, episodes } }

- POST /api/parse-episode
  - 入力: { url }
  - 出力: { data: { episode, title, blocks } }

### EPUB生成と配送
- POST /api/generate-epub
  - 入力: 
    ```
    {
      workUrl: string,
      episodeUrls: string[],
      author?: string,
      title?: string,
      sendEmail?: boolean,
      recipient?: string,
      smtp?: { host, port, secure, user, pass }
    }
    ```
  - 出力: { jobId, message }
  - ダウンロード: sendEmail=false 時、ブラウザでダウンロード
  - メール送信: sendEmail=true 時、jobId で進捗確認

- POST /api/send-epub（メール送信専用）
  - 入力: { workUrl, episodeUrls, recipient, smtp, author?, title? }
  - 出力: { jobId, message }
  - 既存EPUBではなく、エピソードから再生成してメール送信

### ジョブ進捗確認
- GET /api/job-progress/:jobId
  - 出力: { status: "processing" | "completed" | "error", progress, total, message?, error? }
  - クライアント側でポーリング（500ms間隔）

## 配置
- /public/index.html
- /src/index.ts (Express)

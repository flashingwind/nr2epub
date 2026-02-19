# nr2epub

小説家になろうの小説をEPUBに変換するWebアプリケーション。率直に言って問題がたくさんあります。
プルリエルの受取り方がわからないので、そこのところよろしくお願いします。

```
docker compose up -d
```

この状態でhttp://localhost:3000/にアクセスすると動くかもしれない。不具合があったらAIで直してください。

## ライセンス・クレジット: GPLv3

(C) 2016 [hmdev](https://github.com/hmdev/).
(C) 2025 [kyukyunyorituryo](https://github.com/kyukyunyorituryo).
(C) 2026 flashingwind.
本プログラムは[hmdev氏がはじめに作成したAozoraEpub3](https://github.com/hmdev/AozoraEpub3)を改造してメンテナンスしている[kyukyunyorituryo氏の配付しているAozoraEpub3](https://github.com/kyukyunyorituryo/AozoraEpub3/)の仕様を元にLLMによって生成させたもので、上記の両氏とは直接の関係はありません。
いうまでもなく、あんまり上手くいってない部分はは私flashingwindのせいです(ライセンスの通り免責されるはずですが)。
本プログラムはGNU General Public License v3.0(GPLv3)の元にご利用いただけます。

## 機能

- 色々なウェブサイトがありますが便宜上「なろう」と呼びます
- なろう小説のEPUB変換
- Kindle等の電子書籍リーダーへのメール送信
- AozoraEpub3互換の縦書きレイアウト
- **話ページの自動キャッシュ** (24時間、サーバー側で保持)
- **個人設定の保存** (ブラウザのlocalStorage)
- **設定のインポート/エクスポート**
- **UIでSMTP設定** (.envファイル不要、ブラウザに安全に保存)
- **進捗表示** (話数の処理状況をリアルタイム表示)

## キャッシュ機能

なろうサイトへの負荷を軽減するため、一度取得した話ページを24時間キャッシュします。

- **メモリキャッシュ**: 高速アクセス
- **ファイルキャッシュ**: `.cache/narou/` ディレクトリ
- **自動有効期限**: 24時間後に自動的に再取得

同じ話を何度もダウンロードしても、サーバーへのリクエストは最小限に抑えられます。

## セットアップ

### メール送信機能の設定

メール送信機能を使用する場合、**UI上で直接SMTP設定を入力できます**。

1. ブラウザでアプリケーションを開く
2. 「📧 SMTP設定」セクションを展開
3. 以下の情報を入力:
   - SMTPホスト (例: smtp.gmail.com)
   - SMTPポート (例: 587)
   - SMTPユーザー名 (メールアドレス)
   - SMTPパスワード (アプリパスワード)
   - SSL/TLS接続 (必要に応じてチェック)

設定はブラウザに自動保存され、エクスポート/インポートも可能です。

#### Gmailを使用する場合
1. Googleアカウントで2段階認証を有効化
2. [アプリパスワード](https://myaccount.google.com/apppasswords)を生成
3. 生成されたアプリパスワードをSMTPパスワード欄に入力

### 環境変数での設定（オプション）

従来通り、.envファイルでSMTP設定を行うこともできます（UI設定が優先されます）。

```bash
cp .env.example .env
```

.envファイルを編集してSMTP情報を入力してください。

## 開発
- `npm install`
- `npm run dev`
- http://localhost:3000

## ビルド
- `npm run build`
- `npm start`

## Docker
```bash
docker volume create nr2epub-cache
docker compose up --build
```

キャッシュは固定名の Docker Volume (`nr2epub-cache`) に保存されるため、`docker compose up --build` では消えません。

環境変数はdocker-compose.ymlで自動的に読み込まれます。

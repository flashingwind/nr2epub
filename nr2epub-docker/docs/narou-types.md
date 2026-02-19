# なろう抽出の型定義

## EpisodeSummary
話の概要情報
- `title: string` - 話タイトル
- `url: string` - 話ページURL
- `episode: number | null` - 話番号（短編の場合はnull）

## NarouWorkTop
作品トップページの抽出結果
- `url: string` - 作品URL
- `title: string` - 作品タイトル
- `author: string` - 著者名
- `summary: string` - あらすじ
- `publishedText: string` - 公開/更新日時のテキスト
- `episodes: EpisodeSummary[]` - 話リスト
- `maxEpisode?: number` - 最大話数（連載の場合）

## EpisodeBlock
エピソード内のブロック要素
- `kind: "preface" | "body" | "afterword"` - ブロック種別
  - "preface": 前書き
  - "body": 本文
  - "afterword": 後書き
- `html: string` - HTML形式のテキスト
- `text: string` - プレーンテキスト

## NarouEpisode
エピソードページの抽出結果
- `url: string` - エピソードURL
- `episode: number | null` - 話番号（短編の場合はnull）
- `title: string | null` - 話タイトル
- `blocks: EpisodeBlock[]` - ブロック配列

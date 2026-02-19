#!/bin/bash

# EPUB3 互換性検証スクリプト
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/.test-output"

echo "=== EPUB3 互換性検証テスト ==="
echo ""

# テスト用ディレクトリー作成
mkdir -p "$OUTPUT_DIR"

# サーバー起動確認
echo "1️⃣ サーバー接続確認..."
if ! curl -s http://localhost:3000/health | grep -q "ok"; then
  echo "❌ サーバーが起動していません"
  echo "   docker compose up -d を実行してください"
  exit 1
fi
echo "✅ サーバーが起動しています"
echo ""

# テスト作品の設定
# 短編を選定（取得が早い）
TEST_WORKS=(
  "https://ncode.syosetu.com/n5983ls/"  # 短編
  "https://ncode.syosetu.com/n1473lm/1-5"  # 連載（最初の5話）
)

echo "2️⃣ テスト作品情報取得..."
for WORK_URL in "${TEST_WORKS[@]}"; do
  echo "   - $WORK_URL"
  
  # 作品トップ抽出
  curl -s -X POST http://localhost:3000/api/parse-work \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$WORK_URL\"}" > /dev/null 2>&1 && echo "     ✅ 抽出成功" || echo "     ❌ 抽出失敗"
done
echo ""

# EPUBCheck 実行関数
check_epub_with_epubcheck() {
  local epub_file=$1
  local test_name=$2
  
  if ! command -v epubcheck &> /dev/null; then
    echo "   ⚠️  epubcheck がインストールされていません"
    echo "      apt install default-jre && wget https://github.com/w3c/epubcheck/releases/download/v5.0.0/epubcheck-5.0.0.zip"
    return 1
  fi
  
  echo "3️⃣ EPUBCheck 実行: $test_name"
  if epubcheck "$epub_file" 2>&1 | tee "${epub_file%.epub}.epubcheck.log"; then
    echo "✅ EPUB3 Validation 通過"
  else
    echo "❌ EPUB3 Validation 失敗"
  fi
}

# 注記
echo "📝 テスト手順:"
echo "   1. 短編作品で EPUB 生成テスト"
echo "   2. EPUBCheck で Validation 実行（要 Java）"
echo "   3. 出力: $OUTPUT_DIR/ に保存"
echo ""
echo "🔗 リソース:"
echo "   - EPUBCheck: https://www.w3.org/publishing/epubcheck/"
echo "   - Kindle Previewer: https://www.amazon.com/Kindle-Previewer/b?node=16568257011"
echo ""
echo "⏳ 実装中のテスト項目:"
echo "   ⏱️  Kindle表示互換確認（Kindle Previewer手動テスト）"
echo "   ⏱️  AozoraEpub3との差分比較"
echo "   ⏱️  パフォーマンステスト（1000話規模）"
echo ""

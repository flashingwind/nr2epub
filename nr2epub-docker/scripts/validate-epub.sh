#!/bin/bash

# EPUB ダウンロード・検証スクリプト
# 使用方法: ./scripts/validate-epub.sh <jobId>

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"
EPUBCHECK_JAR="$PROJECT_DIR/epubcheck/epubcheck-4.2.6/epubcheck.jar"

if [ ! -f "$EPUBCHECK_JAR" ]; then
  echo "❌ EPUBCheck not found at $EPUBCHECK_JAR"
  echo "Please install EPUBCheck first"
  exit 1
fi

if [ -z "$1" ]; then
  echo "❌ Usage: $0 <jobId>"
  echo "Example: $0 c3fcb18d-4f0c-460a-aee3-b9c26f98d076"
  exit 1
fi

JOB_ID="$1"
API_BASE="http://localhost:3000"
WORK_DIR="./tmp/epub-validation-$$"
mkdir -p "$WORK_DIR"

echo "📥 Downloading EPUB from job: $JOB_ID"

# EPUB をダウンロード
EPUB_FILE="$WORK_DIR/test.epub"
HTTP_STATUS=$(curl -s -o "$EPUB_FILE" -w "%{http_code}" "$API_BASE/api/download/$JOB_ID")

if [ "$HTTP_STATUS" != "200" ]; then
  echo "❌ Failed to download EPUB (HTTP $HTTP_STATUS)"
  rm -rf "$WORK_DIR"
  exit 1
fi

FILE_SIZE=$(stat -c%s "$EPUB_FILE" 2>/dev/null || stat -f%z "$EPUB_FILE" 2>/dev/null || echo "unknown")
echo "✅ Downloaded: $FILE_SIZE bytes"

# EPUBCheck で検証
echo ""
echo "🔍 Validating EPUB with EPUBCheck..."
echo "=========================================="

java -jar "$EPUBCHECK_JAR" "$EPUB_FILE" 2>&1 | tee "$WORK_DIR/validation-result.txt"

echo "=========================================="
echo ""

# 検証結果をパース
ERROR_COUNT=$(grep -c "ERROR\|ERR" "$WORK_DIR/validation-result.txt" || true)
WARNING_COUNT=$(grep -c "WARNING\|WARN" "$WORK_DIR/validation-result.txt" || true)

# 最終結果
if [ "$ERROR_COUNT" -eq 0 ]; then
  echo "✅ EPUB Validation PASSED"
  if [ "$WARNING_COUNT" -gt 0 ]; then
    echo "⚠️  $WARNING_COUNT warnings found"
  fi
  EXIT_CODE=0
else
  echo "❌ EPUB Validation FAILED"
  echo "   $ERROR_COUNT errors found"
  EXIT_CODE=1
fi

# 結果ファイルを保存
RESULT_FILE="$PROJECT_DIR/epub-validation-results-$(date +%Y%m%d-%H%M%S).txt"
cp "$WORK_DIR/validation-result.txt" "$RESULT_FILE"
echo ""
echo "📄 Validation result saved to: $RESULT_FILE"

# クリーンアップ
rm -rf "$WORK_DIR"

exit $EXIT_CODE

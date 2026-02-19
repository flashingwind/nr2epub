/**
 * extract.txt 機能のテストスクリプト
 */

import { parseExtractTxt } from './webnovel/extract-parser.js';
import { extractText, extractAttributes } from './webnovel/extract-selector.js';
import { loadExtractConfig, extractDomainFromUrl } from './webnovel/extract-loader.js';
import * as cheerio from 'cheerio';
import { readFile } from 'node:fs/promises';

async function testExtractParsing() {
  console.log('=== Test 1: extract.txt Parsing ===\n');
  
  // ncode.syosetu.com の extract.txt を読み込み
  const extractPath = './web/ncode.syosetu.com/extract.txt';
  const content = await readFile(extractPath, 'utf-8');
  const config = parseExtractTxt(content);
  
  console.log('Parsed extract.txt for ncode.syosetu.com:');
  console.log('- TITLE selectors:', config.TITLE?.selectors.map(s => `${s.selector}${s.position !== undefined ? ':' + s.position : ''}`).join(', '));
  console.log('- AUTHOR selectors:', config.AUTHOR?.selectors.map(s => `${s.selector}${s.position !== undefined ? ':' + s.position : ''}`).join(', '));
  console.log('- AUTHOR pattern:', config.AUTHOR?.pattern || 'none');
  console.log('- CONTENT_ARTICLE:', config.CONTENT_ARTICLE?.selectors.map(s => `${s.selector}${s.position !== undefined ? ':' + s.position : ''}`).join(', '));
  console.log();
}

async function testExtractSelector() {
  console.log('=== Test 2: HTML Extraction ===\n');
  
  // サンプルHTMLを作成
  const html = `
    <html>
      <body>
        <div class="p-novel__title">テストタイトル</div>
        <div class="novel_title">代替タイトル</div>
        <div class="p-novel__author">作者：田中太郎</div>
        <div id="novel_honbun">
          <p>これはテスト本文です。</p>
          <p>第二段落。</p>
        </div>
      </body>
    </html>
  `;
  
  const $ = cheerio.load(html);
  
  // extract.txt の設定を読み込み
  const config = await loadExtractConfig('ncode.syosetu.com');
  if (!config) {
    console.error('Failed to load extract config');
    return;
  }
  
  // タイトルを抽出
  const title = extractText($, config.TITLE);
  console.log('Extracted TITLE:', title);
  
  // 著者を抽出（正規表現パターンも適用）
  const author = extractText($, config.AUTHOR);
  console.log('Extracted AUTHOR:', author);
  
  // 本文を抽出
  const article = extractText($, config.CONTENT_ARTICLE);
  console.log('Extracted CONTENT_ARTICLE:', article);
  console.log();
}

async function testDomainExtraction() {
  console.log('=== Test 3: Domain Extraction ===\n');
  
  const urls = [
    'https://ncode.syosetu.com/n1473lm/',
    'https://kakuyomu.jp/works/1177354054881040355',
    'https://novelist.jp/stories/11111/'
  ];
  
  for (const url of urls) {
    const domain = extractDomainFromUrl(url);
    console.log(`URL: ${url}`);
    console.log(`Domain: ${domain}`);
    
    const config = await loadExtractConfig(domain);
    if (config) {
      console.log(`✓ extract.txt found for ${domain}`);
      console.log(`  - TITLE: ${config.TITLE?.selectors[0].selector}`);
    } else {
      console.log(`✗ extract.txt not found for ${domain}`);
    }
    console.log();
  }
}

async function testPositionSelector() {
  console.log('=== Test 4: Position Selector ===\n');
  
  const html = `
    <html>
      <body>
        <div class="item">First</div>
        <div class="item">Second</div>
        <div class="item">Third</div>
        <div class="item">Last</div>
      </body>
    </html>
  `;
  
  const $ = cheerio.load(html);
  
  // :0 (最初)
  const rule1 = {
    selectors: [{ selector: '.item', position: 0 }]
  };
  console.log('Position :0 (first):', extractText($, rule1));
  
  // :1 (2番目)
  const rule2 = {
    selectors: [{ selector: '.item', position: 1 }]
  };
  console.log('Position :1 (second):', extractText($, rule2));
  
  // :-1 (最後)
  const rule3 = {
    selectors: [{ selector: '.item', position: -1 }]
  };
  console.log('Position :-1 (last):', extractText($, rule3));
  
  console.log();
}

async function runAllTests() {
  try {
    await testExtractParsing();
    await testExtractSelector();
    await testDomainExtraction();
    await testPositionSelector();
    
    console.log('✓ All tests completed');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

runAllTests();

/**
 * extract.txt ファイルを読み込んで ExtractConfig を提供
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { parseExtractTxt, type ExtractConfig } from './extract-parser.js';

const extractConfigCache = new Map<string, ExtractConfig>();

/**
 * ドメインから extract.txt を読み込んで ExtractConfig を取得
 * extract.txt が存在しない場合はエラーを投げる
 */
export async function loadExtractConfig(domain: string): Promise<ExtractConfig> {
  // キャッシュをチェック
  if (extractConfigCache.has(domain)) {
    return extractConfigCache.get(domain)!;
  }
  
  // ドメインフォルダのパスを構築
  const domainDir = join(process.cwd(), 'web', domain);
  
  // ドメインフォルダの存在確認
  if (!existsSync(domainDir)) {
    throw new Error(`サポートされていないドメインです: ${domain}\n./web/${domain}/ フォルダが存在しません`);
  }
  
  // extract.txt のパスを構築
  const extractPath = join(domainDir, 'extract.txt');
  
  // extract.txt の存在確認
  if (!existsSync(extractPath)) {
    throw new Error(`設定ファイルが見つかりません: ${domain}\n./web/${domain}/extract.txt が必要です`);
  }
  
  try {
    // ファイルを読み込み
    const content = await readFile(extractPath, 'utf-8');
    
    // パース
    const config = parseExtractTxt(content);
    
    // キャッシュに保存
    extractConfigCache.set(domain, config);
    
    console.log(`✅ Loaded extract.txt for ${domain}`);
    return config;
  } catch (error) {
    if (error instanceof Error && error.message.includes('サポートされていない')) {
      throw error;
    }
    throw new Error(`extract.txt の読み込みに失敗しました (${domain}): ${error}`);
  }
}

/**
 * URL から ドメイン名を抽出
 */
export function extractDomainFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return '';
  }
}

/**
 * キャッシュをクリア（テスト用）
 */
export function clearExtractConfigCache(): void {
  extractConfigCache.clear();
}

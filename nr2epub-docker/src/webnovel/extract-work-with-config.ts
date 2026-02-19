/**
 * extract.txt を使った作品トップページ抽出（将来の実装）
 * 
 * 現在は既存のハードコードされた selectors.ts を使用していますが、
 * 将来的にこのモジュールを使って extract.txt ベースの抽出に対応します。
 */

import * as cheerio from 'cheerio';
import type { NarouWorkTop } from './types.js';
import type { ExtractConfig } from './extract-parser.js';
import { extractText, extractAttributes } from './extract-selector.js';

/**
 * extract.txt のルールを使って作品トップページを抽出
 */
export function parseWorkTopWithExtract(
  html: string,
  url: string,
  config: ExtractConfig
): Omit<NarouWorkTop, 'episodes' | 'maxEpisode'> {
  const $ = cheerio.load(html);
  
  // タイトルを抽出
  const title = extractText($, config.TITLE) || '無題';
  
  // 著者を抽出
  const author = extractText($, config.AUTHOR) || '作者不明';
  
  // 説明を抽出
  const summary = extractText($, config.DESCRIPTION) || '';
  
  // 公開日時を抽出（TODO: extract.txt に対応するキーを追加）
  const publishedText = '';
  
  return {
    url,
    title,
    author,
    summary,
    publishedText
  };
}

/**
 * extract.txt のルールを使ってエピソード一覧を抽出
 */
export function extractEpisodesWithExtract(
  html: string,
  baseUrl: string,
  config: ExtractConfig
): NarouWorkTop['episodes'] {
  const $ = cheerio.load(html);
  const episodes: NarouWorkTop['episodes'] = [];
  
  if (!config.HREF) {
    console.warn('HREF rule not found in extract.txt');
    return episodes;
  }
  
  // 各話へのリンクを抽出
  const hrefs = extractAttributes($, config.HREF, 'href');
  
  for (const href of hrefs) {
    // エピソード番号を抽出
    const episodeMatch = href.match(/\/(\d+)\/?$/);
    const episode = episodeMatch ? Number(episodeMatch[1]) : null;
    
    // 絶対URLに変換
    const absUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    
    // タイトルを抽出（TODO: SUBTITLE_LIST から取得）
    const title = `Episode ${episode || episodes.length + 1}`;
    
    episodes.push({
      title,
      url: absUrl,
      episode
    });
  }
  
  return episodes;
}

/**
 * extract.txt を使ったエピソード本文抽出（将来の実装）
 * 
 * 現在は既存のハードコードされた selectors.ts を使用していますが、
 * 将来的にこのモジュールを使って extract.txt ベースの抽出に対応します。
 */

import * as cheerio from 'cheerio';
import type { NarouEpisode, EpisodeBlock } from './types.js';
import type { ExtractConfig } from './extract-parser.js';
import { extractText, extractElements } from './extract-selector.js';

/**
 * extract.txt のルールを使ってエピソードを抽出
 */
export function parseEpisodeWithExtract(
  html: string,
  url: string,
  config: ExtractConfig
): NarouEpisode {
  const $ = cheerio.load(html);
  
  // 話タイトルを抽出
  const title = extractText($, config.CONTENT_SUBTITLE) || null;
  
  // エピソード番号を抽出
  const episodeMatch = url.match(/\/(\d+)\/?$/);
  const episode = episodeMatch ? Number(episodeMatch[1]) : null;
  
  const blocks: EpisodeBlock[] = [];
  
  // 前書きを抽出
  const preambleElements = extractElements($, config.CONTENT_PREAMBLE);
  if (preambleElements.length > 0) {
    const html = preambleElements.html() || '';
    const text = preambleElements.text().trim();
    if (text) {
      blocks.push({ kind: 'preface', html, text });
    }
  }
  
  // 本文を抽出
  const bodyElements = extractElements($, config.CONTENT_ARTICLE);
  if (bodyElements.length > 0) {
    const html = bodyElements.html() || '';
    const text = bodyElements.text().trim();
    if (text) {
      blocks.push({ kind: 'body', html, text });
    }
  }
  
  // 後書きを抽出
  const appendixElements = extractElements($, config.CONTENT_APPENDIX);
  if (appendixElements.length > 0) {
    const html = appendixElements.html() || '';
    const text = appendixElements.text().trim();
    if (text) {
      blocks.push({ kind: 'afterword', html, text });
    }
  }
  
  return {
    url,
    episode,
    title,
    blocks
  };
}

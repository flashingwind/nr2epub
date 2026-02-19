/**
 * extract.txt のルールを使ってHTMLから要素を抽出
 */

import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { ExtractRule, SelectorSpec } from './extract-parser.js';
import { applyPattern } from './extract-parser.js';

/**
 * ExtractRule を使って HTML から文字列を抽出
 */
export function extractText(
  $: CheerioAPI,
  rule: ExtractRule | undefined,
  context?: Cheerio<any>
): string {
  if (!rule) return '';
  
  const root = context || $.root();
  
  // 複数セレクタを順に試行（前方優先）
  for (const selectorSpec of rule.selectors) {
    const result = extractWithSelector($, root, selectorSpec);
    
    if (result) {
      // 正規表現パターンを適用
      return applyPattern(result, rule.pattern, rule.replacement);
    }
  }
  
  return '';
}

/**
 * ExtractRule を使って HTML から複数の文字列を抽出
 */
export function extractTexts(
  $: CheerioAPI,
  rule: ExtractRule | undefined,
  context?: Cheerio<any>
): string[] {
  if (!rule) return [];
  
  const root = context || $.root();
  const results: string[] = [];
  
  // 複数セレクタを順に試行（前方優先）
  for (const selectorSpec of rule.selectors) {
    const elements = selectElements($, root, selectorSpec);
    
    if (elements.length > 0) {
      elements.each((_, elem) => {
        const text = $(elem).text().trim();
        if (text) {
          // 正規表現パターンを適用
          results.push(applyPattern(text, rule.pattern, rule.replacement));
        }
      });
      
      if (results.length > 0) break; // 最初にマッチしたセレクタで終了
    }
  }
  
  return results;
}

/**
 * ExtractRule を使って HTML から要素（Cheerio オブジェクト）を抽出
 */
export function extractElements(
  $: CheerioAPI,
  rule: ExtractRule | undefined,
  context?: Cheerio<any>
): Cheerio<any> {
  if (!rule) return $();
  
  const root = context || $.root();
  
  // 複数セレクタを順に試行（前方優先）
  for (const selectorSpec of rule.selectors) {
    const elements = selectElements($, root, selectorSpec);
    
    if (elements.length > 0) {
      return elements;
    }
  }
  
  return $();
}

/**
 * ExtractRule を使って HTML から属性値を抽出
 */
export function extractAttribute(
  $: CheerioAPI,
  rule: ExtractRule | undefined,
  attrName: string,
  context?: Cheerio<any>
): string {
  if (!rule) return '';
  
  const root = context || $.root();
  
  // 複数セレクタを順に試行（前方優先）
  for (const selectorSpec of rule.selectors) {
    const elements = selectElements($, root, selectorSpec);
    
    if (elements.length > 0) {
      const attr = elements.first().attr(attrName);
      if (attr) {
        // 正規表現パターンを適用
        return applyPattern(attr, rule.pattern, rule.replacement);
      }
    }
  }
  
  return '';
}

/**
 * ExtractRule を使って HTML から複数の属性値を抽出
 */
export function extractAttributes(
  $: CheerioAPI,
  rule: ExtractRule | undefined,
  attrName: string,
  context?: Cheerio<any>
): string[] {
  if (!rule) return [];
  
  const root = context || $.root();
  const results: string[] = [];
  
  // 複数セレクタを順に試行（前方優先）
  for (const selectorSpec of rule.selectors) {
    const elements = selectElements($, root, selectorSpec);
    
    if (elements.length > 0) {
      elements.each((_, elem) => {
        const attr = $(elem).attr(attrName);
        if (attr) {
          // 正規表現パターンを適用
          results.push(applyPattern(attr, rule.pattern, rule.replacement));
        }
      });
      
      if (results.length > 0) break; // 最初にマッチしたセレクタで終了
    }
  }
  
  return results;
}

/**
 * セレクタと位置指定で要素を抽出
 */
function extractWithSelector(
  $: CheerioAPI,
  root: Cheerio<any>,
  spec: SelectorSpec
): string {
  const elements = selectElements($, root, spec);
  
  if (elements.length > 0) {
    // innerHTML を取得（タグを含む）
    const html = elements.html();
    if (html) {
      // タグを除去して文字列化
      return $('<div>').html(html).text().trim();
    }
  }
  
  return '';
}

/**
 * セレクタと位置指定で要素を選択
 */
function selectElements(
  $: CheerioAPI,
  root: Cheerio<any>,
  spec: SelectorSpec
): Cheerio<any> {
  try {
    const allElements = root.find(spec.selector);
    
    if (spec.position !== undefined) {
      // 位置指定がある場合
      if (spec.position >= 0) {
        return allElements.eq(spec.position);
      } else {
        // 負の値は後ろから数える
        return allElements.eq(allElements.length + spec.position);
      }
    }
    
    // 位置指定なしはすべての要素
    return allElements;
  } catch (error) {
    // 無効なセレクタの場合はスキップ（正規表現属性セレクタなど）
    console.warn(`Invalid selector ignored: ${spec.selector}`, error);
    return $();
  }
}

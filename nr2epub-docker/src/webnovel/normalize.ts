import * as cheerio from "cheerio";
import type { Element, AnyNode } from "domhandler";
import type { EpisodeBlock } from "./types.js";

const MULTI_NEWLINE = /\n{3,}/g;
const TRAILING_SPACES = /[ \t]+$/gm;

function normalizeRubyInHtml(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  $("ruby").each((_, ruby) => {
    const $ruby = $(ruby);
    $ruby.find("rp").remove();
    $ruby.find("rt").each((__, rt) => {
      const $rt = $(rt);
      const rtText = $rt.text().trim();
      if (!rtText) {
        $rt.remove();
        return;
      }
      $rt.text(rtText);
    });
  });
  return $("#root").html() || "";
}

function normalizeEmphasisInHtml(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  $("em").each((_, em) => {
    const $em = $(em);
    $em.addClass("emphasis");
  });
  return $("#root").html() || "";
}

// AozoraEpub3互換の設定値（INIファイルから）
const AUTO_YOKO_NUM1 = true;   // AutoYokoNum1=1
const AUTO_YOKO_NUM3 = false;  // AutoYokoNum3= (空)
const AUTO_YOKO_EQ1 = true;    // AutoYokoEQ1=1
const AUTO_YOKO_EQ3 = true;    // デフォルト値（INIに記載なし）

// 半角文字判定（AozoraEpub3のCharUtils.isHalf相当）
function isHalfWidth(ch: string): boolean {
  if (!ch || ch.length === 0) return false;
  const code = ch.charCodeAt(0);
  // 半角英数字、半角記号
  return (code >= 0x20 && code <= 0x7E) || (code >= 0xFF61 && code <= 0xFF9F);
}

// 数字判定
function isNum(ch: string): boolean {
  return /[0-9]/.test(ch);
}

// !?判定
function isExclamationQuestion(ch: string): boolean {
  return ch === '!' || ch === '?';
}

// 前方の半角チェック（タグは無視）
function checkTcyPrev(text: string, pos: number): boolean {
  let i = pos - 1;
  while (i >= 0) {
    if (text[i] === '>') {
      // タグの終わりを見つけたら、タグの始まりまで戻る
      while (i >= 0 && text[i] !== '<') {
        i--;
      }
      i--;
      continue;
    }
    if (text[i] === ' ') {
      i--;
      continue;
    }
    // 半角文字ならfalse（縦中横にしない）
    return !isHalfWidth(text[i]);
  }
  return true; // 先頭に到達
}

// 後方の半角チェック（タグは無視）
function checkTcyNext(text: string, pos: number): boolean {
  let i = pos;
  while (i < text.length) {
    if (text[i] === '<') {
      // タグの始まりを見つけたら、タグの終わりまで進む
      while (i < text.length && text[i] !== '>') {
        i++;
      }
      i++;
      continue;
    }
    if (text[i] === ' ') {
      i++;
      continue;
    }
    // 半角文字ならfalse（縦中横にしない）
    return !isHalfWidth(text[i]);
  }
  return true; // 末尾に到達
}

// テキストノード内の縦中横処理（AozoraEpub3のconvertTcyText相当）
function processTcyInText(text: string): string {
  const chars = text.split('');
  const result: string[] = [];
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];
    
    // タグはそのまま出力
    if (ch === '<') {
      let tag = ch;
      i++;
      while (i < chars.length && chars[i] !== '>') {
        tag += chars[i];
        i++;
      }
      if (i < chars.length) {
        tag += chars[i];
        i++;
      }
      result.push(tag);
      continue;
    }

    // 数字の処理
    if (isNum(ch)) {
      // 3桁の数字（AUTO_YOKO_NUM3がfalseなので処理しない）
      // 2桁の数字
      if (i + 1 < chars.length && isNum(chars[i + 1])) {
        if (!checkTcyPrev(text, i)) {
          result.push(ch);
          i++;
          continue;
        }
        if (!checkTcyNext(text, i + 2)) {
          result.push(ch);
          i++;
          continue;
        }
        result.push(`<span class="tcy">${ch}${chars[i + 1]}</span>`);
        i += 2;
        continue;
      }
      // 1桁の数字
      if (AUTO_YOKO_NUM1) {
        // 前後が数字でないことをチェック
        const prevIsNum = i > 0 && isNum(chars[i - 1]);
        const nextIsNum = i + 1 < chars.length && isNum(chars[i + 1]);
        if (!prevIsNum && !nextIsNum) {
          if (!checkTcyPrev(text, i)) {
            result.push(ch);
            i++;
            continue;
          }
          if (!checkTcyNext(text, i + 1)) {
            result.push(ch);
            i++;
            continue;
          }
          
          // 特別ルール: 1月2日のような場合
          if (i + 3 < chars.length && chars[i + 1] === '月' && isNum(chars[i + 2])) {
            if (chars[i + 3] === '日' || (i + 4 < chars.length && isNum(chars[i + 3]) && chars[i + 4] === '日')) {
              result.push(`<span class="tcy">${ch}</span>`);
              i++;
              continue;
            }
          }
          // 年3月、月4日、第5刷、第6版、第7巻
          if (i > 0 && i + 1 < chars.length) {
            if ((chars[i - 1] === '年' && chars[i + 1] === '月') ||
                (chars[i - 1] === '月' && chars[i + 1] === '日') ||
                (chars[i - 1] === '第' && (chars[i + 1] === '刷' || chars[i + 1] === '版' || chars[i + 1] === '巻'))) {
              result.push(`<span class="tcy">${ch}</span>`);
              i++;
              continue;
            }
          }
          // 明治/大正/昭和/平成 + 数字
          if (i > 1) {
            const era = chars[i - 2] + chars[i - 1];
            if (era === '明治' || era === '大正' || era === '昭和' || era === '平成' || era === '令和') {
              result.push(`<span class="tcy">${ch}</span>`);
              i++;
              continue;
            }
          }
          
          result.push(`<span class="tcy">${ch}</span>`);
          i++;
          continue;
        }
      }
    }

    // !?の処理
    if (isExclamationQuestion(ch)) {
      // 3文字
      if (AUTO_YOKO_EQ3 && i + 2 < chars.length && 
          isExclamationQuestion(chars[i + 1]) && isExclamationQuestion(chars[i + 2])) {
        if (!checkTcyPrev(text, i)) {
          result.push(ch);
          i++;
          continue;
        }
        if (!checkTcyNext(text, i + 3)) {
          result.push(ch);
          i++;
          continue;
        }
        result.push(`<span class="tcy">${ch}${chars[i + 1]}${chars[i + 2]}</span>`);
        i += 3;
        continue;
      }
      // 2文字
      if (i + 1 < chars.length && isExclamationQuestion(chars[i + 1])) {
        if (!checkTcyPrev(text, i)) {
          result.push(ch);
          i++;
          continue;
        }
        if (!checkTcyNext(text, i + 2)) {
          result.push(ch);
          i++;
          continue;
        }
        result.push(`<span class="tcy">${ch}${chars[i + 1]}</span>`);
        i += 2;
        continue;
      }
      // 1文字
      if (AUTO_YOKO_EQ1) {
        const prevIsNum = i > 0 && isNum(chars[i - 1]);
        const nextIsNum = i + 1 < chars.length && isNum(chars[i + 1]);
        if (!prevIsNum && !nextIsNum) {
          if (!checkTcyPrev(text, i)) {
            result.push(ch);
            i++;
            continue;
          }
          if (!checkTcyNext(text, i + 1)) {
            result.push(ch);
            i++;
            continue;
          }
          result.push(`<span class="tcy">${ch}</span>`);
          i++;
          continue;
        }
      }
    }

    // その他の文字はそのまま出力
    result.push(ch);
    i++;
  }

  return result.join('');
}

function normalizeTcyInHtml(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const walker = (node: Element): void => {
    const $node = $(node);
    $node.contents().each((_, child) => {
      const anyChild = child as AnyNode;
      if (anyChild.type === "text" && "data" in anyChild) {
        const text = anyChild.data;
        const processed = processTcyInText(text);
        if (processed !== text) {
          $(anyChild).replaceWith(processed);
        }
      } else if (anyChild.type === "tag") {
        walker(anyChild as Element);
      }
    });
  };
  const rootElement = $("#root")[0] as Element;
  walker(rootElement);
  return $("#root").html() || "";
}

function normalizeTcyInText(text: string): string {
  // タイトル用：プレーンテキストの処理
  return processTcyInText(text);
}

export function normalizeInlineHtml(html: string): string {
  let result = normalizeRubyInHtml(html);
  result = normalizeEmphasisInHtml(result);
  result = normalizeTcyInHtml(result);
  return result.trim();
}

export function normalizeTitle(title: string): string {
  // タイトル用：数字と!?を処理
  return processTcyInText(title);
}

export function normalizeTitleForNcx(title: string): string {
  // toc.ncx用：プレーンテキスト版、数字のみを処理（全角化なし）
  // NCXはXML形式なので、HTMLタグは使用できない
  // 数字を全角化するだけで、тcy マーキングはしない
  return title;
}

function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(TRAILING_SPACES, "").replace(MULTI_NEWLINE, "\n\n").trim();
}

export function normalizeEpisodeBlocks(blocks: EpisodeBlock[]): EpisodeBlock[] {
  return blocks.map((block) => {
    if (block.kind === "body") {
      return {
        ...block,
        html: normalizeInlineHtml(block.html),
        text: normalizeText(block.text)
      };
    }
    return {
      ...block,
      html: normalizeInlineHtml(block.html),
      text: normalizeText(block.text)
    };
  });
}

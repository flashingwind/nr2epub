/**
 * extract.txt の JSON_* ディレクティブに基づく JSON 抽出エンジン
 *
 * パス記法:
 *   Work:{workId}.title
 *     → ルートオブジェクトの "Work:<workId値>" キーの title フィールド
 *   Work:{workId}.author->activityName
 *     → author フィールドの __ref を解決し、その activityName を返す
 *   Work:{workId}.tableOfContents[*]->episodeUnions[*]->
 *     → 配列展開 + REF 解決を繰り返し、最終オブジェクト配列を返す
 *   (-> で終端するとREF解決したオブジェクト群を返す)
 */

import * as cheerio from 'cheerio';
import type { JsonExtractConfig } from './extract-parser.js';

export interface JsonEpisodeInfo {
  id?: string;
  title?: string;
  url?: string;
}

export interface JsonWorkInfo {
  title?: string;
  author?: string;
  description?: string;
  episodes?: JsonEpisodeInfo[];
}

/**
 * URLから JSON_URL_VAR 定義の変数を抽出する
 */
export function extractUrlVars(url: string, urlVars: Record<string, string>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [varName, pattern] of Object.entries(urlVars)) {
    if (!pattern) continue;
    try {
      const m = url.match(new RegExp(pattern));
      if (m?.[1]) vars[varName] = m[1];
    } catch {
      // 無効な正規表現は無視
    }
  }
  return vars;
}

/**
 * HTML の script タグから JSON を取得してパース
 */
export function extractJsonFromHtml(html: string, srcSelector: string): unknown {
  const $ = cheerio.load(html);
  const scriptEl = $(srcSelector);
  if (!scriptEl.length) return null;

  const text = scriptEl.html() || scriptEl.text();
  if (!text?.trim()) return null;

  try {
    return JSON.parse(text.trim());
  } catch {
    console.warn(`[JSON] Failed to parse JSON from ${srcSelector}`);
    return null;
  }
}

/**
 * ドット区切りパスで JSON オブジェクトを辿る（配列展開・REF解決なし）
 * 例: "props.pageProps.__APOLLO_STATE__"
 */
export function getJsonByDotPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * 変数を文字列に展開
 * "Work:{workId}" + {workId: "123"} → "Work:123"
 */
function expandVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? `{${name}}`);
}

/**
 * パスセグメントをトークン列に分解
 * "Work:{workId}.tableOfContents[*]->episodeUnions[*]->"
 * → ["Work:{workId}", "tableOfContents", "[*]", "->", "episodeUnions", "[*]", "->"]
 */
function tokenizePath(path: string): string[] {
  const tokens: string[] = [];
  // まず -> で分割し、各パートをさらにドット・[*] で分割
  const parts = path.split('->');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.trim() === '') {
      // 末尾の -> は前のセグメントが既に '->' を追加済みなので追加しない
      // (末尾 -> はパスの終端を示す記法として使用)
      continue;
    }
    // ドット区切りとarrayを分割
    const subParts = part.trim().split(/\.|\[\*\]/);
    let remaining = part.trim();
    const segments: string[] = [];
    while (remaining.length > 0) {
      const arrayMatch = remaining.match(/^\[\*\](.*)/);
      const dotMatch = remaining.match(/^\.?(([^\.\[\->]+))(.*)$/);
      if (arrayMatch) {
        segments.push('[*]');
        remaining = arrayMatch[1];
      } else if (dotMatch) {
        segments.push(dotMatch[1]);
        remaining = dotMatch[3];
      } else {
        break;
      }
    }
    tokens.push(...segments.filter(Boolean));
    if (i < parts.length - 1) tokens.push('->');
  }
  return tokens;
}

/**
 * メインのJSONパス評価関数
 *
 * @param root       JSON_ROOT 適用後のオブジェクト
 * @param pathExpr   パス式（例: "Work:{workId}.author->activityName"）
 * @param vars       URL変数
 * @returns 文字列 | オブジェクト | オブジェクト配列 | undefined
 */
export function evalJsonPath(
  root: unknown,
  pathExpr: string,
  vars: Record<string, string>
): unknown {
  // 変数展開
  const expanded = expandVars(pathExpr, vars);
  const tokens = tokenizePath(expanded);

  // 評価: 現在ノード(単一または配列)を持ちながらトークンを消費
  let nodes: unknown[] = [root];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '[*]') {
      // 配列展開
      const next: unknown[] = [];
      for (const node of nodes) {
        if (Array.isArray(node)) {
          next.push(...node);
        }
      }
      nodes = next;

    } else if (token === '->') {
      // __ref 解決
      // 各ノードの __ref フィールドをルートで解決
      // トークン列末尾の -> の場合は resolve して終わり（次のフィールドなし）
      const nextToken = tokens[i + 1];
      if (nextToken === undefined || nextToken === '->') {
        // 末尾 -> : __ref を解決したオブジェクトを返す
        const next: unknown[] = [];
        for (const node of nodes) {
          const ref = getRef(node);
          if (ref) {
            const resolved = (root as Record<string, unknown>)[ref];
            if (resolved !== undefined) next.push(resolved);
          }
        }
        nodes = next;
      } else {
        // 次のトークンはフィールド名 → ref 解決後にフィールドアクセス
        const next: unknown[] = [];
        for (const node of nodes) {
          const ref = getRef(node);
          if (ref) {
            const resolved = (root as Record<string, unknown>)[ref];
            if (resolved !== undefined) {
              const val = (resolved as Record<string, unknown>)[nextToken];
              if (val !== undefined) next.push(val);
            }
          }
        }
        nodes = next;
        i++; // nextToken を消費
      }

    } else {
      // 通常のフィールドアクセス
      const next: unknown[] = [];
      for (const node of nodes) {
        if (node != null && typeof node === 'object' && !Array.isArray(node)) {
          const val = (node as Record<string, unknown>)[token];
          if (val !== undefined) next.push(val);
        }
      }
      nodes = next;
    }
  }

  if (nodes.length === 0) return undefined;
  if (nodes.length === 1) return nodes[0];
  return nodes;
}

function getRef(node: unknown): string | null {
  if (node != null && typeof node === 'object' && !Array.isArray(node)) {
    const ref = (node as Record<string, unknown>)['__ref'];
    if (typeof ref === 'string') return ref;
  }
  return null;
}

/**
 * JSON抽出設定を使って作品情報を取得
 */
export function extractJsonWork(
  html: string,
  url: string,
  jsonCfg: JsonExtractConfig
): Omit<JsonWorkInfo, 'episodes'> | null {
  const raw = extractJsonFromHtml(html, jsonCfg.src);
  if (raw == null) { console.warn('[JSON] JSON source not found'); return null; }

  const root = jsonCfg.root ? getJsonByDotPath(raw, jsonCfg.root) : raw;
  if (root == null) { console.warn('[JSON] JSON root not found'); return null; }

  const vars = extractUrlVars(url, jsonCfg.urlVars);

  const title = jsonCfg.title
    ? String(evalJsonPath(root, jsonCfg.title, vars) ?? '')
    : undefined;
  const author = jsonCfg.author
    ? String(evalJsonPath(root, jsonCfg.author, vars) ?? '')
    : undefined;
  const description = jsonCfg.description
    ? String(evalJsonPath(root, jsonCfg.description, vars) ?? '')
    : undefined;

  if (!title && !author) {
    console.warn('[JSON] Could not extract title or author');
    return null;
  }

  console.log(`[JSON] title="${title}", author="${author}"`);
  return { title, author, description };
}

/**
 * JSON抽出設定を使ってエピソードリストを取得
 */
export function extractJsonEpisodes(
  html: string,
  url: string,
  jsonCfg: JsonExtractConfig
): JsonEpisodeInfo[] {
  if (!jsonCfg.href) return [];

  const raw = extractJsonFromHtml(html, jsonCfg.src);
  if (raw == null) return [];

  const root = jsonCfg.root ? getJsonByDotPath(raw, jsonCfg.root) : raw;
  if (root == null) return [];

  const vars = extractUrlVars(url, jsonCfg.urlVars);
  const epObjects = evalJsonPath(root, jsonCfg.href, vars);

  const arr: unknown[] = Array.isArray(epObjects) ? epObjects : epObjects !== undefined ? [epObjects] : [];
  if (arr.length === 0) {
    console.warn('[JSON] No episodes found via JSON_HREF');
    return [];
  }

  const episodes: JsonEpisodeInfo[] = [];
  for (const ep of arr) {
    if (ep == null || typeof ep !== 'object') continue;
    const epObj = ep as Record<string, unknown>;

    const id = jsonCfg.hrefTitle ? undefined : String(epObj['id'] ?? '');
    const titleField = jsonCfg.hrefTitle ?? 'title';
    const title = String(epObj[titleField] ?? epObj['title'] ?? '');
    const epId = String(epObj['id'] ?? '');

    // URL テンプレート展開
    let epUrl = '';
    if (jsonCfg.hrefUrl) {
      epUrl = jsonCfg.hrefUrl.replace(/\{(\w+)\}/g, (_, name) => {
        if (vars[name]) return vars[name];
        if (name === 'id') return epId;
        return String(epObj[name] ?? `{${name}}`);
      });
    }

    if (epUrl || epId) {
      episodes.push({ id: epId || id, title, url: epUrl });
    }
  }

  console.log(`[JSON] Extracted ${episodes.length} episodes`);
  return episodes;
}

/**
 * カクヨム専用の抽出ロジック
 * KakuyomuはSPAなので、HTMLではなく __NEXT_DATA__ からJSONを抽出する
 */

import * as cheerio from "cheerio";
import type { NarouWorkTop, NarouEpisode } from "./types.js";

export function extractKakuyomuWork(html: string, url: string): Omit<NarouWorkTop, 'episodes' | 'maxEpisode'> | null {
  const $ = cheerio.load(html);
  
  // __NEXT_DATA__ スクリプトタグからJSONを抽出
  const nextDataScript = $('#__NEXT_DATA__').html();
  if (!nextDataScript) {
    console.warn('__NEXT_DATA__ not found in Kakuyomu HTML');
    return null;
  }
  
  try {
    const nextData = JSON.parse(nextDataScript);
    const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__;
    
    if (!apolloState) {
      console.warn('Apollo state not found in __NEXT_DATA__');
      return null;
    }
    
    // Work データを探す
    const workKey = Object.keys(apolloState).find(key => key.startsWith('Work:'));
    if (!workKey) {
      console.warn('Work data not found in Apollo state');
      return null;
    }
    
    const workData = apolloState[workKey];
    const author = apolloState[workData.author?.__ref];
    
    return {
      url,
      title: workData.title || "無題",
      author: author?.activityName || author?.name || "作者不明",
      summary: workData.introduction || "",
      publishedText: workData.publishedAt || ""
    };
  } catch (error) {
    console.error('Failed to parse Kakuyomu __NEXT_DATA__:', error);
    return null;
  }
}

export function extractKakuyomuEpisodes(html: string, baseUrl: string): NarouWorkTop["episodes"] {
  const $ = cheerio.load(html);
  const episodes: NarouWorkTop["episodes"] = [];
  
  // __NEXT_DATA__ スクリプトタグからJSONを抽出
  const nextDataScript = $('#__NEXT_DATA__').html();
  if (!nextDataScript) {
    console.warn('__NEXT_DATA__ not found in Kakuyomu HTML');
    return [];
  }
  
  try {
    const nextData = JSON.parse(nextDataScript);
    const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__;
    
    if (!apolloState) {
      return [];
    }
    
    const workId = baseUrl.match(/works\/(\d+)/)?.[1];
    if (!workId) {
      console.warn('Could not extract workId from URL:', baseUrl);
      return [];
    }
    
    // Work:${workId} から tableOfContents の章リストを順番に取得
    const workKey = `Work:${workId}`;
    const workData = apolloState[workKey];
    if (!workData) {
      console.warn(`Work key not found in Apollo state: ${workKey}`);
      console.warn('Available Work keys:', Object.keys(apolloState).filter(k => k.startsWith('Work:')));
      return [];
    }
    
    // tableOfContents は [{__ref: "TableOfContentsChapter:xxx"}, ...] の配列
    const chapterRefs: string[] = (workData.tableOfContents || []).map((ref: any) => ref.__ref).filter(Boolean);
    
    console.log(`[Kakuyomu] workId=${workId}, chapters=${chapterRefs.length}`);
    
    // 各章の episodeUnions を順番に展開
    for (const chapterRef of chapterRefs) {
      const chapterData = apolloState[chapterRef];
      if (!chapterData) continue;
      
      const episodeRefs: string[] = (chapterData.episodeUnions || []).map((ref: any) => ref.__ref).filter(Boolean);
      
      for (const episodeRef of episodeRefs) {
        const episodeData = apolloState[episodeRef];
        if (!episodeData) continue;
        
        const episodeId = episodeData.id;
        const title = episodeData.title || "";
        
        if (episodeId && title) {
          const fullUrl = `https://kakuyomu.jp/works/${workId}/episodes/${episodeId}`;
          episodes.push({
            title,
            url: fullUrl,
            episode: episodes.length + 1
          });
        }
      }
    }
    
    console.log(`[Kakuyomu] Total episodes found: ${episodes.length}`);
    return episodes;
  } catch (error) {
    console.error('Failed to parse Kakuyomu episodes:', error);
    return [];
  }
}

/**
 * カクヨムのエピソードページから本文を抽出する
 * - 旧型エピソードページ: CSS セレクタ (.widget-episodeBody) で取得
 * - 新型ページ: __NEXT_DATA__ の Apollo State body フィールドを使用
 */
export function extractKakuyomuEpisode(html: string, url: string): NarouEpisode | null {
  const $ = cheerio.load(html);

  const episodeIdMatch = url.match(/\/episodes\/(\d+)/);
  const episodeId = episodeIdMatch?.[1];
  // カクヨムの /episodes/{id} は話数ではなく一意IDなので、話数としては扱わない
  const episode: number | null = null;

  // -- 方法1: 旧型エピソードページ（CSS セレクタ） --
  const bodyEl = $('.widget-episodeBody, .js-episode-body');
  if (bodyEl.length > 0) {
    const title = $('.widget-episodeTitle').first().text().trim() || null;
    const bodyHtml = bodyEl.first().html() || "";
    const bodyText = bodyEl.first().text().trim();
    console.log(`[Kakuyomu] Episode parsed (CSS): "${title}", body length=${bodyHtml.length}`);
    return {
      url,
      episode,
      title,
      blocks: bodyHtml ? [{ kind: "body", html: bodyHtml, text: bodyText }] : []
    };
  }

  // -- 方法2: __NEXT_DATA__ (将来の新型ページ対応) --
  const nextDataScript = $('#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      const nextData = JSON.parse(nextDataScript);
      const apolloState = nextData?.props?.pageProps?.__APOLLO_STATE__;
      if (apolloState && episodeId) {
        const episodeData = apolloState[`Episode:${episodeId}`];
        if (episodeData?.body) {
          const bodyHtml: string = episodeData.body;
          const bodyText = cheerio.load(bodyHtml).text().trim();
          const title = episodeData.title || null;
          console.log(`[Kakuyomu] Episode parsed (JSON): "${title}", body length=${bodyHtml.length}`);
          return {
            url,
            episode,
            title,
            blocks: [{ kind: "body", html: bodyHtml, text: bodyText }]
          };
        }
      }
    } catch { /* ignore */ }
  }

  console.warn(`[Kakuyomu] Could not extract episode body from: ${url}`);
  return null;
}

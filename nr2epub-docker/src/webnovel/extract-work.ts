import * as cheerio from "cheerio";
import { SELECTORS, DEFAULT_UA } from "./selectors.js";
import type { NarouWorkTop } from "./types.js";
import { loadExtractConfig, extractDomainFromUrl } from "./extract-loader.js";
import { extractText, extractAttributes } from "./extract-selector.js";
import { extractJsonWork, extractJsonEpisodes } from "./extract-json.js";

async function extractMetadata(html: string, url: string): Promise<Omit<NarouWorkTop, 'episodes' | 'maxEpisode'>> {
  const domain = extractDomainFromUrl(url);
  const extractConfig = await loadExtractConfig(domain);

  // JSON_SRC が定義されていれば JSON 抽出を試みる
  if (extractConfig.JSON) {
    const jsonData = extractJsonWork(html, url, extractConfig.JSON);
    if (jsonData) {
      console.log(`[extractMetadata] JSON extraction for ${domain}: title='${jsonData.title}', author='${jsonData.author}'`);
      return {
        url,
        title: jsonData.title || "無題",
        author: jsonData.author || "作者不明",
        summary: jsonData.description || "",
        publishedText: ""
      };
    }
    console.warn(`[extractMetadata] JSON extraction failed for ${domain}, falling back to CSS`);
  }

  // CSS セレクタで抽出
  const $ = cheerio.load(html);
  const title = extractText($, extractConfig.TITLE) || "無題";
  const author = extractText($, extractConfig.AUTHOR) || "作者不明";
  const summary = extractText($, extractConfig.DESCRIPTION) || "";

  console.log(`[extractMetadata] CSS extraction for ${domain}: title='${title}', author='${author}'`);

  const publishedText = $(SELECTORS.workTop.published).first().text().trim() || "";

  return { url, title, author, summary, publishedText };
}

async function extractEpisodes(html: string, baseUrl: string): Promise<NarouWorkTop["episodes"]> {
  const domain = extractDomainFromUrl(baseUrl);
  const extractConfig = await loadExtractConfig(domain);

  // JSON_SRC + JSON_HREF が定義されていれば JSON 抽出を試みる
  if (extractConfig.JSON?.href) {
    const jsonEpisodes = extractJsonEpisodes(html, baseUrl, extractConfig.JSON);
    if (jsonEpisodes.length > 0) {
      console.log(`[extractEpisodes] JSON extraction for ${domain}: found ${jsonEpisodes.length} episodes`);
      return jsonEpisodes.map((ep, i) => ({
        title: ep.title || `Episode ${i + 1}`,
        url: ep.url || '',
        episode: i + 1
      }));
    }
    console.warn(`[extractEpisodes] JSON extraction failed for ${domain}, falling back to CSS`);
  }

  // CSS セレクタで抽出
  const $ = cheerio.load(html);
  const episodes: NarouWorkTop["episodes"] = [];

  if (!extractConfig.HREF) {
    throw new Error(`extract.txt に HREF ルールが定義されていません (${domain})`);
  }

  const hrefs = extractAttributes($, extractConfig.HREF, 'href');

  for (const href of hrefs) {
    let episodeMatch = href.match(/\/(\d+)\/?$/);
    if (!episodeMatch) episodeMatch = href.match(/\/episodes\/(\d+)/);
    const episode = episodeMatch ? Number(episodeMatch[1]) : null;
    const absUrl = href.startsWith('http') ? href : new URL(href, baseUrl).toString();
    const title = `Episode ${episode || episodes.length + 1}`;
    episodes.push({ title, url: absUrl, episode });
  }

  return episodes;
}

/**
 * 目次ページから各話の更新日時を抽出
 * class="p-eplist__update" から取得
 * 改訂（改）がある場合は title 属性の改訂日時を取得
 * 形式："YYYY/MM/DD HH:MM" または "YYYY/MM/DD HH:MM 改稿"
 */
export function extractEpisodeUpdateTimes(html: string): Map<number, string> {
  const $ = cheerio.load(html);
  const updateTimes = new Map<number, string>();

  // 目次リスト内の各エピソード行を走査
  $(".p-eplist__item").each((_, itemEl) => {
    const $item = $(itemEl);
    
    // エピソード番号を取得（リンクのhrefから）
    const episodeLink = $item.find(".p-eplist__subtitle").first().attr("href");
    if (!episodeLink) return;
    
    const episodeMatch = episodeLink.match(/\/(\d+)\/?$/);
    if (!episodeMatch) return;
    const episodeNum = Number(episodeMatch[1]);

    // 更新時刻情報を取得
    const $updateDiv = $item.find(".p-eplist__update").first();
    if (!$updateDiv.length) return;

    // 改訂（改）マークがあるかチェック
    const $revisionSpan = $updateDiv.find("span[title*='改稿']").first();
    let updateTime: string | null = null;

    if ($revisionSpan.length > 0) {
      // 改訂がある場合：title 属性から抽出
      const titleAttr = $revisionSpan.attr("title") || "";
      // title 例："2025/06/27 18:04 改稿"
      const timeMatch = titleAttr.match(/(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
      if (timeMatch) {
        updateTime = timeMatch[1];
      }
    } else {
      // 改訂がない場合：初回投稿日時を取得
      const text = $updateDiv.text().trim();
      // text 例："2017/11/11 18:28"
      const timeMatch = text.match(/(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2})/);
      if (timeMatch) {
        updateTime = timeMatch[1];
      }
    }

    if (updateTime && episodeNum > 0) {
      updateTimes.set(episodeNum, updateTime);
    }
  });

  return updateTimes;
}

function findLastPageUrl(html: string, currentPageUrl: string): string | null {
  const $ = cheerio.load(html);

  // 「最後へ」リンクを探す
  let lastPageLink: string | null = null;
  $("a").each((_, el) => {
    const text = $(el).text().trim();
    if (text === "最後へ" || text === "最後へ >" || text.startsWith("最後")) {
      const href = $(el).attr("href");
      if (href) {
        lastPageLink = href.startsWith("http") ? href : new URL(href, currentPageUrl).href;
        return false; // break
      }
    }
  });

  return lastPageLink;
}

export async function parseWorkTop(html: string, url: string): Promise<NarouWorkTop> {
  // メタデータを最初のページから取得
  const metadata = await extractMetadata(html, url);

  // 最初のページからエピソードを取得
  const episodes = await extractEpisodes(html, url);

  // ページネーション対応：最後ページへのリンクを探す
  let maxEpisode = 0;
  if (episodes.length > 0) {
    const lastEpisode = Math.max(...episodes.filter(e => e.episode).map(e => e.episode || 0));
    maxEpisode = lastEpisode;
  }

  // 最後ページへのリンクが存在する場合、そこから最大話数を取得
  const lastPageUrl = findLastPageUrl(html, url);
  if (lastPageUrl && lastPageUrl !== url) {
    try {
      const lastPageRes = await fetch(lastPageUrl, {
        headers: {
          "user-agent": DEFAULT_UA,
          "accept-language": "ja,en;q=0.9"
        }
      });
      if (lastPageRes.ok) {
        const lastPageHtml = await lastPageRes.text();
        const lastPageEpisodes = await extractEpisodes(lastPageHtml, url);
        if (lastPageEpisodes.length > 0) {
          const lastPageMax = Math.max(...lastPageEpisodes.filter(e => e.episode).map(e => e.episode || 0));
          maxEpisode = Math.max(maxEpisode, lastPageMax);
        }
      }
    } catch (err) {
      // 最後ページの取得に失敗した場合は、最初のページの max を使用
      console.error("Failed to fetch last page:", err);
    }
  }

  return {
    ...metadata,
    episodes,
    maxEpisode
  };
}

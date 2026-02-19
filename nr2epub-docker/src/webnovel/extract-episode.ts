import * as cheerio from "cheerio";
import { SELECTORS } from "./selectors.js";
import { normalizeEpisodeBlocks } from "./normalize.js";
import type { NarouEpisode } from "./types.js";
import { extractKakuyomuEpisode } from "./extract-kakuyomu.js";

export function parseEpisode(html: string, url: string): NarouEpisode {
  // カクヨムは SPA なので専用抽出器を使用
  if (url.includes('kakuyomu.jp')) {
    const kakuyomuEpisode = extractKakuyomuEpisode(html, url);
    if (kakuyomuEpisode) return kakuyomuEpisode;
    console.warn(`[parseEpisode] Kakuyomu extraction failed, falling back for ${url}`);
  }

  const $ = cheerio.load(html);
  const title = $(SELECTORS.episode.title).first().text().trim() || null;
  const blocks: NarouEpisode["blocks"] = [];
  const episodeMatch = url.match(/\/(\d+)\/?$/);
  const episode = episodeMatch ? Number(episodeMatch[1]) : null;

  const prefaceBlocks: Array<{ html: string; text: string }> = [];
  $(SELECTORS.episode.preface).each((_, el) => {
    const htmlBlock = $(el).html() || "";
    const textBlock = $(el).text().trim();
    if (htmlBlock || textBlock) {
      prefaceBlocks.push({ html: htmlBlock, text: textBlock });
    }
  });

  const bodyElements = $("*[id]").filter((_, el) => {
    const id = $(el).attr("id") || "";
    return /^L\d+$/.test(id);
  });
  if (bodyElements.length > 0) {
    const bodyHtml = bodyElements
      .map((_, el) => $.html(el))
      .get()
      .join("\n");
    const bodyText = bodyElements
      .map((_, el) => $(el).text())
      .get()
      .join("\n")
      .trim();
    if (bodyHtml || bodyText) {
      blocks.push({ kind: "body", html: bodyHtml, text: bodyText });
    }
  } else {
    const textBlocks: Array<{ html: string; text: string }> = [];
    $(SELECTORS.episode.text).each((_, el) => {
      if ($(el).hasClass("p-novel__text--afterword") || $(el).hasClass("p-novel__text--preface")) {
        return;
      }
      const htmlBlock = $(el).html() || "";
      const textBlock = $(el).text().trim();
      if (htmlBlock || textBlock) {
        textBlocks.push({ html: htmlBlock, text: textBlock });
      }
    });

    if (textBlocks.length === 1) {
      blocks.push({ kind: "body", ...textBlocks[0] });
    } else if (textBlocks.length > 1) {
      blocks.push({ kind: "preface", ...textBlocks[0] });
      textBlocks.slice(1).forEach((block) => {
        blocks.push({ kind: "body", ...block });
      });
    }
  }

  prefaceBlocks.forEach((block) => {
    blocks.unshift({ kind: "preface", ...block });
  });

  $(SELECTORS.episode.afterword).each((_, el) => {
    const htmlBlock = $(el).html() || "";
    const textBlock = $(el).text().trim();
    if (htmlBlock || textBlock) {
      blocks.push({ kind: "afterword", html: htmlBlock, text: textBlock });
    }
  });

  return { url, episode, title, blocks: normalizeEpisodeBlocks(blocks) };
}

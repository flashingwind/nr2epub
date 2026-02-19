import { EpubBuilder } from "./builder.js";
import { generateCoverXhtml, generateTitleXhtml, generateChapterXhtml } from "./templates.js";
import { generateMimetype, generateContainerXml } from "./structure.js";
import { createEpubZip, createEpubStream, type EpubFile } from "./packager.js";
import { normalizeInlineHtml, normalizeTitle, normalizeTitleForNcx } from "../webnovel/normalize.js";
import { DEFAULT_UA } from "../webnovel/selectors.js";
import type { NarouWorkTop, NarouEpisode } from "../webnovel/types.js";
import { readFileSync } from "fs";
import { join, extname } from "path";
import * as cheerio from "cheerio";
import sharp from "sharp";

const IMAGE_TOTAL_LIMIT = 50 * 1024 * 1024;
const IMAGE_MAX_WIDTH = 1272;
const IMAGE_MAX_HEIGHT = 1696;

export interface GenerateEpubOptions {
  workTop: NarouWorkTop;
  episodes: NarouEpisode[];
  outputPath?: string;
}

export async function generateEpub(options: GenerateEpubOptions): Promise<string | NodeJS.ReadableStream> {
  const { workTop, episodes, outputPath } = options;
  
  const identifier = `urn:uuid:${generateUuid()}`;
  const modified = new Date().toISOString().replace(/\.[0-9]{3}Z$/, "Z");

  const builder = new EpubBuilder({
    title: workTop.title,
    author: workTop.author,
    language: "ja",
    identifier,
    description: workTop.summary,
    publisher: "小説家になろう",
    source: workTop.url,
    subjects: ["小説家になろう"],
    modified
  });

  // 縦書き（vertical-rl）では読書進行を右→左にする
  builder.setPageProgressionDirection("rtl");

  // Add manifest items
  builder.addManifestItem({
    id: "nav",
    href: "nav.xhtml",
    mediaType: "application/xhtml+xml",
    properties: "nav"
  });
  
  builder.addManifestItem({
    id: "ncx",
    href: "toc.ncx",
    mediaType: "application/x-dtbncx+xml"
  });
  
  builder.addManifestItem({
    id: "style",
    href: "style.css",
    mediaType: "text/css"
  });
  
  builder.addManifestItem({
    id: "cover",
    href: "cover.xhtml",
    mediaType: "application/xhtml+xml"
  });
  
  builder.addManifestItem({
    id: "title",
    href: "title.xhtml",
    mediaType: "application/xhtml+xml"
  });

  // Add chapters to manifest
  for (let i = 0; i < episodes.length; i++) {
    const episode = episodes[i];
    const chapterId = `chapter${String(i + 1).padStart(3, "0")}`;
    builder.addManifestItem({
      id: chapterId,
      href: `${chapterId}.xhtml`,
      mediaType: "application/xhtml+xml"
    });
  }

  // Add spine items
  builder.addSpineItem({ idref: "cover" });
  builder.addSpineItem({ idref: "title" });
  builder.addSpineItem({ idref: "nav" });  // 目次をページとして追加
  
  for (let i = 0; i < episodes.length; i++) {
    const chapterId = `chapter${String(i + 1).padStart(3, "0")}`;
    builder.addSpineItem({ idref: chapterId });
  }

  // Add TOC items
  builder.addTocItem({ 
    title: normalizeTitleForNcx("表紙"), 
    titleHtml: normalizeTitle("表紙"), 
    href: "cover.xhtml" 
  });
  builder.addTocItem({ 
    title: normalizeTitleForNcx("タイトル"), 
    titleHtml: normalizeTitle("タイトル"), 
    href: "title.xhtml" 
  });
  
  for (let i = 0; i < episodes.length; i++) {
    const episode = episodes[i];
    const chapterId = `chapter${String(i + 1).padStart(3, "0")}`;
    const episodeTitle = episode.title || (episodes.length === 1 ? workTop.title : "無題");
    const useEpisodeNumber = Boolean(episode.episode && !(episodes.length === 1 && !episode.title));
    const title = useEpisodeNumber ? `第${episode.episode}話 ${episodeTitle}` : episodeTitle;
    builder.addTocItem({ 
      title: normalizeTitleForNcx(title), 
      titleHtml: normalizeTitle(title), 
      href: `${chapterId}.xhtml` 
    });
  }

  // Generate EPUB files
  const files: EpubFile[] = [];
  
  files.push({
    path: "mimetype",
    content: generateMimetype()
  });
  
  files.push({
    path: "META-INF/container.xml",
    content: generateContainerXml()
  });
  
  files.push({
    path: "OEBPS/nav.xhtml",
    content: builder.generateNav()
  });
  
  files.push({
    path: "OEBPS/toc.ncx",
    content: builder.generateTocNcx()
  });
  
  // Load CSS from source (will be copied to dist during build)
  const cssPath = join(process.cwd(), "src", "epub", "style.css");
  const cssContent = readFileSync(cssPath, "utf-8");
  files.push({
    path: "OEBPS/style.css",
    content: cssContent
  });
  
  files.push({
    path: "OEBPS/cover.xhtml",
    content: generateCoverXhtml(workTop.title, workTop.author)
  });
  
  files.push({
    path: "OEBPS/title.xhtml",
    content: generateTitleXhtml(workTop.title, workTop.author, workTop.summary)
  });

  const imageMap = new Map<string, ImageAsset>();

  // Generate chapter files
  for (let i = 0; i < episodes.length; i++) {
    const episode = episodes[i];
    const chapterId = `chapter${String(i + 1).padStart(3, "0")}`;
    
    const prefaceBlock = episode.blocks.find(b => b.kind === "preface");
    const bodyBlocks = episode.blocks.filter(b => b.kind === "body");
    const afterwordBlock = episode.blocks.find(b => b.kind === "afterword");
    
    const prefaceHtml = prefaceBlock ? normalizeInlineHtml(prefaceBlock.html) : undefined;
    let bodyHtml = removeConsecutiveBlankLines(bodyBlocks.map((b) => normalizeInlineHtml(b.html)).join("\n"));
    bodyHtml = removeLeadingSpacesFromParagraphs(bodyHtml);
    let afterwordHtml = afterwordBlock ? normalizeInlineHtml(afterwordBlock.html) : undefined;
    
    let prefaceWithImages = undefined;
    if (prefaceHtml) {
      const prefaceProcessed = removeLeadingSpacesFromParagraphs(prefaceHtml);
      prefaceWithImages = await replaceImagesInHtml(prefaceProcessed, episode.url, imageMap);
    }
    const bodyWithImages = await replaceImagesInHtml(bodyHtml, episode.url, imageMap);
    let afterwordWithImages = undefined;
    if (afterwordHtml) {
      const afterwordProcessed = removeLeadingSpacesFromParagraphs(afterwordHtml);
      afterwordWithImages = await replaceImagesInHtml(afterwordProcessed, episode.url, imageMap);
    }
    const episodeTitle = episode.title || (episodes.length === 1 ? workTop.title : "無題");
    const useEpisodeNumber = Boolean(episode.episode && !(episodes.length === 1 && !episode.title));
    
    const chapterContent = generateChapterXhtml(
      episodeTitle,
      useEpisodeNumber ? (episode.episode ?? undefined) : undefined,
      bodyWithImages,
      prefaceWithImages,
      afterwordWithImages
    );
    
    files.push({
      path: `OEBPS/${chapterId}.xhtml`,
      content: chapterContent
    });
  }

  await optimizeImagesIfNeeded(imageMap);

  for (const asset of imageMap.values()) {
    builder.addManifestItem({
      id: asset.id,
      href: asset.href,
      mediaType: asset.mediaType
    });
    files.push({
      path: `OEBPS/${asset.href}`,
      content: asset.data
    });
  }

  files.push({
    path: "OEBPS/content.opf",
    content: builder.generateContentOpf()
  });

  // Create EPUB
  if (outputPath) {
    await createEpubZip(files, outputPath);
    return outputPath;
  } else {
    return createEpubStream(files);
  }
}

type ImageAsset = {
  id: string;
  href: string;
  mediaType: string;
  data: Buffer;
};

async function replaceImagesInHtml(
  html: string,
  baseUrl: string,
  imageMap: Map<string, ImageAsset>
): Promise<string> {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const images = $("#root img").toArray();
  for (const img of images) {
    const src = $(img).attr("src");
    if (!src) continue;
    let absoluteUrl: string;
    try {
      absoluteUrl = new URL(src, baseUrl).toString();
    } catch {
      continue;
    }
    const asset = await ensureImageAsset(absoluteUrl, imageMap);
    if (!asset) continue;
    $(img).attr("src", asset.href);
    $(img).removeAttr("srcset");
  }
  return $("#root").html() || "";
}

async function ensureImageAsset(url: string, imageMap: Map<string, ImageAsset>): Promise<ImageAsset | null> {
  const existing = imageMap.get(url);
  if (existing) return existing;

  const response = await fetch(url, {
    headers: {
      "user-agent": DEFAULT_UA,
      "accept-language": "ja,en;q=0.9"
    }
  });
  if (!response.ok) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentTypeHeader = response.headers.get("content-type") || "application/octet-stream";
  const mediaType = contentTypeHeader.split(";")[0].trim();
  const extFromUrl = extname(new URL(url).pathname).toLowerCase();
  const ext = isImageExtension(extFromUrl) ? extFromUrl : extensionFromContentType(mediaType);
  const index = imageMap.size + 1;
  const filename = `image-${String(index).padStart(3, "0")}${ext || ""}`;
  const asset: ImageAsset = {
    id: `img-${String(index).padStart(3, "0")}`,
    href: `images/${filename}`,
    mediaType: mediaType || "application/octet-stream",
    data: buffer
  };

  imageMap.set(url, asset);
  return asset;
}

async function optimizeImagesIfNeeded(imageMap: Map<string, ImageAsset>): Promise<void> {
  if (imageMap.size === 0) return;
  const totalBytes = Array.from(imageMap.values()).reduce((sum, asset) => sum + asset.data.length, 0);
  if (totalBytes <= IMAGE_TOTAL_LIMIT) return;

  for (const asset of imageMap.values()) {
    await optimizeImageAsset(asset);
  }
}

async function optimizeImageAsset(asset: ImageAsset): Promise<void> {
  if (!isRasterImage(asset.mediaType)) return;

  let image = sharp(asset.data, { limitInputPixels: false });
  const metadata = await image.metadata();
  const shouldResize =
    metadata.width !== undefined &&
    metadata.height !== undefined &&
    (metadata.width > IMAGE_MAX_WIDTH || metadata.height > IMAGE_MAX_HEIGHT);

  if (shouldResize) {
    image = image.resize({
      width: IMAGE_MAX_WIDTH,
      height: IMAGE_MAX_HEIGHT,
      fit: "inside",
      withoutEnlargement: true
    });
  }

  switch (asset.mediaType) {
    case "image/png":
      image = image.png({ compressionLevel: 9, adaptiveFiltering: true });
      break;
    case "image/webp":
      image = image.webp({ lossless: true });
      break;
    case "image/jpeg":
      if (!shouldResize) return;
      image = image.jpeg({ quality: 85, mozjpeg: true });
      break;
    default:
      return;
  }

  asset.data = await image.toBuffer();
}

/**
 * 連続した5行以下の空行を削除（空の p タグ）
 * AozoraEpub3 の「5行以下の空行は削除」に合わせる
 */
function removeConsecutiveBlankLines(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const root = $("#root");
  const children = root.children().toArray();

  const isEmptyParagraph = (node: any): boolean => {
    if (node.type !== "tag" || node.name !== "p") return false;
    const $p = $(node);
    if ($p.find("img, svg, video, audio, iframe").length > 0) return false;
    const text = $p.text().replace(/\u00a0/g, "").trim();
    return text.length === 0;
  };

  let run: any[] = [];
  const flushRun = () => {
    if (run.length > 0 && run.length <= 5) {
      for (const node of run) {
        $(node).remove();
      }
    }
    run = [];
  };

  for (const node of children) {
    if (isEmptyParagraph(node)) {
      run.push(node);
    } else {
      flushRun();
    }
  }
  flushRun();

  return root.html() || "";
}

/**
 * 段落から全角スペースを削除
 * CSS の text-indent で統一的に字下げを制御
 */
function removeLeadingSpacesFromParagraphs(html: string): string {
  const $ = cheerio.load(`<div id="root">${html}</div>`);
  const root = $("#root");

  root.find("p").each((_, p) => {
    const $p = $(p);
    
    const firstNode = $p.contents()[0];
    if (!firstNode || firstNode.type !== "text") return;

    const text = firstNode.data || "";
    // 先頭の全角スペース・半角スペース・改行をすべて削除
    const newText = text.replace(/^[\u3000 \n]*/g, "");
    firstNode.data = newText;
  });

  return root.html() || "";
}

function isImageExtension(ext: string): boolean {
  return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext);
}

function isRasterImage(mediaType: string): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(mediaType);
}

function extensionFromContentType(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    case "image/svg+xml":
      return ".svg";
    default:
      return "";
  }
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

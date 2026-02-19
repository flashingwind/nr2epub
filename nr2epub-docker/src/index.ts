import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEpisode, parseWorkTop, extractEpisodeUpdateTimes } from "./webnovel/extract.js";
import { DEFAULT_UA } from "./webnovel/selectors.js";
import { generateEpub } from "./epub/generator.js";
import { MailSender } from "./mail/sender.js";
import { sanitizeFilename } from "./mail/sender.js";
import { narouCache } from "./webnovel/cache.js";
import { randomUUID } from "node:crypto";
import type { NarouEpisode } from "./webnovel/types.js";
import { Readable } from "stream";

const app = express();
const port = Number(process.env.PORT || 3000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ジョブ進捗管理
interface JobProgress {
  status: "processing" | "completed" | "error";
  progress: number;
  total: number;
  message?: string;
  error?: string;
  epubData?: Buffer;     // EPUB バイナリデータ（ダウンロード用）
  filename?: string;     // ファイル名（メール/ダウンロード用）
}

const jobProgress = new Map<string, JobProgress>();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../public")));

// キャッシュ機能付きfetch（条件付きリクエスト・Narou更新情報対応）
// downloaded: true = 実際にHTTPリクエストを実行した（MISS）、false = キャッシュから返した（HIT）
async function fetchWithCache(url: string): Promise<{ html: string; downloaded: boolean }> {
  // エピソード URL かどうかを判定（https://ncode.syosetu.com/n5128ej/1/）
  const episodeMatch = url.match(/^(https:\/\/ncode\.syosetu\.com\/[^\/]+)\/(\d+)\/?$/);
  
  if (episodeMatch) {
    // エピソード URL の場合：更新情報をチェック
    const baseUrl = episodeMatch[1];
    const episodeNum = Number(episodeMatch[2]);
    
    // キャッシュから取得を試みる
    const cached = narouCache.get(url);
    if (cached) {
      // キャッシュがあれば、更新情報を確認（episodeUpdateTime があれば）
      if (cached.episodeUpdateTime) {
        console.log(`Checking cache freshness: ${url}`);
        try {
          const contentsPageUrl = `${baseUrl}/`;
          const currentUpdateTimes = await getEpisodeUpdateTimesFromContents(contentsPageUrl);
          const currentUpdateTime = currentUpdateTimes.get(episodeNum);
          
          if (currentUpdateTime === cached.episodeUpdateTime) {
            console.log(`Cache hit (fresh): ${url} (${currentUpdateTime})`);
            return { html: cached.html, downloaded: false };
          } else {
            console.log(`Cache stale, need update: ${url} (old: ${cached.episodeUpdateTime}, new: ${currentUpdateTime})`);
          }
        } catch (err) {
          console.warn(`Failed to check update times for ${url}:`, err);
          // 更新確認失敗時はキャッシュを返す
          return { html: cached.html, downloaded: false };
        }
      } else {
        // episodeUpdateTime がない場合（古いキャッシュ）はそのまま返す
        console.log(`Cache hit (no updateTime): ${url}`);
        return { html: cached.html, downloaded: false };
      }
    }
  } else {
    // 通常の URL（目次ページなど）
    const cached = narouCache.get(url);
    if (cached) {
      console.log(`Cache hit: ${url}`);
      return { html: cached.html, downloaded: false };
    }
  }

  console.log(`Cache miss or expired: ${url}`);
  
  const html = await fetchRemote(url, episodeMatch ? Number(episodeMatch[2]) : undefined);
  return { html, downloaded: true };
}

/**
 * 目次ページから各話の更新日時を取得
 */
async function getEpisodeUpdateTimesFromContents(contentsPageUrl: string): Promise<Map<number, string>> {
  // 目次ページをfetch (キャッシュなし・更新チェック用)
  const conditionalHeaders = narouCache.getConditionalHeaders(contentsPageUrl);
  const headers: Record<string, string> = {
    "user-agent": DEFAULT_UA,
    "accept-language": "ja,en;q=0.9",
    ...conditionalHeaders
  };

  const response = await fetch(contentsPageUrl, { headers });
  if (!response.ok && response.status !== 304) {
    throw new Error(`Failed to fetch contents page: ${response.status}`);
  }

  let contentsHtml: string;
  if (response.status === 304) {
    const cached = narouCache.get(contentsPageUrl);
    if (!cached) throw new Error("Cache miss on 304 response");
    contentsHtml = cached.html;
  } else {
    contentsHtml = await response.text();
  }

  return extractEpisodeUpdateTimes(contentsHtml);
}

/**
 * リモートサーバー(Narou)から実際にHTTPリクエストを実行
 */
async function fetchRemote(url: string, episodeNum?: number): Promise<string> {
  // 条件付きリクエストヘッダを準備
  const conditionalHeaders = narouCache.getConditionalHeaders(url);
  const headers: Record<string, string> = {
    "user-agent": DEFAULT_UA,
    "accept-language": "ja,en;q=0.9",
    ...conditionalHeaders
  };

  const response = await fetch(url, { headers });

  // 304 Not Modified: キャッシュが最新
  if (response.status === 304) {
    const cached = narouCache.get(url);
    if (cached) {
      console.log(`Cache is fresh (304): ${url}`);
      return cached.html;
    }
  }

  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const etag = response.headers.get("etag") || undefined;
  const lastModified = response.headers.get("last-modified") || undefined;
  
  // エピソード URL の場合、更新情報を抽出
  let episodeUpdateTime: string | undefined;
  if (episodeNum && url.includes("/ncode.syosetu.com/")) {
    try {
      const baseUrlMatch = url.match(/^(https:\/\/ncode\.syosetu\.com\/[^\/]+)\//);
      if (baseUrlMatch) {
        const baseUrl = baseUrlMatch[1];
        const updateTimes = await getEpisodeUpdateTimesFromContents(`${baseUrl}/`);
        episodeUpdateTime = updateTimes.get(episodeNum);
      }
    } catch (err) {
      console.warn(`Failed to extract episode update time for ep ${episodeNum}:`, err);
    }
  }
  
  narouCache.set(url, html, etag, lastModified, episodeUpdateTime);
  console.log(`Cached: ${url}`);
  return html;
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/parse-work", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const { html } = await fetchWithCache(url);
    const data = await parseWorkTop(html, url);
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/parse-episode", async (req, res) => {
  const { url } = req.body as { url?: string };
  if (!url) {
    res.status(400).json({ error: "url is required" });
    return;
  }

  try {
    const { html } = await fetchWithCache(url);
    const data = parseEpisode(html, url);
    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post("/api/generate-epub", async (req, res) => {
  const { workUrl, episodeUrls, author, title, sendEmail, smtp, recipient } = req.body as { 
    workUrl?: string; 
    episodeUrls?: string[];
    author?: string;
    title?: string;
    sendEmail?: boolean;
    smtp?: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
    };
    recipient?: string;
  };
  
  if (!workUrl) {
    res.status(400).json({ error: "workUrl is required" });
    return;
  }
  
  if (!episodeUrls || episodeUrls.length === 0) {
    res.status(400).json({ error: "episodeUrls is required and must not be empty" });
    return;
  }

  if (sendEmail) {
    // メール送信モード：ジョブを開始して jobId を返す
    if (!recipient) {
      res.status(400).json({ error: "recipient is required for email" });
      return;
    }

    const jobId = randomUUID();
    jobProgress.set(jobId, {
      status: "processing",
      progress: 0,
      total: episodeUrls.length,
      message: "EPUB生成中..."
    });

    // 非同期で EPUB 生成 → メール送信
    processGenerateAndSendEpubAsync(jobId, workUrl, episodeUrls, author, title, recipient, smtp).catch((err) => {
      const job = jobProgress.get(jobId);
      if (job) {
        job.status = "error";
        job.error = String(err);
      }
    });

    res.status(202).json({ jobId, message: "EPUB生成・送信を開始しました。進捗は /api/job-progress/:jobId で確認できます" });
    return;
  }

  // ダウンロードモード：ジョブを開始して jobId を返す
  const jobId = randomUUID();
  jobProgress.set(jobId, {
    status: "processing",
    progress: 0,
    total: episodeUrls.length,
    message: "EPUB生成中..."
  });

  // 非同期で EPUB 生成
  processGenerateEpubAsync(jobId, workUrl, episodeUrls, author, title).catch((err) => {
    const job = jobProgress.get(jobId);
    if (job) {
      job.status = "error";
      job.error = String(err);
    }
  });

  res.status(202).json({ jobId, message: "EPUB生成を開始しました。進捗は /api/job-progress/:jobId で確認できます" });
});

/**
 * EPUB生成の非同期処理（ダウンロード用）
 */
async function processGenerateEpubAsync(
  jobId: string,
  workUrl: string,
  episodeUrls: string[],
  author: string | undefined,
  title: string | undefined
): Promise<void> {
  const job = jobProgress.get(jobId);
  if (!job) return;

  try {
    // Parse work top
    job.message = "作品情報を取得中...";
    const { html: workHtml } = await fetchWithCache(workUrl);
    const workTop = await parseWorkTop(workHtml, workUrl);

    // Parse episodes
    job.message = "エピソードを取得中...";
    const episodes: NarouEpisode[] = [];
    const totalEpisodes = episodeUrls.length;
    let hitCount = 0;
    let missCount = 0;
    
    for (let i = 0; i < episodeUrls.length; i++) {
      const episodeUrl = episodeUrls[i];
      try {
        console.log(`[Download] Processing episode ${i + 1}/${totalEpisodes}: ${episodeUrl}`);
        const { html: episodeHtml, downloaded } = await fetchWithCache(episodeUrl);
        const cacheLabel = downloaded ? 'MISS' : 'HIT';
        if (downloaded) {
          missCount++;
          // サーバー負荷軽減のため 100ms 待機
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          hitCount++;
        }
        const episode = parseEpisode(episodeHtml, episodeUrl);
        episodes.push(episode);
        job.progress = i + 1;
        job.message = `エピソード ${i + 1}/${totalEpisodes} [${cacheLabel}] (HIT:${hitCount} MISS:${missCount})`;
      } catch (err) {
        console.warn(`[Download] Failed to fetch episode ${i + 1}/${totalEpisodes}: ${episodeUrl}`, err);
        continue;
      }
    }

    if (episodes.length === 0) {
      job.status = "error";
      job.error = "No episodes could be parsed";
      return;
    }

    // Generate EPUB
    job.message = `EPUB生成中... (${episodes.length}話)`;
    const epubStream = await generateEpub({
      workTop,
      episodes
    });

    // Stream を Buffer に変換（ダウンロード用保存）
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      (epubStream as NodeJS.ReadableStream)
        .on('data', (chunk) => chunks.push(chunk))
        .on('end', () => resolve())
        .on('error', reject);
    });
    const epubBuffer = Buffer.concat(chunks);

    // ジョブ完了情報を保存
    job.progress = totalEpisodes;
    job.status = "completed";
    job.message = `✅ EPUB生成完了 (${episodes.length}話)`;
    job.epubData = epubBuffer;
    const safeAuthor = author || "";
    const safeTitle = title || "Untitled";
    job.filename = safeAuthor && safeAuthor.trim() ? `[${sanitizeFilename(safeAuthor)}]${sanitizeFilename(safeTitle)}.epub` : `${sanitizeFilename(safeTitle)}.epub`;
  } catch (error) {
    console.error("EPUB generate error:", error);
    job.status = "error";
    job.error = String(error);
  }
}

/**
 * EPUB生成→メール送信の非同期処理
 */
async function processGenerateAndSendEpubAsync(
  jobId: string,
  workUrl: string,
  episodeUrls: string[],
  author: string | undefined,
  title: string | undefined,
  recipient: string,
  smtp: any
): Promise<void> {
  const job = jobProgress.get(jobId);
  if (!job) return;

  try {
    // SMTP設定
    const finalMailConfig = smtp ? {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass
      }
    } : {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
      }
    };

    if (!finalMailConfig.auth.user || !finalMailConfig.auth.pass) {
      job.status = "error";
      job.error = "SMTP credentials not configured";
      return;
    }

    // Parse work top
    job.message = "作品情報を取得中...";
    const { html: workHtml } = await fetchWithCache(workUrl);
    const workTop = await parseWorkTop(workHtml, workUrl);

    // Parse episodes
    job.message = "エピソードを取得中...";
    const episodes: NarouEpisode[] = [];
    const totalEpisodes = episodeUrls.length;
    let hitCount = 0;
    let missCount = 0;

    for (let i = 0; i < episodeUrls.length; i++) {
      const episodeUrl = episodeUrls[i];
      try {
        console.log(`[Email] Processing episode ${i + 1}/${totalEpisodes}: ${episodeUrl}`);
        const { html: episodeHtml, downloaded } = await fetchWithCache(episodeUrl);
        const cacheLabel = downloaded ? 'MISS' : 'HIT';
        if (downloaded) {
          missCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          hitCount++;
        }
        const episode = parseEpisode(episodeHtml, episodeUrl);
        episodes.push(episode);
        job.progress = i + 1;
        job.message = `エピソード ${i + 1}/${totalEpisodes} [${cacheLabel}] (HIT:${hitCount} MISS:${missCount})`;
      } catch (err) {
        console.warn(`[Email] Failed to fetch episode ${i + 1}/${totalEpisodes}: ${episodeUrl}`, err);
        continue;
      }
    }

    if (episodes.length === 0) {
      job.status = "error";
      job.error = "No episodes could be parsed";
      return;
    }

    // Generate EPUB
    job.message = `EPUB生成中... (${episodes.length}話)`;
    const epubStream = await generateEpub({
      workTop,
      episodes
    });

    // Stream を Buffer に変換（ダウンロード・メール用）
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      (epubStream as NodeJS.ReadableStream)
        .on('data', (chunk) => chunks.push(chunk))
        .on('end', () => resolve())
        .on('error', reject);
    });
    const epubBuffer = Buffer.concat(chunks);

    // Send email
    job.message = `メール送信中... (${recipient})`;
    const sender = new MailSender(finalMailConfig);
    const emailTitle = title || workTop.title || "Untitled";
    const emailAuthor = author || "";
    await sender.sendEpub(recipient, emailTitle, Readable.from(epubBuffer), emailAuthor);

    job.progress = totalEpisodes;
    job.status = "completed";
    job.message = `✅ ${recipient} へメール送信完了 (${episodes.length}話)`;
    job.epubData = epubBuffer;
    job.filename = emailAuthor && emailAuthor.trim() ? `[${sanitizeFilename(emailAuthor)}]${sanitizeFilename(emailTitle)}.epub` : `${sanitizeFilename(emailTitle)}.epub`;
  } catch (error) {
    console.error("EPUB generate & send error:", error);
    job.status = "error";
    job.error = String(error);
  }
}

app.post("/api/send-epub", async (req, res) => {
  const { workUrl, episodeUrls, recipient, smtp, author, title } = req.body as {
    workUrl?: string;
    episodeUrls?: string[];
    recipient?: string;
    smtp?: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
    };
    author?: string;
    title?: string;
  };
  
  if (!workUrl || !episodeUrls || !recipient) {
    res.status(400).json({ error: "workUrl, episodeUrls, and recipient are required" });
    return;
  }

  // ジョブIDを生成して即座に返す
  const jobId = randomUUID();
  jobProgress.set(jobId, {
    status: "processing",
    progress: 0,
    total: episodeUrls.length,
    message: "SMTP設定を確認中..."
  });

  // 非同期でメール送信処理を開始（await しない）
  processSendEpubAsync(jobId, workUrl, episodeUrls, recipient, smtp, author, title).catch((err) => {
    const job = jobProgress.get(jobId);
    if (job) {
      job.status = "error";
      job.error = String(err);
    }
  });

  res.status(202).json({ jobId, message: "メール送信を開始しました。進捗は /api/job-progress/:jobId で確認できます" });
});

app.get("/api/job-progress/:jobId", (req, res) => {
  const { jobId } = req.params;
  const progress = jobProgress.get(jobId);

  // ポーリング結果がブラウザやプロキシにキャッシュされないようにする
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  
  if (!progress) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  
  // 完了後は30秒でジョブを削除
  if (progress.status === "completed" || progress.status === "error") {
    setTimeout(() => jobProgress.delete(jobId), 30000);
  }
  
  res.json(progress);
});

app.get("/api/download/:jobId", (req, res) => {
  const { jobId } = req.params;
  const progress = jobProgress.get(jobId);
  
  if (!progress) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  
  if (progress.status !== "completed") {
    res.status(400).json({ error: `Job not completed (status: ${progress.status})` });
    return;
  }
  
  if (!progress.epubData || !progress.filename) {
    res.status(400).json({ error: "EPUB data not available" });
    return;
  }
  
  // EPUBファイルをダウンロード
  res.setHeader("Content-Type", "application/epub+zip");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURI(progress.filename)}"`);
  res.setHeader("Content-Length", progress.epubData.length);
  res.send(progress.epubData);
  
  // ダウンロード完了後にジョブを削除
  jobProgress.delete(jobId);
});

async function processSendEpubAsync(
  jobId: string,
  workUrl: string,
  episodeUrls: string[],
  recipient: string,
  smtp: any,
  author: string | undefined,
  title: string | undefined
): Promise<void> {
  const job = jobProgress.get(jobId);
  if (!job) return;

  try {
    // SMTP設定: リクエストから取得、なければ環境変数
    const finalMailConfig = smtp ? {
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass
      }
    } : {
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || ""
      }
    };

    if (!finalMailConfig.auth.user || !finalMailConfig.auth.pass) {
      job.status = "error";
      job.error = "SMTP credentials not configured";
      return;
    }

    // Parse work top
    job.message = "作品情報を取得中...";
    const { html: workHtml } = await fetchWithCache(workUrl);
    const workTop = await parseWorkTop(workHtml, workUrl);

    // Parse episodes
    job.message = "エピソードを取得中...";
    const episodes: NarouEpisode[] = [];
    const totalEpisodes = episodeUrls.length;
    let hitCount = 0;
    let missCount = 0;

    for (let i = 0; i < episodeUrls.length; i++) {
      const episodeUrl = episodeUrls[i];
      try {
        console.log(`[Email] Processing episode ${i + 1}/${totalEpisodes}: ${episodeUrl}`);
        const { html: episodeHtml, downloaded } = await fetchWithCache(episodeUrl);
        const cacheLabel = downloaded ? 'MISS' : 'HIT';
        if (downloaded) {
          missCount++;
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          hitCount++;
        }
        const episode = parseEpisode(episodeHtml, episodeUrl);
        episodes.push(episode);
        job.progress = i + 1;
        job.message = `エピソード ${i + 1}/${totalEpisodes} [${cacheLabel}] (HIT:${hitCount} MISS:${missCount})`;
      } catch (err) {
        console.warn(`[Email] Failed to fetch episode ${i + 1}/${totalEpisodes}: ${episodeUrl}`, err);
        continue;
      }
    }

    if (episodes.length === 0) {
      job.status = "error";
      job.error = "No episodes could be parsed";
      return;
    }

    // Generate EPUB
    job.message = `EPUB生成中... (${episodes.length}話)`;
    const epubStream = await generateEpub({
      workTop,
      episodes
    });

    // Stream を Buffer に変換（ダウンロード・メール用）
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      (epubStream as NodeJS.ReadableStream)
        .on('data', (chunk) => chunks.push(chunk))
        .on('end', () => resolve())
        .on('error', reject);
    });
    const epubBuffer = Buffer.concat(chunks);

    // Send email
    job.message = `メール送信中... (${recipient})`;
    const sender = new MailSender(finalMailConfig);
    const emailTitle = title || workTop.title || "Untitled";
    const emailAuthor = author || "";
    await sender.sendEpub(recipient, emailTitle, Readable.from(epubBuffer), emailAuthor);

    job.progress = totalEpisodes;
    job.status = "completed";
    job.message = `✅ ${recipient} へメール送信完了 (${episodes.length}話)`;
    job.epubData = epubBuffer;
    job.filename = emailAuthor && emailAuthor.trim() ? `[${sanitizeFilename(emailAuthor)}]${sanitizeFilename(emailTitle)}.epub` : `${sanitizeFilename(emailTitle)}.epub`;
  } catch (error) {
    console.error("EPUB send error:", error);
    job.status = "error";
    job.error = String(error);
  }
}

app.listen(port, "0.0.0.0", () => {
  console.log(`nr2epub server listening on 0.0.0.0:${port}`);
});

import { createHash } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { parse } from "url";

export interface CacheEntry {
  url: string;
  html: string;
  etag?: string;
  lastModified?: string;
  episodeUpdateTime?: string; // 各エピソードの更新時刻（YYYY/MM/DD HH:MM形式）
  lastChecked: number;
  cachedAt: number;
}

export class NarouCache {
  private cacheDir: string;
  private memoryCache: Map<string, CacheEntry> = new Map();
  private maxAge: number; // ミリ秒

  constructor(cacheDir: string = ".cache", maxAge: number = 24 * 60 * 60 * 1000) {
    this.cacheDir = cacheDir;
    this.maxAge = maxAge;
    
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * キャッシュファイルパスを取得
   * URLの最終パスセグメントをファイル名、残りをディレクトリ構造にする
   *
   * https://ncode.syosetu.com/n5128ej/          -> .cache/ncode.syosetu.com/n5128ej.json
   * https://ncode.syosetu.com/n5128ej/1/        -> .cache/ncode.syosetu.com/n5128ej/1.json
   * https://kakuyomu.jp/works/1234/episodes/567 -> .cache/kakuyomu.jp/works/1234/episodes/567.json
   */
  private getCacheFilePath(url: string): string {
    const urlObj = parse(url);
    const hostname = urlObj.hostname || "unknown";
    const segments = (urlObj.pathname || "/")
      .replace(/\/$/, "")
      .split("/")
      .filter(s => s.length > 0);

    if (segments.length === 0) {
      return join(this.cacheDir, hostname, "index.json");
    }

    const filename = segments[segments.length - 1] + ".json";
    const dirs = segments.slice(0, -1);
    return join(this.cacheDir, hostname, ...dirs, filename);
  }

  get(url: string): CacheEntry | null {
    // メモリキャッシュを確認
    let entry = this.memoryCache.get(url);
    if (entry) {
      const age = Date.now() - entry.cachedAt;
      if (age < this.maxAge) {
        return entry;
      }
      this.memoryCache.delete(url);
    }

    // ファイルキャッシュを確認
    const filePath = this.getCacheFilePath(url);
    if (existsSync(filePath)) {
      try {
        const data = readFileSync(filePath, "utf-8");
        const fileEntry = JSON.parse(data) as CacheEntry;
        const age = Date.now() - fileEntry.cachedAt;
        if (age < this.maxAge) {
          // メモリキャッシュに復元
          this.memoryCache.set(url, fileEntry);
          return fileEntry;
        }
      } catch {
        // 破損したキャッシュは無視
      }
    }

    return null;
  }

  set(url: string, html: string, etag?: string, lastModified?: string, episodeUpdateTime?: string): void {
    const entry: CacheEntry = {
      url,
      html,
      etag,
      lastModified,
      episodeUpdateTime,
      lastChecked: Date.now(),
      cachedAt: Date.now()
    };

    // メモリキャッシュに保存
    this.memoryCache.set(url, entry);

    // ファイルキャッシュに保存
    try {
      const filePath = this.getCacheFilePath(url);
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, JSON.stringify(entry, null, 2), "utf-8");
      console.log(`Cache saved: ${filePath}`);
    } catch (err) {
      console.error("Failed to write cache file:", err);
    }
  }

  /**
   * キャッシュの条件付きリクエストヘッダを取得
   * キャッシュが存在してetagやlastModifiedがあれば、それらをヘッダとして返す
   */
  getConditionalHeaders(url: string): Record<string, string> {
    const entry = this.get(url);
    if (!entry) {
      return {};
    }

    const headers: Record<string, string> = {};
    if (entry.etag) {
      headers["If-None-Match"] = entry.etag;
    }
    if (entry.lastModified) {
      headers["If-Modified-Since"] = entry.lastModified;
    }
    return headers;
  }

  /**
   * キャッシュが最新かどうかを確認（HTTPステータスコード304で判定）
   */
  isStale(url: string, responseStatus: number, responseEtag?: string, responseLastModified?: string): boolean {
    // 304 Not Modified の場合はキャッシュが最新
    if (responseStatus === 304) {
      const entry = this.get(url);
      if (entry) {
        // lastChecked を更新
        entry.lastChecked = Date.now();
        this.set(url, entry.html, entry.etag, entry.lastModified);
        return false;
      }
    }

    // etag や lastModified が変わっていれば古い
    const entry = this.get(url);
    if (!entry) return true;

    if (responseEtag && entry.etag && responseEtag !== entry.etag) {
      return true;
    }
    if (responseLastModified && entry.lastModified && responseLastModified !== entry.lastModified) {
      return true;
    }

    return false;
  }

  clear(): void {
    this.memoryCache.clear();
  }

  // 統計情報
  getStats(): { memorySize: number; cacheDir: string } {
    return {
      memorySize: this.memoryCache.size,
      cacheDir: this.cacheDir
    };
  }
}

// グローバルキャッシュインスタンス
export const narouCache = new NarouCache();

/**
 * extract.txt パーサー
 * AozoraEpub3互換のWeb小説サイト抽出ルール定義ファイルを解析
 */

export interface ExtractRule {
  /** CSSセレクタ（カンマ区切りで複数指定可能） */
  selectors: SelectorSpec[];
  /** 正規表現パターン（オプション） */
  pattern?: string;
  /** 置換文字列（オプション） */
  replacement?: string;
}

export interface SelectorSpec {
  /** CSSセレクタ文字列 */
  selector: string;
  /** 要素の位置指定（:0, :1, :-1 など） */
  position?: number;
}

/**
 * JSON抽出設定（JSON_* ディレクティブ）
 *
 * 文法概要:
 *   JSON_SRC         script#__NEXT_DATA__
 *   JSON_URL_VAR     workId  /works/(\d+)
 *   JSON_ROOT        props.pageProps.__APOLLO_STATE__
 *   JSON_TITLE       Work:{workId}.title
 *   JSON_AUTHOR      Work:{workId}.author->activityName
 *   JSON_DESCRIPTION Work:{workId}.introduction
 *   JSON_HREF        Work:{workId}.tableOfContents[*]->episodeUnions[*]->
 *   JSON_HREF_TITLE  title
 *   JSON_HREF_URL    https://example.com/works/{workId}/episodes/{id}
 *
 * パス記法:
 *   {varName}    JSON_URL_VARで定義したURL変数（キー名にも使用可）
 *   .field       オブジェクトのフィールドアクセス
 *   [*]          配列展開（全要素）
 *   ->           __ref フィールドを解決（Apollo State用）
 *   -> で終端    refを解決したオブジェクト群を返す
 *   {field}      URL テンプレート内でエピソードオブジェクトのフィールド値を展開
 */
export interface JsonExtractConfig {
  /** JSONを含むscript要素のCSSセレクタ */
  src: string;
  /** ルートJSONパス（ドット区切り） */
  root?: string;
  /** URLから変数を抽出 { varName → regex(1グループ) } */
  urlVars: Record<string, string>;
  /** タイトルのJSONパス */
  title?: string;
  /** 著者のJSONパス */
  author?: string;
  /** 説明のJSONパス */
  description?: string;
  /** エピソードオブジェクト配列のJSONパス（ -> で終端するとref解決済みオブジェクトを返す） */
  href?: string;
  /** 各エピソードオブジェクト内のタイトルフィールド名 */
  hrefTitle?: string;
  /** エピソードURLテンプレート（{varName} {id} 等で展開） */
  hrefUrl?: string;
}

export interface ExtractConfig {
  /** 作品タイトル */
  TITLE?: ExtractRule;
  /** 著者名 */
  AUTHOR?: ExtractRule;
  /** シリーズタイトル */
  SERIES?: ExtractRule;
  /** 作品説明 */
  DESCRIPTION?: ExtractRule;
  /** 表紙画像 */
  COVER_IMG?: ExtractRule;
  
  /** 各話へのリンク */
  HREF?: ExtractRule;
  /** 各話の更新日時 */
  SUB_UPDATE?: ExtractRule;
  /** 一覧ページの話タイトル */
  SUBTITLE_LIST?: ExtractRule;
  
  /** 章タイトル（大見出し） */
  CONTENT_CHAPTER?: ExtractRule;
  /** 話タイトル（中見出し） */
  CONTENT_SUBTITLE?: ExtractRule;
  /** 本文 */
  CONTENT_ARTICLE?: ExtractRule;
  /** 前書き */
  CONTENT_PREAMBLE?: ExtractRule;
  /** 後書き */
  CONTENT_APPENDIX?: ExtractRule;
  /** 挿絵画像 */
  CONTENT_IMG?: ExtractRule;

  /** JSON抽出設定（JSON_* ディレクティブ） */
  JSON?: JsonExtractConfig;
  
  /** その他の設定 */
  PAGER_MAX?: string;
  INDEX?: ExtractRule;
  LAST_PAGE?: ExtractRule;
  
  /** その他未定義のキー */
  [key: string]: ExtractRule | string | JsonExtractConfig | undefined;
}

/**
 * extract.txt ファイルを解析して ExtractConfig を生成
 */
export function parseExtractTxt(content: string): ExtractConfig {
  const config: ExtractConfig = {};
  const lines = content.split('\n');

  // JSON設定の一時収集
  let jsonConfig: Partial<JsonExtractConfig> | null = null;

  for (const line of lines) {
    // コメント行と空行をスキップ
    if (line.trim().startsWith('#') || line.trim() === '') {
      continue;
    }
    
    // タブ区切りでフィールドを分割
    const fields = line.split('\t');
    if (fields.length < 2) continue;
    
    const key = fields[0].trim();
    const value1 = fields[1].trim();
    const value2 = fields[2]?.trim();

    // ---- JSON_* ディレクティブ ----
    if (key.startsWith('JSON_')) {
      if (!jsonConfig) jsonConfig = { urlVars: {} };
      if (!jsonConfig.urlVars) jsonConfig.urlVars = {};

      switch (key) {
        case 'JSON_SRC':        jsonConfig.src = value1; break;
        case 'JSON_ROOT':       jsonConfig.root = value1; break;
        case 'JSON_URL_VAR':    jsonConfig.urlVars[value1] = value2 || ''; break;
        case 'JSON_TITLE':      jsonConfig.title = value1; break;
        case 'JSON_AUTHOR':     jsonConfig.author = value1; break;
        case 'JSON_DESCRIPTION': jsonConfig.description = value1; break;
        case 'JSON_HREF':       jsonConfig.href = value1; break;
        case 'JSON_HREF_TITLE': jsonConfig.hrefTitle = value1; break;
        case 'JSON_HREF_URL':   jsonConfig.hrefUrl = value1; break;
      }
      continue;
    }
    
    // 数値のみの設定値（PAGER_MAX など）
    if (!value1.includes('.') && !value1.includes('#') && !value1.includes('[')) {
      config[key] = value1;
      continue;
    }
    
    // CSSセレクタをパース
    const selectors = parseSelectorField(value1);
    
    if (selectors.length > 0) {
      config[key] = {
        selectors,
        pattern: value2,
        replacement: fields[3]?.trim()
      };
    }
  }

  // JSON設定があればセット
  if (jsonConfig?.src) {
    config.JSON = jsonConfig as JsonExtractConfig;
  }
  
  return config;
}


/**
 * セレクタフィールドをパースして SelectorSpec の配列を生成
 * 例: ".p-novel__title:0,.novel_title:0" → [{ selector: ".p-novel__title", position: 0 }, ...]
 */
function parseSelectorField(field: string): SelectorSpec[] {
  const specs: SelectorSpec[] = [];
  
  // カンマで分割（複数セレクタ対応）
  const parts = field.split(',');
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // 位置指定を抽出 (:0, :1, :-1 など)
    const match = trimmed.match(/^(.+?):(-?\d+)$/);
    
    if (match) {
      specs.push({
        selector: match[1],
        position: parseInt(match[2], 10)
      });
    } else {
      specs.push({
        selector: trimmed
      });
    }
  }
  
  return specs;
}

/**
 * 正規表現パターンを適用して文字列を置換
 */
export function applyPattern(text: string, pattern?: string, replacement?: string): string {
  if (!pattern) return text;
  
  try {
    const regex = new RegExp(pattern, 'g');
    return text.replace(regex, replacement || '');
  } catch (error) {
    console.warn(`Invalid regex pattern in extract.txt: ${pattern}`, error);
    return text;
  }
}

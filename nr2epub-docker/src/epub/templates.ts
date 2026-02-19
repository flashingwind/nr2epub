import { normalizeTitle } from "../webnovel/normalize.js";

export function generateCoverXhtml(title: string, author: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>表紙</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body class="cover">
    <div class="cover-content">
      <h1 class="cover-title">${escapeXml(title)}</h1>
      <p class="cover-author">${escapeXml(author)}</p>
    </div>
  </body>
</html>`;
}

export function generateTitleXhtml(title: string, author: string, summary?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>タイトル</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body class="titlepage">
    <div class="title-content">
      <h1 class="main-title">${escapeXml(title)}</h1>
      <p class="main-author">${escapeXml(author)}</p>
      ${summary ? `<div class="summary">${escapeXml(summary)}</div>` : ""}
    </div>
  </body>
</html>`;
}

export function generateChapterXhtml(
  title: string,
  episodeNumber: number | undefined,
  bodyHtml: string,
  prefaceHtml?: string,
  afterwordHtml?: string
): string {
  const chapterTitle = episodeNumber ? `第${episodeNumber}話 ${title}` : title;
  const chapterTitleWithTcy = normalizeTitle(chapterTitle);
  const prefaceSection = prefaceHtml
    ? `<section class="preface"><h3 class="section-title">前書き</h3>${prefaceHtml}</section>`
    : "";
  const afterwordSection = afterwordHtml
    ? `<section class="afterword"><h3 class="section-title">後書き</h3>${afterwordHtml}</section>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeXml(chapterTitle)}</title>
    <link rel="stylesheet" type="text/css" href="style.css" />
  </head>
  <body class="chapter">
    <div class="chapter-content">
      <h2 class="chapter-title">${chapterTitleWithTcy}</h2>
      ${prefaceSection}
      <div class="main-text">${bodyHtml}</div>
      ${afterwordSection}
    </div>
  </body>
</html>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
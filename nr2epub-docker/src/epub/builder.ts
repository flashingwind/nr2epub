import type { EpubPackage, EpubTocItem } from "./types.js";

export class EpubBuilder {
  private pkg: EpubPackage;

  constructor(metadata: EpubPackage["metadata"]) {
    this.pkg = {
      metadata,
      manifest: [],
      spine: [],
      toc: []
    };
  }

  addManifestItem(item: EpubPackage["manifest"][0]): void {
    this.pkg.manifest.push(item);
  }

  addSpineItem(item: EpubPackage["spine"][0]): void {
    this.pkg.spine.push(item);
  }

  addTocItem(item: EpubTocItem): void {
    this.pkg.toc.push(item);
  }

  setPageProgressionDirection(direction: "ltr" | "rtl"): void {
    this.pkg.pageProgressionDirection = direction;
  }

  getPackage(): EpubPackage {
    return this.pkg;
  }

  generateContentOpf(): string {
    const { metadata, manifest, spine, pageProgressionDirection } = this.pkg;
    const subjects = metadata.subjects?.map((subject) => `    <dc:subject>${escapeXml(subject)}</dc:subject>`).join("\n") || "";
    const seriesMeta = metadata.seriesTitle
      ? `    <meta property="belongs-to-collection" id="series">${escapeXml(metadata.seriesTitle)}</meta>`
      : "";
    const seriesIndexMeta = metadata.seriesTitle && metadata.seriesIndex !== undefined
      ? `    <meta refines="#series" property="group-position">${metadata.seriesIndex}</meta>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(metadata.title)}</dc:title>
    <dc:creator>${escapeXml(metadata.author)}</dc:creator>
    <dc:language>${metadata.language}</dc:language>
    <dc:identifier id="pub-id">${metadata.identifier}</dc:identifier>
    ${metadata.description ? `<dc:description>${escapeXml(metadata.description)}</dc:description>` : ""}
    ${metadata.publisher ? `<dc:publisher>${escapeXml(metadata.publisher)}</dc:publisher>` : ""}
    ${metadata.source ? `<dc:source>${escapeXml(metadata.source)}</dc:source>` : ""}
    ${metadata.rights ? `<dc:rights>${escapeXml(metadata.rights)}</dc:rights>` : ""}
${subjects}
${seriesMeta}
${seriesIndexMeta}
    <meta property="dcterms:modified">${metadata.modified}</meta>
  </metadata>
  <manifest>
${manifest.map((item) => `    <item id="${item.id}" href="${item.href}" media-type="${item.mediaType}"${item.properties ? ` properties="${item.properties}"` : ""} />`).join("\n")}
  </manifest>
  <spine toc="ncx"${pageProgressionDirection ? ` page-progression-direction="${pageProgressionDirection}"` : ""}>
${spine.map((item) => `    <itemref idref="${item.idref}"${item.linear === false ? ` linear="no"` : ""} />`).join("\n")}
  </spine>
</package>`;
  }

  generateNav(): string {
    const { metadata, toc } = this.pkg;
    const coverHref = toc.find((item) => item.href === "cover.xhtml")?.href || "cover.xhtml";
    const titleHref = toc.find((item) => item.href === "title.xhtml")?.href || "title.xhtml";
    const firstBodyHref = toc.find((item) => !["cover.xhtml", "title.xhtml", "nav.xhtml"].includes(item.href))?.href || "";
    const renderTocItems = (items: EpubTocItem[], depth = 0): string => {
      if (items.length === 0) return "";
      const indent = "    ".repeat(depth + 2);
      let html = `${indent}<ol>\n`;
      for (const item of items) {
        const classAttr = depth === 0 ? ' class="chapter"' : "";
        html += `${indent}  <li${classAttr}>\n`;
        const displayTitle = item.titleHtml || escapeXml(item.title);
        html += `${indent}    <a href="${escapeXml(item.href)}">${displayTitle}</a>\n`;
        if (item.children && item.children.length > 0) {
          html += renderTocItems(item.children, depth + 2);
        }
        html += `${indent}  </li>\n`;
      }
      html += `${indent}</ol>\n`;
      return html;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ja" lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>目次</title>
    <style type="text/css">
      @page { margin: .5em .5em 0 0; }
      html {
        writing-mode: vertical-rl;
        -webkit-writing-mode: vertical-rl;
        -epub-writing-mode: vertical-rl;
      }
      h1 { font-size: 1.5em; padding-top: 1em; }
      li { padding: 0 .25em 0 0; list-style: none; }
      li a {
        text-decoration: none;
        border-right-width: 1px;
        border-right-style: solid;
        padding-right: 1px;
        color: #333;
      }
      nav#landmarks { display: none; }
    </style>
  </head>
  <body>
    <nav epub:type="landmarks" id="landmarks" hidden="">
      <h2>Guide</h2>
      <ol>
        <li><a epub:type="cover" href="${escapeXml(coverHref)}">表紙</a></li>
        <li><a epub:type="toc" href="nav.xhtml">目次</a></li>
        <li><a epub:type="titlepage" href="${escapeXml(titleHref)}">扉</a></li>
${firstBodyHref ? `        <li><a epub:type="bodymatter" href="${escapeXml(firstBodyHref)}">本文</a></li>` : ""}
      </ol>
    </nav>
    <nav epub:type="toc" id="toc">
      <h1>目　次</h1>
${renderTocItems(toc)}    </nav>
  </body>
</html>`;
  }

  generateTocNcx(): string {
    const { metadata, toc } = this.pkg;
    let playOrder = 1;
    const renderNavPoints = (items: EpubTocItem[], depth = 0): string => {
      if (items.length === 0) return "";
      const indent = "    ".repeat(depth + 1);
      let xml = "";
      for (const item of items) {
        xml += `${indent}<navPoint id="navPoint-${playOrder}" playOrder="${playOrder}">\n`;
        xml += `${indent}  <navLabel>\n`;
        xml += `${indent}    <text>${escapeXml(item.title)}</text>\n`;
        xml += `${indent}  </navLabel>\n`;
        xml += `${indent}  <content src="${escapeXml(item.href)}" />\n`;
        playOrder++;
        if (item.children && item.children.length > 0) {
          xml += renderNavPoints(item.children, depth + 1);
        }
        xml += `${indent}</navPoint>\n`;
      }
      return xml;
    };

    return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1" xml:lang="ja">
  <head>
    <meta name="dtb:uid" content="${metadata.identifier}" />
    <meta name="dtb:depth" content="1" />
    <meta name="dtb:totalPageCount" content="0" />
    <meta name="dtb:maxPageNumber" content="0" />
  </head>
  <docTitle>
    <text>${escapeXml(metadata.title)}</text>
  </docTitle>
  <docAuthor>
    <text>${escapeXml(metadata.author)}</text>
  </docAuthor>
  <navMap>
${renderNavPoints(toc)}  </navMap>
</ncx>`;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

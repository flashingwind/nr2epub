export type EpubMetadata = {
  title: string;
  author: string;
  language: string;
  identifier: string;
  description?: string;
  publisher?: string;
  source?: string;
  rights?: string;
  subjects?: string[];
  seriesTitle?: string;
  seriesIndex?: number;
  modified: string;
};

export type EpubManifestItem = {
  id: string;
  href: string;
  mediaType: string;
  properties?: string;
};

export type EpubSpineItem = {
  idref: string;
  linear?: boolean;
};

export type EpubTocItem = {
  title: string;
  titleHtml?: string;
  href: string;
  children?: EpubTocItem[];
};

export type EpubPackage = {
  metadata: EpubMetadata;
  manifest: EpubManifestItem[];
  spine: EpubSpineItem[];
  pageProgressionDirection?: "ltr" | "rtl";
  toc: EpubTocItem[];
};

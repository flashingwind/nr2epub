export const DEFAULT_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export const SELECTORS = {
  workTop: {
    title: "h1.p-novel__title",
    author: ".p-novel__author a",
    summary: "#novel_ex.p-novel__summary",
    published: ".p-novel__date-published",
    episodeList: ".p-eplist__sublist",
    episodeTitle: ".p-eplist__subtitle"
  },
  episode: {
    title: "h1.p-novel__title",
    text: ".js-novel-text.p-novel__text",
    preface: ".p-novel__text.p-novel__text--preface",
    afterword: ".p-novel__text.p-novel__text--afterword"
  }
} as const;

export type EpisodeSummary = {
  title: string;
  url: string;
  episode: number | null;
};

export type NarouWorkTop = {
  url: string;
  title: string;
  author: string;
  summary: string;
  publishedText: string;
  episodes: EpisodeSummary[];
  maxEpisode?: number;
};

export type EpisodeBlock = {
  kind: "preface" | "body" | "afterword";
  html: string;
  text: string;
};

export type NarouEpisode = {
  url: string;
  episode: number | null;
  title: string | null;
  blocks: EpisodeBlock[];
};

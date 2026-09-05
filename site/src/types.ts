export type PageKey = 'home' | 'versions' | 'help';

export type Language = 'zh' | 'en';

/** Release line: standard DoL vs DoLP (DoL Plus). */
export type Edition = 'standard' | 'dolp';

export type ReleasePreset = {
  name: string;
  /** Deprecated single-language title; prefer title_en/title_cn. */
  title?: string;
  title_en?: string;
  title_cn?: string;
};

export type SiteVersion = string;

export type SiteRelease = {
  tag: string;
  /** Presets with published assets on this release; undefined = show all. */
  presets?: string[];
};

export type FaqItem = {
  answer: string;
  question: string;
};

export type HomeNotice = {
  paragraphs: string[];
  title: string;
};

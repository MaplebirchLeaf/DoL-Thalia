export type PageKey = 'home' | 'mods' | 'versions' | 'help';

export type SiteMod = {
  author?: string;
  description?: string;
  name: string;
  repository?: string;
  url: string;
};

export type ReleasePreset = {
  name: string;
};

export type SiteVersion = string;

export type FaqItem = {
  answer: string;
  question: string;
};

export type HomeNotice = {
  paragraphs: string[];
  title: string;
};

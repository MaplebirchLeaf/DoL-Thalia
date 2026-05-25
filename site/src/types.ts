export type PageKey = 'home' | 'versions' | 'help';

export type Language = 'zh' | 'en';

export type ReleasePreset = {
  name: string;
  title: string;
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

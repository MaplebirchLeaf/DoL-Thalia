import type { Language, ReleasePreset } from './types';

export interface PresetDetail {
  description: string;
  imageUrl?: string;
}

interface PresetDetailSource {
  description: Record<Language, string>;
  image?: string;
}

const PRESET_DETAILS: Record<string, PresetDetailSource> = {
  'chs-au-f': {
    description: {
      zh: '汉化基础上加入 AU female 美化资源，偏女性化角色外观。',
      en: 'Chinese-localized package with AU female visual resources for a more feminine character presentation.'
    },
    image: 'assets/AUfemale.png'
  },
  'chs-au-m': {
    description: {
      zh: '汉化基础上加入 AU male 美化资源，偏男性化角色外观。',
      en: 'Chinese-localized package with AU male visual resources for a more masculine character presentation.'
    },
    image: 'assets/AUmale.png'
  },
  'chs-au-a': {
    description: {
      zh: '汉化基础上加入 AU androgynous 美化资源，偏中性角色外观。',
      en: 'Chinese-localized package with AU androgynous visual resources for a more neutral character presentation.'
    },
    image: 'assets/AUandrogynous.png'
  },
  'chs-goose-f': {
    description: {
      zh: '汉化基础上加入 Fem Goose 美化资源，提供另一组女性化外观风格。',
      en: 'Chinese-localized package with Fem Goose visual resources, offering another feminine style.'
    },
    image: 'assets/Fem Goose.png'
  },
  'chs-goose-m': {
    description: {
      zh: '汉化基础上加入 Masc Goose 美化资源，提供另一组男性化外观风格。',
      en: 'Chinese-localized package with Masc Goose visual resources, offering another masculine style.'
    },
    image: 'assets/Masc Goose.png'
  }
};

export function presetDetail(preset: ReleasePreset, language: Language, baseUrl: string): PresetDetail {
  const detail = PRESET_DETAILS[preset.name];
  if (!detail) return { description: preset.title };
  return {
    description: detail.description[language],
    imageUrl: detail.image ? `${baseUrl}${detail.image}` : undefined
  };
}

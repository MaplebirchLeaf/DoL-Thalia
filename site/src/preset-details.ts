import type { Language, ReleasePreset } from './types';
import { presetTitle } from './presets';

export interface PresetDetail {
  description: string;
  imageUrl?: string;
}

interface PresetDetailSource {
  description: Record<Language, string>;
  image?: string;
}

const PRESET_DETAILS: Record<string, PresetDetailSource> = {
  'chs-goose-f-mysterious': { description: { zh: '女性 Goose 侧栏搭配 Mysterious 战斗素材。', en: 'Fem Goose sidebar sprites with Mysterious combat resources.' }, image: 'assets/Fem Goose.png' },
  'chs-goose-m-mysterious': { description: { zh: '男性 Goose 侧栏搭配 Mysterious 战斗素材。', en: 'Masc Goose sidebar sprites with Mysterious combat resources.' }, image: 'assets/Masc Goose.png' },
  'chs-goose-f': {
    description: {
      zh: 'Fem Goose 的女性角色侧栏与战斗美化。',
      en: 'Fem Goose visual resources for feminine sidebar and combat sprites.'
    },
    image: 'assets/Fem Goose.png'
  },
  'chs-goose-m': {
    description: {
      zh: 'Masc Goose 的男性角色侧栏与战斗美化。',
      en: 'Masc Goose visual resources for masculine sidebar and combat sprites.'
    },
    image: 'assets/Masc Goose.png'
  }
};

export function presetDetail(preset: ReleasePreset, language: Language, baseUrl: string): PresetDetail {
  const key = preset.name.startsWith('chs-') ? preset.name : `chs-${preset.name}`;
  const detail = PRESET_DETAILS[key];
  if (!detail) return { description: presetTitle(preset, language) };
  return {
    description: detail.description[language],
    imageUrl: detail.image ? `${baseUrl}${detail.image}` : undefined
  };
}

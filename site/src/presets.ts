import type { Language, ReleasePreset } from './types';

/** Language-aware preset title (title_cn/title_en with fallbacks). */
export function presetTitle(preset: ReleasePreset, language: Language): string {
  if (language === 'zh' && preset.title_cn) return preset.title_cn;
  if (language === 'en' && preset.title_en) return preset.title_en;
  return preset.title_en ?? preset.title ?? preset.name;
}

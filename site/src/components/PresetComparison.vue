<script setup lang="ts">
import { computed } from 'vue';
import { releasePresets } from '../data';
import { presetDetail } from '../preset-details';
import { presetTitle } from '../presets';
import type { Language } from '../types';

const props = defineProps<{
  activeLanguage: Language;
}>();

const baseUrl = import.meta.env.BASE_URL;
const copy = computed(() =>
  props.activeLanguage === 'zh'
    ? {
        title: '美化对比',
        intro: '不同配置对应不同的内置内容与角色外观。先在这里确认想要的整合方向，再到下方历史版本中下载对应 ZIP 或 APK。'
      }
    : {
        title: 'Visual Comparison',
        intro: 'Each variant bundles a different content and visual setup. Compare them here first, then download the matching ZIP or APK from the version list below.'
      }
);
const displayPresets = computed(() =>
  releasePresets
    .map(preset => ({
      ...preset,
      title: presetTitle(preset, props.activeLanguage),
      detail: presetDetail(preset, props.activeLanguage, baseUrl)
    }))
    .filter(preset => preset.detail.imageUrl)
);
</script>

<template>
  <section class="section comparison-section">
    <div class="section-head">
      <div>
        <h2>{{ copy.title }}</h2>
      </div>
      <p>{{ copy.intro }}</p>
    </div>

    <div class="preset-grid">
      <article v-for="preset in displayPresets" :key="preset.name" class="preset-card">
        <img v-if="preset.detail.imageUrl" class="preset-image" :src="preset.detail.imageUrl" :alt="preset.title" loading="lazy" />
        <div v-else class="preset-image placeholder">
          <span>{{ preset.title }}</span>
        </div>
        <div class="preset-body">
          <div>
            <h4>{{ preset.title }}</h4>
            <p>{{ preset.detail.description }}</p>
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

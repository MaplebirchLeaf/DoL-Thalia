<script setup lang="ts">
import { LANGUAGE_LABELS, type LocalizedSiteCopy } from '../content';
import type { Language, PageKey } from '../types';

defineProps<{
  activeLanguage: Language;
  activePage: PageKey;
  availableLanguages: Language[];
  iconUrl: string;
  localizedText: LocalizedSiteCopy;
}>();

defineEmits<{
  changeLanguage: [language: Language];
  changePage: [page: PageKey];
}>();
</script>

<template>
  <header class="site-header">
    <a class="brand" href="#" @click.prevent="$emit('changePage', 'home')">
      <img :src="iconUrl" alt="" />
      <span>DoL-Thalia</span>
    </a>
    <div class="header-actions">
      <nav class="nav">
        <button v-for="navItem in localizedText.navItems" :key="navItem.key" :class="{ active: activePage === navItem.key }" type="button" @click="$emit('changePage', navItem.key)">
          {{ navItem.label }}
        </button>
      </nav>
      <div class="language-switch" aria-label="Language">
        <button
          v-for="languageOption in availableLanguages"
          :key="languageOption"
          :class="{ active: activeLanguage === languageOption }"
          type="button"
          @click="$emit('changeLanguage', languageOption)">
          {{ LANGUAGE_LABELS[languageOption] }}
        </button>
      </div>
    </div>
  </header>
</template>

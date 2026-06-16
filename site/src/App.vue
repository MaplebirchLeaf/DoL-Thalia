<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import BackTopButton from './components/BackTopButton.vue';
import HelpPage from './components/HelpPage.vue';
import HomePage from './components/HomePage.vue';
import PresetComparison from './components/PresetComparison.vue';
import SiteFooter from './components/SiteFooter.vue';
import SiteHeader from './components/SiteHeader.vue';
import VersionsPage from './components/VersionsPage.vue';
import { LOCALIZED_SITE_COPY } from './content';
import type { Language, PageKey } from './types';

const activePage = ref<PageKey>('home');
const activeLanguage = ref<Language>(detectInitialLanguage());
const isBackTopVisible = ref(false);

const baseUrl = import.meta.env.BASE_URL;
const playUrl = `${baseUrl}play/index.html`;
const iconUrl = `${baseUrl}assets/icon.png`;
const availableLanguages: Language[] = ['zh', 'en'];
const localizedText = computed(() => LOCALIZED_SITE_COPY[activeLanguage.value]);

function detectInitialLanguage(): Language {
  if (typeof navigator === 'undefined') return 'zh';
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function switchPage(targetPage: PageKey) {
  activePage.value = targetPage;
}

function switchLanguage(targetLanguage: Language) {
  activeLanguage.value = targetLanguage;
  document.documentElement.lang = targetLanguage === 'zh' ? 'zh-CN' : 'en';
}

function updateBackTop() {
  isBackTopVisible.value = window.scrollY > 360;
}

function backToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

onMounted(() => {
  switchLanguage(activeLanguage.value);
  updateBackTop();
  window.addEventListener('scroll', updateBackTop, { passive: true });
});

onUnmounted(() => {
  window.removeEventListener('scroll', updateBackTop);
});
</script>

<template>
  <SiteHeader
    :active-language="activeLanguage"
    :active-page="activePage"
    :available-languages="availableLanguages"
    :icon-url="iconUrl"
    :localized-text="localizedText"
    @change-language="switchLanguage"
    @change-page="switchPage" />

  <main>
    <HomePage v-if="activePage === 'home'" :localized-text="localizedText" :play-url="playUrl" @show-versions="switchPage('versions')" />
    <template v-else-if="activePage === 'versions'">
      <VersionsPage :localized-text="localizedText" />
      <PresetComparison :active-language="activeLanguage" />
    </template>
    <HelpPage v-else-if="activePage === 'help'" :localized-text="localizedText" />
  </main>

  <SiteFooter :footer="localizedText.footer" />
  <BackTopButton :label="localizedText.backTop" :visible="isBackTopVisible" @back-top="backToTop" />
</template>

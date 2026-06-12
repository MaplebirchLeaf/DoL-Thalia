<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { LANGUAGE_LABELS, LOCALIZED_SITE_COPY } from './content';
import { releasePresets, releaseVersions } from './data';
import { releaseAssetUrl, releaseTag } from './releases';
import type { Language, PageKey, SiteVersion } from './types';

const activePage = ref<PageKey>('home');
const activeLanguage = ref<Language>(detectInitialLanguage());
const expandedVersion = ref<SiteVersion | undefined>();
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

function toggleVersion(version: SiteVersion) {
  expandedVersion.value = expandedVersion.value === version ? undefined : version;
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
  <header class="site-header">
    <a class="brand" href="#" @click.prevent="switchPage('home')">
      <img :src="iconUrl" alt="" />
      <span>DoL-Thalia</span>
    </a>
    <div class="header-actions">
      <nav class="nav">
        <button v-for="navItem in localizedText.navItems" :key="navItem.key" :class="{ active: activePage === navItem.key }" type="button" @click="switchPage(navItem.key)">
          {{ navItem.label }}
        </button>
      </nav>
      <div class="language-switch" aria-label="Language">
        <button v-for="languageOption in availableLanguages" :key="languageOption" :class="{ active: activeLanguage === languageOption }" type="button" @click="switchLanguage(languageOption)">
          {{ LANGUAGE_LABELS[languageOption] }}
        </button>
      </div>
    </div>
  </header>

  <main>
    <section v-if="activePage === 'home'" class="hero">
      <div class="hero-copy">
        <h1>{{ localizedText.heroTitle }}</h1>
        <div class="home-statement">
          <p v-html="localizedText.heroStatement"></p>
        </div>

        <div class="home-actions">
          <button class="primary" type="button" @click="switchPage('versions')">{{ localizedText.showVersions }}</button>
          <a class="secondary" :href="playUrl">{{ localizedText.onlinePlay }}</a>
        </div>
      </div>

      <div v-for="notice in localizedText.homeNotices" :key="notice.title" class="home-notice">
        <strong>{{ notice.title }}</strong>
        <p v-for="paragraph in notice.paragraphs" :key="paragraph" v-html="paragraph"></p>
      </div>
    </section>

    <section v-else-if="activePage === 'versions'" class="section">
      <div class="section-head">
        <div>
          <h2>{{ localizedText.navItems.find(navItem => navItem.key === 'versions')?.label }}</h2>
        </div>
      </div>

      <div v-if="releaseVersions.length" class="version-list">
        <article v-for="version in releaseVersions" :key="version" :class="{ selected: expandedVersion === version }" class="version-row">
          <div class="version-summary" @click="toggleVersion(version)">
            <div>
              <h3>{{ releaseTag(version) }}</h3>
              <p>{{ localizedText.selectVersion }}</p>
            </div>
            <span>{{ expandedVersion === version ? localizedText.collapse : localizedText.expand }}</span>
          </div>
          <Transition name="drawer">
            <div v-if="expandedVersion === version" class="version-detail-shell">
              <div class="download-table-lite">
                <div class="download-row head">
                  <span>{{ localizedText.versionChoice }}</span>
                  <span>ZIP</span>
                  <span>APK</span>
                </div>
                <div v-for="preset in releasePresets" :key="preset.name" class="download-row">
                  <span class="download-title">{{ preset.title }}</span>
                  <a :href="releaseAssetUrl(version, preset.name, 'zip')">{{ localizedText.download }}</a>
                  <a :href="releaseAssetUrl(version, preset.name, 'apk')">{{ localizedText.download }}</a>
                </div>
              </div>
            </div>
          </Transition>
        </article>
      </div>
      <p v-else class="empty">{{ localizedText.noVersions }}</p>
    </section>

    <section v-else-if="activePage === 'help'" class="section">
      <div class="section-head">
        <div>
          <h2>{{ localizedText.navItems.find(navItem => navItem.key === 'help')?.label }}</h2>
        </div>
        <p>{{ localizedText.faqIntro }}</p>
      </div>

      <div class="faq-list">
        <article v-for="faqItem in localizedText.faqItems" :key="faqItem.question" class="faq-item">
          <h3>{{ faqItem.question }}</h3>
          <p>{{ faqItem.answer }}</p>
        </article>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <span>(c) 2026</span>
    <span>{{ localizedText.footer }}</span>
  </footer>

  <button v-if="isBackTopVisible" class="back-top" type="button" :aria-label="localizedText.backTop" @click="backToTop">Top</button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { faqItems, homeNotices, visibleNavItems } from './content';
import { mods, release, versions } from './data';
import { releaseTag, releaseAssetUrl } from './releases';
import type { PageKey, SiteVersion } from './types';

const page = ref<PageKey>('home');
const modsUnlocked = ref(false);
const selectedVersion = ref<SiteVersion | undefined>();
const selectedMods = ref<Set<string>>(new Set());
const showBackTop = ref(false);

const baseUrl = import.meta.env.BASE_URL;
const playUrl = `${baseUrl}play/latest/index.html`;
const iconUrl = `${baseUrl}assets/icon.png`;

const navItems = computed(() => {
  const items: Array<{ key: PageKey; label: string }> = [...visibleNavItems];
  if (modsUnlocked.value) items.splice(1, 0, { key: 'mods', label: '模组' });
  return items;
});

const selectedModList = computed(() => mods.filter(mod => selectedMods.value.has(mod.url)));

function setPage(nextPage: PageKey) {
  if (nextPage === 'mods' && !modsUnlocked.value) return;
  page.value = nextPage;
}

function unlockMods() {
  modsUnlocked.value = true;
  page.value = 'mods';
}

function toggleMod(url: string) {
  const next = new Set(selectedMods.value);
  if (next.has(url)) {
    next.delete(url);
  } else {
    next.add(url);
  }
  selectedMods.value = next;
}

function toggleVersion(version: SiteVersion) {
  selectedVersion.value = selectedVersion.value === version ? undefined : version;
}

function updateBackTop() {
  showBackTop.value = window.scrollY > 360;
}

function backToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleKeydown(event: KeyboardEvent) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'm') {
    event.preventDefault();
    unlockMods();
  }
}

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mods') === '1' || window.location.hash === '#mods') unlockMods();
  updateBackTop();
  window.addEventListener('scroll', updateBackTop, { passive: true });
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('scroll', updateBackTop);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <header class="site-header">
    <a class="brand" href="#" @click.prevent="setPage('home')">
      <img :src="iconUrl" alt="" />
      <span>DoL-Thalia</span>
    </a>
    <nav class="nav">
      <button v-for="item in navItems" :key="item.key" :class="{ active: page === item.key }" type="button" @click="setPage(item.key)">
        {{ item.label }}
      </button>
    </nav>
  </header>

  <main>
    <section v-if="page === 'home'" class="hero">
      <div class="hero-copy">
        <h1>DoL-Thalia 整合包发布站</h1>
        <div class="home-statement">
          <p>本站是<a href="https://github.com/MaplebirchLeaf/DoL-Thalia">DoL-Thalia</a>的第三方发布页，并非 DoL 或汉化组官方发布网站。</p>
        </div>

        <div class="home-actions">
          <button class="primary" type="button" @click="setPage('versions')">进入版本选择</button>
          <a class="secondary" :href="playUrl">在线游玩</a>
        </div>
      </div>

      <div v-for="notice in homeNotices" :key="notice.title" class="home-notice">
        <strong>{{ notice.title }}</strong>
        <p v-for="paragraph in notice.paragraphs" :key="paragraph" v-html="paragraph"></p>
      </div>
    </section>

    <section v-else-if="page === 'mods'" class="section">
      <div class="section-head">
        <div>
          <h2>模组</h2>
        </div>
      </div>

      <div class="builder-panel builder-top">
        <div>
          <h3>自助整合下载</h3>
          <p>选择一个基础版本，再勾选模组生成自定义 ZIP。</p>
        </div>
        <div class="builder-controls">
          <label>
            基础版本
            <select>
              <option v-for="version in versions" :key="version">{{ releaseTag(version) }}</option>
              <option v-if="!versions.length">待发布</option>
            </select>
          </label>
          <button class="primary" type="button" disabled>生成 ZIP</button>
        </div>
      </div>

      <div v-if="mods.length" class="mod-grid">
        <article v-for="mod in mods" :key="mod.url" class="mod-card">
          <div class="mod-card-head">
            <div>
              <h3>{{ mod.name }}</h3>
              <p>{{ mod.description || mod.name }}</p>
            </div>
            <div class="mod-actions">
              <a v-if="mod.repository" :href="mod.repository">仓库</a>
              <a :href="mod.url">文件</a>
            </div>
          </div>
          <div class="mod-meta">
            <span v-if="mod.author">作者：{{ mod.author }}</span>
          </div>
          <label class="check-row">
            <input :checked="selectedMods.has(mod.url)" type="checkbox" @change="toggleMod(mod.url)" />
            <span>加入整合</span>
          </label>
        </article>
      </div>

      <div class="builder-panel">
        <h3>当前选择</h3>
        <p>已选择 {{ selectedModList.length }} 个模组。ZIP 生成逻辑接入后，这里会打包基础 ZIP 与所选模组。</p>
      </div>
    </section>

    <section v-else-if="page === 'versions'" class="section">
      <div class="section-head">
        <div>
          <h2>历史版本</h2>
        </div>
      </div>

      <div v-if="versions.length" class="version-list">
        <article v-for="version in versions" :key="version" :class="{ selected: selectedVersion === version }" class="version-row">
          <div class="version-summary" @click="toggleVersion(version)">
            <div>
              <h3>{{ releaseTag(version) }}</h3>
              <p>选择此版本</p>
            </div>
            <span>{{ selectedVersion === version ? '收起' : '展开' }}</span>
          </div>
          <Transition name="drawer">
            <div v-if="selectedVersion === version" class="version-detail-shell">
              <div class="download-table-lite">
                <div class="download-row head">
                  <span>版本选择</span>
                  <span>ZIP</span>
                  <span>APK</span>
                </div>
                <div v-for="preset in release" :key="preset.name" class="download-row">
                  <span class="download-title">{{ preset.title }}</span>
                  <a :href="releaseAssetUrl(version, preset.name, 'zip')">GitHub 下载</a>
                  <a :href="releaseAssetUrl(version, preset.name, 'apk')">GitHub 下载</a>
                </div>
              </div>
            </div>
          </Transition>
        </article>
      </div>
    </section>

    <section v-else-if="page === 'help'" class="section">
      <div class="section-head">
        <div>
          <h2>疑难解答</h2>
        </div>
        <p>这里收集下载、存档、模组加载和移动端常见问题。</p>
      </div>

      <div class="faq-list">
        <article v-for="item in faqItems" :key="item.question" class="faq-item">
          <h3>{{ item.question }}</h3>
          <p>{{ item.answer }}</p>
        </article>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <span>© 2026</span>
    <span>Powered by Vue & Vite</span>
  </footer>

  <button v-if="showBackTop" class="back-top" type="button" aria-label="返回顶部" @click="backToTop">↑</button>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { LocalizedSiteCopy } from '../content';
import { releasePresets, releaseVersions } from '../data';
import { presetTitle } from '../presets';
import { releaseAssetUrl, releaseEdition, releaseTag } from '../releases';
import type { Language } from '../types';

const props = defineProps<{
  localizedText: LocalizedSiteCopy;
  activeLanguage: Language;
}>();

const expandedTag = ref<string | undefined>();

const groups = computed(() => {
  const versions = releaseVersions.map(version => ({
    tag: version.tag,
    presets: releasePresets.filter(preset => !version.presets || version.presets.includes(preset.name)).map(preset => ({ name: preset.name, title: presetTitle(preset, props.activeLanguage) }))
  }));

  return (['standard', 'dolp'] as const).map(edition => ({
    edition,
    label: edition === 'dolp' ? props.localizedText.editionDolp : props.localizedText.editionStandard,
    versions: versions.filter(version => releaseEdition(version.tag) === edition)
  }));
});

function toggleVersion(tag: string) {
  expandedTag.value = expandedTag.value === tag ? undefined : tag;
}
</script>

<template>
  <section class="section">
    <div class="section-head">
      <div>
        <h2>{{ localizedText.navItems.find(navItem => navItem.key === 'versions')?.label }}</h2>
      </div>
    </div>

    <article v-for="group in groups" :id="'edition-' + group.edition" :key="group.edition" class="edition-group">
      <h3 class="edition-heading">{{ group.label }}</h3>

      <div v-if="group.versions.length" class="version-list">
        <article v-for="version in group.versions" :key="version.tag" :class="{ selected: expandedTag === version.tag }" class="version-row">
          <button class="version-summary" type="button" :aria-controls="`version-detail-${version.tag}`" :aria-expanded="expandedTag === version.tag" @click="toggleVersion(version.tag)">
            <span class="version-summary-text">
              <span class="version-tag">{{ releaseTag(version.tag) }}</span>
              <span class="version-hint">{{ localizedText.versionListHint }}</span>
            </span>
            <span class="version-toggle">
              {{ expandedTag === version.tag ? localizedText.collapse : localizedText.expand }}
              <svg class="version-chevron" viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 7.5 5 5 5-5" />
              </svg>
            </span>
          </button>
          <Transition name="drawer">
            <div v-if="expandedTag === version.tag" :id="`version-detail-${version.tag}`" class="version-detail-shell">
              <div v-if="version.presets.length" class="download-table-lite">
                <div class="download-row head">
                  <span>{{ localizedText.versionChoice }}</span>
                  <span>ZIP</span>
                  <span>APK</span>
                </div>
                <div v-for="preset in version.presets" :key="preset.name" class="download-row">
                  <span class="download-title">{{ preset.title }}</span>
                  <a :href="releaseAssetUrl(version.tag, preset.name, 'zip')" :aria-label="`${preset.title} — ${localizedText.downloadZip}`">
                    {{ localizedText.download }}
                  </a>
                  <a :href="releaseAssetUrl(version.tag, preset.name, 'apk')" :aria-label="`${preset.title} — ${localizedText.downloadApk}`">
                    {{ localizedText.download }}
                  </a>
                </div>
              </div>
            </div>
          </Transition>
        </article>
      </div>
      <p v-else class="empty">{{ localizedText.noVersions }}</p>
    </article>
  </section>
</template>

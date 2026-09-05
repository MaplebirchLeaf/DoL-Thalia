<script setup lang="ts">
import { computed } from 'vue';
import type { LocalizedSiteCopy } from '../content';
import { releasePresets, releaseVersions } from '../data';
import { presetTitle } from '../presets';
import { releaseAssetUrl, releaseEdition, releaseTag } from '../releases';
import type { Language, ReleasePreset, SiteRelease } from '../types';
import { ref } from 'vue';

const props = defineProps<{
  localizedText: LocalizedSiteCopy;
  activeLanguage: Language;
}>();

const expandedTag = ref<string | undefined>();

const groups = computed(() =>
  (['standard', 'dolp'] as const).map(edition => ({
    edition,
    label: edition === 'dolp' ? props.localizedText.editionDolp : props.localizedText.editionStandard,
    versions: releaseVersions.filter(version => releaseEdition(version.tag) === edition)
  }))
);

function presetsFor(version: SiteRelease): ReleasePreset[] {
  if (!version.presets) return releasePresets;
  return releasePresets.filter(preset => version.presets?.includes(preset.name));
}

function toggleVersion(version: SiteRelease) {
  expandedTag.value = expandedTag.value === version.tag ? undefined : version.tag;
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
          <div class="version-summary" @click="toggleVersion(version)">
            <div>
              <h4>{{ releaseTag(version.tag) }}</h4>
              <p>{{ localizedText.selectVersion }}</p>
            </div>
            <span>{{ expandedTag === version.tag ? localizedText.collapse : localizedText.expand }}</span>
          </div>
          <Transition name="drawer">
            <div v-if="expandedTag === version.tag" class="version-detail-shell">
              <div v-if="presetsFor(version).length" class="download-table-lite">
                <div class="download-row head">
                  <span>{{ localizedText.versionChoice }}</span>
                  <span>ZIP</span>
                  <span>APK</span>
                </div>
                <div v-for="preset in presetsFor(version)" :key="preset.name" class="download-row">
                  <span class="download-title">{{ presetTitle(preset, activeLanguage) }}</span>
                  <a :href="releaseAssetUrl(version.tag, preset.name, 'zip')">{{ localizedText.download }}</a>
                  <a :href="releaseAssetUrl(version.tag, preset.name, 'apk')">{{ localizedText.download }}</a>
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

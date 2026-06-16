<script setup lang="ts">
import { ref } from 'vue';
import type { LocalizedSiteCopy } from '../content';
import { releasePresets, releaseVersions } from '../data';
import { releaseAssetUrl, releaseTag } from '../releases';
import type { SiteVersion } from '../types';

defineProps<{
  localizedText: LocalizedSiteCopy;
}>();

const expandedVersion = ref<SiteVersion | undefined>();

function toggleVersion(version: SiteVersion) {
  expandedVersion.value = expandedVersion.value === version ? undefined : version;
}
</script>

<template>
  <section class="section">
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
</template>

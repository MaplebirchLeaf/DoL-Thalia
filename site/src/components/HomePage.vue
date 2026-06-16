<script setup lang="ts">
import type { LocalizedSiteCopy } from '../content';

defineProps<{
  localizedText: LocalizedSiteCopy;
  playUrl: string;
}>();

defineEmits<{
  showVersions: [];
}>();
</script>

<template>
  <section class="hero">
    <div class="hero-copy">
      <h1>{{ localizedText.heroTitle }}</h1>
      <div class="home-statement">
        <p v-html="localizedText.heroStatement"></p>
      </div>

      <div class="home-actions">
        <button class="primary" type="button" @click="$emit('showVersions')">{{ localizedText.showVersions }}</button>
        <a class="secondary" :href="playUrl">{{ localizedText.onlinePlay }}</a>
      </div>
    </div>

    <div v-for="notice in localizedText.homeNotices" :key="notice.title" class="home-notice">
      <strong>{{ notice.title }}</strong>
      <p v-for="paragraph in notice.paragraphs" :key="paragraph" v-html="paragraph"></p>
    </div>
  </section>
</template>

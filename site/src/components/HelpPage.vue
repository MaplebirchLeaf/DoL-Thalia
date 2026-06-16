<script setup lang="ts">
import type { LocalizedSiteCopy } from '../content';

defineProps<{
  localizedText: LocalizedSiteCopy;
}>();
</script>

<template>
  <section class="section">
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
</template>

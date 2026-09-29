<script setup lang="ts">
defineProps<{
  footer: string;
}>();
// Derived so the notice does not silently go stale after a year rolls over.
const copyrightYear = new Date().getFullYear();
</script>

<template>
  <footer class="site-footer">
    <span>&copy; {{ copyrightYear }}</span>
    <span>{{ footer }}</span>
  </footer>
</template>

<script setup lang="ts">
defineProps<{
  footer: string;
}>();
</script>

<template>
  <footer class="site-footer">
    <span>(c) 2026</span>
    <span>{{ footer }}</span>
  </footer>
</template>

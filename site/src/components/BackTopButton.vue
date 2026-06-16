<script setup lang="ts">
defineProps<{
  label: string;
  visible: boolean;
}>();

defineEmits<{
  backTop: [];
}>();
</script>

<template>
  <button v-if="visible" class="back-top" type="button" :aria-label="label" @click="$emit('backTop')">Top</button>
</template>

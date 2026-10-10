<script setup>
import { computed } from 'vue';
const p = defineProps({ label: String, value: [String, Number], hint: String, tone: String, focal: Boolean });
const classes = computed(() => ['stat-tile', p.focal ? 'is-focal' : '', p.tone ? 'tone-' + p.tone : '']);
</script>
<template><article :class="classes"><div class="stat-tile__body"><div class="stat-tile__head"><span class="stat-tile__label">{{ label }}</span></div><div class="stat-tile__value display">{{ value ?? '—' }}</div><p v-if="hint" class="stat-tile__hint">{{ hint }}</p></div></article></template>

<script setup>
import { reactive, watch, computed } from 'vue';
const p = defineProps({ schema: Object, disabled: Boolean, saving: Boolean });
const emit = defineEmits(['submit', 'delete']);
const values = reactive({});
const fields = computed(() => p.schema?.fields || []);
watch(fields, next => { for (const f of next) values[f.name] = f.type === 'checkbox' ? Boolean(f.value) : f.value ?? ''; }, { immediate: true });
function submit() { emit('submit', { ...values }); }
</script>
<template><form @submit.prevent="submit" class="record-form">
  <div v-if="schema?.errors?.length" class="notice bad">{{ schema.errors.join(' · ') }}</div>
  <div class="form-grid">
    <div v-for="field in fields" :key="field.name" class="field" :class="{ 'field--wide': field.type === 'textarea' }">
      <label :for="'f-' + field.name">{{ field.label }}<span v-if="field.required"> *</span></label>
      <select v-if="field.type === 'select'" :id="'f-' + field.name" v-model="values[field.name]" :disabled="disabled" :required="field.required">
        <option v-for="[value,label] in field.choices" :key="String(value)" :value="value">{{ label }}</option>
      </select>
      <textarea v-else-if="field.type === 'textarea'" :id="'f-' + field.name" v-model="values[field.name]" rows="4" :disabled="disabled" :required="field.required"/>
      <input v-else-if="field.type === 'checkbox'" :id="'f-' + field.name" type="checkbox" v-model="values[field.name]" :disabled="disabled"/>
      <input v-else :id="'f-' + field.name" :type="field.type" :step="field.type === 'number' ? 'any' : undefined" v-model="values[field.name]" :disabled="disabled" :required="field.required"/>
      <small v-if="field.help" class="muted">{{ field.help }}</small>
      <small v-for="e in field.errors" :key="e" class="text-bad">{{ e }}</small>
    </div>
  </div>
  <div v-if="!disabled" class="form-actions">
    <button class="btn btn-primary btn-lg" type="submit" :disabled="saving">{{ saving ? 'Guardando…' : 'Guardar' }}</button>
    <button v-if="$attrs.allowDelete" class="btn btn-ghost" type="button" @click="emit('delete')">Eliminar</button>
  </div>
</form></template>

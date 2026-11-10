<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { state, can, refreshSession } from '../../../lib/state';
import { worksApi } from '../services/worksApi';
const obras = ref([]), error = ref(''), success = ref(''), busy = ref(false), editingId = ref(null);
const canCreate = computed(() => can('obras.crear'));
const canEdit = computed(() => can('obras.editar'));
const emptyForm = () => ({ id: '', nombre: '', razon_social: '', rut: '', direccion: '', mandante: '', servicio: '', adm_contrato: '', asesor_pdr: '', asesor_mutual: '', inicio_contrato: '', termino_contrato: '', monto_contractual_uf: 0, anticipo_uf: 0, activa: true });
const form = ref(emptyForm());
async function load() {
  error.value = '';
  if (!state.activeCompanyId) { obras.value = []; return; }
  try { obras.value = (await worksApi.list()).results || []; }
  catch (e) { error.value = e.message; }
}
function startEdit(o) {
  editingId.value = o.id;
  form.value = { id: o.id, nombre: o.nombre || '', razon_social: o.razon_social || '', rut: o.rut || '', direccion: o.direccion || '', mandante: o.mandante || '', servicio: o.servicio || '', adm_contrato: o.adm_contrato || '', asesor_pdr: o.asesor_pdr || '', asesor_mutual: o.asesor_mutual || '', inicio_contrato: o.inicio_contrato || '', termino_contrato: o.termino_contrato || '', monto_contractual_uf: Number(o.monto_contractual_uf || 0), anticipo_uf: Number(o.anticipo_uf || 0), activa: Boolean(o.activa) };
}
function cancelEdit() { editingId.value = null; form.value = emptyForm(); }
async function save() {
  busy.value = true; error.value = ''; success.value = '';
  try {
    const payload = { ...form.value, monto_contractual_uf: Number(form.value.monto_contractual_uf || 0), anticipo_uf: Number(form.value.anticipo_uf || 0) };
    if (!payload.termino_contrato) payload.termino_contrato = null;
    if (editingId.value) {
      if (!canEdit.value) return;
      const { id, ...patchData } = payload;
      await worksApi.update(editingId.value, patchData);
      success.value = 'Obra actualizada.';
    } else {
      if (!canCreate.value) return;
      await worksApi.create(payload);
      success.value = 'Obra creada.';
    }
    cancelEdit();
    await Promise.all([load(), refreshSession()]);
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
async function toggleActive(obra) {
  if (!canEdit.value) return;
  busy.value = true; error.value = ''; success.value = '';
  try {
    await worksApi.update(obra.id, { activa: !obra.activa });
    success.value = `Obra ${obra.activa ? 'desactivada' : 'activada'}.`;
    await Promise.all([load(), refreshSession()]);
  } catch (e) { error.value = e.message; } finally { busy.value = false; }
}
onMounted(load);
watch(() => state.activeCompanyId, () => { obras.value=[]; cancelEdit(); if(state.activeCompanyId) load(); });
</script>
<template>
  <section class="stack" style="max-width:1150px">
    <header><h1>Administración de obras</h1><p>Creación, edición, responsables y estado operacional de obras.</p></header>
    <p v-if="error" role="alert" style="color:#b91c1c">{{ error }}</p>
    <p v-if="success" role="status" style="color:#166534">{{ success }}</p>
    <div class="card stack-sm" style="padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0">Obras registradas ({{ obras.length }})</h2>
        <button class="btn btn-ghost btn-sm" type="button" @click="load">Actualizar</button>
      </div>
      <p v-if="!obras.length">No hay obras vinculadas a esta empresa.</p>
      <div v-else style="overflow-x:auto">
        <table style="width:100%;text-align:left;border-collapse:collapse">
          <thead><tr><th>Obra</th><th>Mandante / Servicio</th><th>Responsables</th><th>Contrato</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            <tr v-for="o in obras" :key="o.id">
              <td><RouterLink :to="{ name: 'obra', params: { obraId: o.id } }"><strong>{{ o.nombre }}</strong></RouterLink><br><small>ID: <code>{{ o.id }}</code> · RUT: {{ o.rut }}</small></td>
              <td>{{ o.mandante || o.razon_social }}<br><small>{{ o.servicio }}</small></td>
              <td><small>Adm: {{ o.adm_contrato || '—' }}<br>PDR: {{ o.asesor_pdr || '—' }}</small></td>
              <td><small>{{ o.inicio_contrato || '—' }} → {{ o.termino_contrato || 'En curso' }}<br>{{ o.monto_contractual_uf }} UF</small></td>
              <td>{{ o.activa ? 'Activa' : 'Inactiva' }}</td>
              <td style="display:flex;gap:6px;flex-wrap:wrap">
                <button v-if="canEdit" class="btn btn-ghost btn-sm" type="button" @click="startEdit(o)">Editar</button>
                <button v-if="canEdit" class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="toggleActive(o)">{{ o.activa ? 'Desactivar' : 'Activar' }}</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <form v-if="canCreate || (editingId && canEdit)" class="card stack-sm" style="padding:20px" @submit.prevent="save">
      <h2>{{ editingId ? `Editar obra (${editingId})` : 'Nueva obra' }}</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px">
        <label>ID de obra <input v-model.trim="form.id" required maxlength="64" :disabled="Boolean(editingId)" /></label>
        <label>Nombre <input v-model.trim="form.nombre" required /></label>
        <label>Razón social <input v-model.trim="form.razon_social" required /></label>
        <label>RUT <input v-model.trim="form.rut" required /></label>
        <label>Mandante <input v-model.trim="form.mandante" /></label>
        <label>Dirección <input v-model.trim="form.direccion" /></label>
        <label>Servicio <input v-model.trim="form.servicio" required /></label>
        <label>Administrador de contrato <input v-model.trim="form.adm_contrato" /></label>
        <label>Experto en Prevención (PDR) <input v-model.trim="form.asesor_pdr" /></label>
        <label>Asesor Mutual <input v-model.trim="form.asesor_mutual" /></label>
        <label>Inicio de contrato <input v-model="form.inicio_contrato" type="date" required /></label>
        <label>Término de contrato <input v-model="form.termino_contrato" type="date" /></label>
        <label>Monto contractual UF <input v-model.number="form.monto_contractual_uf" type="number" step="any" required /></label>
        <label>Anticipo UF <input v-model.number="form.anticipo_uf" type="number" step="any" required /></label>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn" type="submit" :disabled="busy">{{ busy ? 'Guardando…' : (editingId ? 'Guardar cambios' : 'Crear obra') }}</button>
        <button v-if="editingId" class="btn btn-ghost" type="button" @click="cancelEdit">Cancelar edición</button>
      </div>
    </form>
  </section>
</template>

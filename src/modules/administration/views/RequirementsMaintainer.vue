<script setup>
import { computed, ref, watch } from 'vue';
import { documentsApi } from '../services/documentsApi';
import { workforceApi } from '../services/workforceApi';
import { worksApi } from '../services/worksApi';

const props = defineProps({ empresaId: String, canCreate: Boolean, canEdit: Boolean });
const types = ref([]), cargos = ref([]), obras = ref([]), rules = ref([]);
const loading = ref(false), saving = ref(false), error = ref(''), message = ref('');
const empty = () => ({tipo_documento_id:'', cargo_id:'', obra_id:'', obligatorio:true, activo:true});
const form = ref(empty());
let requestId = 0;
const available = computed(() => types.value.filter(t => t.activo && t.categoria === 'trabajador'));
const typeName = id => types.value.find(t => t.id === id)?.nombre || 'Tipo no disponible';
const cargoName = id => id ? (cargos.value.find(c => String(c.id) === String(id))?.nombre || id) : 'Todos los cargos';
const obraName = id => id ? (obras.value.find(o => String(o.id) === String(id))?.nombre || id) : 'Todas las obras';
const ordered = computed(() => rules.value.filter(r => types.value.some(t => t.id === r.tipo_documento_id && t.categoria === 'trabajador')));
async function load() {
  const company = props.empresaId, seq = ++requestId;
  types.value=[]; cargos.value=[]; obras.value=[]; rules.value=[];
  error.value=''; message.value=''; form.value=empty();
  if (!company) return;
  loading.value=true;
  const results = await Promise.allSettled([
    documentsApi.types(company), documentsApi.requirements(company),
    workforceApi.cargos(company), worksApi.list(),
  ]);
  if (seq !== requestId || company !== props.empresaId) return;
  if (results.some(r => r.status === 'rejected')) error.value = results.filter(r=>r.status==='rejected').map(r=>r.reason?.message||'Error de carga').join(' · ');
  if (results[0].status === 'fulfilled') types.value=results[0].value;
  if (results[1].status === 'fulfilled') rules.value=results[1].value;
  if (results[2].status === 'fulfilled') cargos.value=results[2].value;
  if (results[3].status === 'fulfilled') obras.value=results[3].value.results || [];
  loading.value=false;
}
watch(() => props.empresaId, load, {immediate:true});
async function create() {
  if (!props.canCreate || saving.value || !props.empresaId) return;
  const company=props.empresaId;
  saving.value=true; error.value=''; message.value='';
  try {
    if (rules.value.some(r => r.activo && r.tipo_documento_id === form.value.tipo_documento_id && String(r.cargo_id||'') === form.value.cargo_id && String(r.obra_id||'') === form.value.obra_id)) {
      throw new Error('Ya existe una regla activa para este tipo, cargo y obra.');
    }
    await documentsApi.createRequirement(company, {
      tipo_documento_id:form.value.tipo_documento_id,
      cargo_id:form.value.cargo_id || null,
      obra_id:form.value.obra_id || null,
      obligatorio:form.value.obligatorio,
      activo:true,
    });
    if (company !== props.empresaId) return;
    await load(); message.value='Requisito creado.';
  } catch(e) { if (company===props.empresaId) error.value=e.message; }
  finally { saving.value=false; }
}
async function update(rule, changes) {
  if (!props.canEdit || saving.value) return;
  const company=props.empresaId;
  saving.value=true; error.value=''; message.value='';
  try {
    await documentsApi.updateRequirement(company, rule.id, changes);
    if (company !== props.empresaId) return;
    await load(); message.value='Requisito actualizado.';
  } catch(e) { if (company===props.empresaId) error.value=e.message; }
  finally { saving.value=false; }
}
</script>

<template>
  <div class="stack" style="min-width:0">
    <details v-if="canCreate" class="create-drawer">
      <summary class="create-drawer__trigger">Crear nuevo requisito documental</summary>
      <form @submit.prevent="create">
        <div class="rules-grid">
          <label>Tipo documental
            <select v-model="form.tipo_documento_id" required><option value="">Selecciona un tipo</option><option v-for="t in available" :key="t.id" :value="t.id">{{ t.nombre }}</option></select>
          </label>
          <label>Cargo
            <select v-model="form.cargo_id"><option value="">Todos los cargos</option><option v-for="c in cargos" :key="c.id" :value="String(c.id)">{{ c.nombre }}</option></select>
          </label>
          <label>Obra
            <select v-model="form.obra_id"><option value="">Todas las obras</option><option v-for="o in obras" :key="o.id" :value="String(o.id)">{{ o.nombre }}</option></select>
          </label>
          <label class="rule-checkbox"><input v-model="form.obligatorio" type="checkbox" /> Obligatorio</label>
        </div>
        <p class="muted">Esta pantalla configura requisitos para trabajadores; los documentos de empresa y equipos tienen sus propios flujos.</p>
        <button class="btn" type="submit" :disabled="saving || !available.length">{{ saving ? 'Guardando…' : 'Crear requisito' }}</button>
      </form>
    </details>

    <section class="card rules-card">
      <h2>Requisitos documentales por cargo y obra</h2>
      <p class="muted">Define qué evidencias se solicitan a los trabajadores. Una regla sin cargo aplica a todos los cargos; sin obra, a todas las obras. Las reglas se acumulan.</p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-if="message" role="status" class="success">{{ message }}</p>
      <p v-if="loading">Cargando requisitos…</p>
      <template v-else>
        <p v-if="!ordered.length">Aún no hay requisitos configurados para trabajadores.</p>
        <div v-else class="rules-scroll"><table class="rules-table">
          <thead><tr><th>Documento</th><th>Cargo</th><th>Obra</th><th>Exigencia</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody><tr v-for="r in ordered" :key="r.id">
            <td>{{ typeName(r.tipo_documento_id) }}</td><td>{{ cargoName(r.cargo_id) }}</td><td>{{ obraName(r.obra_id) }}</td>
            <td>{{ r.obligatorio ? 'Obligatorio' : 'Opcional' }}</td><td>{{ r.activo ? 'Activo' : 'Inactivo' }}</td>
            <td><div v-if="canEdit" class="rule-actions">
              <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="update(r,{obligatorio:!r.obligatorio})">{{ r.obligatorio ? 'Hacer opcional' : 'Hacer obligatorio' }}</button>
              <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="update(r,{activo:!r.activo})">{{ r.activo ? 'Desactivar' : 'Activar' }}</button>
            </div></td>
          </tr></tbody>
        </table></div>
      </template>
      <button type="button" class="btn btn-ghost" :disabled="loading" @click="load">Actualizar</button>
    </section>
  </div>
</template>

<style scoped>
.rules-card{padding:20px}.muted{color:#697386;font-size:13px}.error{color:#b91c1c}.success{color:#166534}.rules-scroll{overflow-x:auto}.rules-table{width:100%;border-collapse:collapse;font-size:13px}.rules-table th,.rules-table td{padding:10px 8px;text-align:left;border-bottom:1px solid #e1e4e8}.rule-actions{display:flex;gap:4px;flex-wrap:wrap}.rules-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.rules-grid label{display:flex;flex-direction:column;gap:5px}.rules-grid select{width:100%;min-width:0;padding:9px}.rules-grid .rule-checkbox{flex-direction:row;align-items:center}@media(max-width:780px){.rules-grid{grid-template-columns:1fr}}
</style>

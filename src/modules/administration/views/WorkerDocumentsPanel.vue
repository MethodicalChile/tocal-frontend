<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { documentsApi } from '../services/documentsApi';

const props = defineProps({
  empresaId: { type: String, required: true },
  trabajadorId: { type: String, required: true },
  assignments: { type: Array, default: () => [] },
  permissions: { type: Array, default: () => [] },
});
const canRead = computed(() => props.permissions.includes('documentos.ver'));
const canCreate = computed(() => props.permissions.includes('documentos.crear'));
const canEdit = computed(() => props.permissions.includes('documentos.editar'));
const canApprove = computed(() => props.permissions.includes('documentos.aprobar') || props.permissions.includes('documentos.editar'));
const canDownload = computed(() => props.permissions.includes('documentos.descargar') || props.permissions.includes('documentos.ver'));

const docs = ref([]);
const types = ref([]);
const complianceData = ref(null);
const files = ref({});
const revisions = ref({});
const openFiles = ref({});
const rejectReason = ref({});
const reviewNotes = ref({});
const busy = ref(false);
const working = ref('');
const message = ref('');
const error = ref('');
const form = ref({ tipo_documento_id: '', obra_id: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' });
let seq = 0;

const workerTypes = computed(() => types.value.filter(t => t.categoria === 'trabajador' && t.activo));
const selectedType = computed(() => workerTypes.value.find(t => t.id === form.value.tipo_documento_id));

function applyQuickValidityMonths(months) {
  const baseStr = form.value.fecha_emision || new Date().toISOString().slice(0, 10);
  if (!form.value.fecha_emision) form.value.fecha_emision = baseStr;
  const d = new Date(`${baseStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return;
  d.setMonth(d.getMonth() + Number(months));
  form.value.fecha_vencimiento = d.toISOString().slice(0, 10);
}

watch(() => form.value.tipo_documento_id, () => {
  const st = selectedType.value;
  if (!st || !st.requiere_vencimiento) return;
  if (!form.value.fecha_emision) {
    form.value.fecha_emision = new Date().toISOString().slice(0, 10);
  }
  if (!form.value.fecha_vencimiento) {
    const code = (st.codigo || '').toLowerCase();
    // Sugerencia inteligente de vigencia según tipo de examen/documento (6m, 12m, 24m)
    const suggestedMonths = code.includes('antecedentes') ? 6 : (code.includes('ocupacional') || code.includes('psicosensometrico') || code.includes('altura') ? 12 : 12);
    applyQuickValidityMonths(suggestedMonths);
  }
});
const obras = computed(() => {
  const seen = new Set();
  return props.assignments.filter(item => {
    const id = String(item.obra_id || '');
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
});
const typeName = id => types.value.find(t => t.id === id)?.nombre || 'Documento';
const obraName = id => obras.value.find(a => String(a.obra_id) === String(id))?.obra_nombre || id || 'General';
const formatDate = value => value ? String(value).slice(0, 10).split('-').reverse().join('-') : '—';
const formatDateTime = value => value ? new Date(value).toLocaleString('es-CL') : '—';
const statusLabel = d => {
  if (d.vencido || d.estado_efectivo === 'vencido') return 'Vencido';
  return ({ pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' }[d.estado] || d.estado);
};
const complianceLabel = stateCode => ({
  aprobado: 'Aprobado',
  pendiente: 'Pendiente',
  rechazado: 'Rechazado',
  vencido: 'Vencido',
  faltante: 'Faltante',
  no_aplicable: 'No aplicable',
}[stateCode] || stateCode);
const size = n => `${(Number(n || 0) / 1024).toFixed(1)} KB`;

function reset() {
  docs.value = [];
  types.value = [];
  complianceData.value = null;
  files.value = {};
  revisions.value = {};
  openFiles.value = {};
  rejectReason.value = {};
  reviewNotes.value = {};
  error.value = '';
  message.value = '';
}

async function load() {
  const current = ++seq;
  reset();
  if (!canRead.value || !props.empresaId || !props.trabajadorId) return;
  busy.value = true;
  try {
    const [documentos, tipos, cump] = await Promise.all([
      documentsApi.records(props.empresaId, props.trabajadorId),
      documentsApi.types(props.empresaId),
      documentsApi.compliance(props.empresaId, props.trabajadorId).catch(() => null),
    ]);
    if (current !== seq) return;
    docs.value = documentos;
    types.value = tipos;
    complianceData.value = cump;
  } catch (e) {
    if (current === seq) error.value = e?.message || 'Error al consultar documentos.';
  } finally {
    if (current === seq) busy.value = false;
  }
}

watch(() => [props.empresaId, props.trabajadorId, canRead.value], load, { immediate: true });
onBeforeUnmount(() => { seq++; });

async function refreshSummary() {
  const [documentos, cump] = await Promise.all([
    documentsApi.records(props.empresaId, props.trabajadorId),
    documentsApi.compliance(props.empresaId, props.trabajadorId).catch(() => null),
  ]);
  docs.value = documentos;
  complianceData.value = cump;
}

async function create() {
  if (working.value || !canCreate.value) return;
  const company = props.empresaId, worker = props.trabajadorId, current = seq;
  working.value = 'create'; error.value = ''; message.value = '';
  try {
    if (!form.value.tipo_documento_id) throw new Error('Selecciona un tipo documental.');
    if (selectedType.value?.requiere_vencimiento && !form.value.fecha_vencimiento) throw new Error('Este tipo requiere vencimiento.');
    await documentsApi.create(company, worker, {
      tipo_documento_id: form.value.tipo_documento_id,
      obra_id: form.value.obra_id || null,
      fecha_emision: form.value.fecha_emision || null,
      fecha_vencimiento: form.value.fecha_vencimiento || null,
      observaciones: form.value.observaciones,
    });
    if (current !== seq) return;
    form.value = { tipo_documento_id: '', obra_id: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' };
    await refreshSummary();
    message.value = 'Registro creado en estado pendiente. Ahora adjunta una evidencia para poder aprobarlo.';
  } catch (e) {
    if (current === seq) error.value = e?.message || 'No se pudo registrar.';
  } finally {
    working.value = '';
  }
}

async function toggleFiles(doc) {
  if (openFiles.value[doc.id]) {
    openFiles.value = { ...openFiles.value, [doc.id]: false };
    return;
  }
  const current = seq;
  working.value = doc.id; error.value = '';
  try {
    const payload = await documentsApi.filesAndHistory(props.empresaId, props.trabajadorId, doc.id);
    if (current !== seq) return;
    files.value = { ...files.value, [doc.id]: payload.results || [] };
    revisions.value = { ...revisions.value, [doc.id]: payload.revisiones || [] };
    openFiles.value = { ...openFiles.value, [doc.id]: true };
  } catch (e) {
    if (current === seq) error.value = e?.message || 'No se pudieron cargar las versiones.';
  } finally {
    working.value = '';
  }
}

async function upload(doc, event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file || !canEdit.value || working.value) return;
  if (file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(file.name)) {
    error.value = 'Selecciona un PDF, PNG o JPEG de máximo 10 MB.';
    input.value = '';
    return;
  }
  const current = seq;
  working.value = doc.id; error.value = ''; message.value = '';
  try {
    await documentsApi.upload(props.empresaId, props.trabajadorId, doc.id, file);
    if (current !== seq) return;
    const [, payload] = await Promise.all([
      refreshSummary(),
      documentsApi.filesAndHistory(props.empresaId, props.trabajadorId, doc.id),
    ]);
    if (current !== seq) return;
    files.value = { ...files.value, [doc.id]: payload.results || [] };
    revisions.value = { ...revisions.value, [doc.id]: payload.revisiones || [] };
    openFiles.value = { ...openFiles.value, [doc.id]: true };
    message.value = 'Nueva versión adjuntada; el documento quedó en estado pendiente de revisión.';
  } catch (e) {
    if (current === seq) error.value = e?.message || 'Falló la subida.';
  } finally {
    input.value = '';
    working.value = '';
  }
}

async function download(doc, file) {
  if (!canDownload.value || working.value) return;
  working.value = file.id; error.value = '';
  try {
    await documentsApi.download(props.empresaId, props.trabajadorId, doc.id, file.id, file.nombre_original);
  } catch (e) {
    error.value = e?.message || 'No se pudo descargar.';
  } finally {
    working.value = '';
  }
}

async function review(doc, nextStatus) {
  if (!canApprove.value || working.value) return;
  const versions = files.value[doc.id];
  if (nextStatus === 'aprobado' && (!doc.tiene_archivo && (!Array.isArray(versions) || versions.length === 0))) {
    error.value = 'No se puede aprobar un documento sin archivo de evidencia adjunto.';
    return;
  }
  const motivo = (rejectReason.value[doc.id] || '').trim();
  const notas = (reviewNotes.value[doc.id] || '').trim();
  if (nextStatus === 'rechazado' && !motivo) {
    error.value = 'Debes indicar el motivo del rechazo antes de rechazar el documento.';
    return;
  }
  const current = seq;
  working.value = doc.id; error.value = ''; message.value = '';
  try {
    const activeVersion = Array.isArray(versions) ? versions[0] : null;
    const payloadReq = {
      estado: nextStatus,
      motivo_rechazo: nextStatus === 'rechazado' ? motivo : '',
      observaciones: notas || doc.observaciones || '',
    };
    if (activeVersion?.id) payloadReq.archivo_id = activeVersion.id;
    await documentsApi.review(props.empresaId, props.trabajadorId, doc.id, payloadReq);
    if (current !== seq) return;
    const [, payload] = await Promise.all([
      refreshSummary(),
      documentsApi.filesAndHistory(props.empresaId, props.trabajadorId, doc.id),
    ]);
    if (current !== seq) return;
    files.value = { ...files.value, [doc.id]: payload.results || [] };
    revisions.value = { ...revisions.value, [doc.id]: payload.revisiones || [] };
    rejectReason.value = { ...rejectReason.value, [doc.id]: '' };
    message.value = nextStatus === 'aprobado' ? 'Documento aprobado y vinculado a la versión vigente.' : 'Documento rechazado con observación registrada.';
  } catch (e) {
    if (current === seq) error.value = e?.message || 'No se pudo revisar.';
  } finally {
    working.value = '';
  }
}
</script>

<template>
  <div class="card stack-sm" style="padding:24px">
    <h2>Expediente documental</h2>
    <p>Documentos del trabajador, evidencias privadas, control de versiones y cumplimiento automático.</p>
    <p v-if="!canRead" class="notice" role="status">No tienes permiso para consultar los documentos de este trabajador.</p>
    <template v-else>
      <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
      <p v-if="message" class="notice" role="status">{{ message }}</p>
      <p v-if="busy" role="status">Cargando expediente…</p>

      <section v-if="!busy && complianceData" class="stack-sm" aria-label="Cumplimiento documental">
        <div class="page-actions" style="justify-content:space-between;align-items:center">
          <h3>Cumplimiento documental ({{ complianceData.porcentaje_cumplimiento ?? 100 }}%)</h3>
          <span class="badge" :class="complianceData.habilitado_documentalmente ? 'badge-ok' : 'badge-warn'">
            {{ complianceData.habilitado_documentalmente ? 'Documentación al día' : 'Con brechas documentales' }}
          </span>
        </div>
        <div class="kpi-strip">
          <span>Obligatorios: <strong>{{ complianceData.total_obligatorios || 0 }}</strong></span>
          <span>Aprobados: <strong>{{ complianceData.aprobados || 0 }}</strong></span>
          <span>Pendientes: <strong>{{ complianceData.pendientes || 0 }}</strong></span>
          <span>Rechazados: <strong>{{ complianceData.rechazados || 0 }}</strong></span>
          <span>Vencidos: <strong>{{ complianceData.vencidos || 0 }}</strong></span>
          <span>Faltantes: <strong>{{ complianceData.faltantes || 0 }}</strong></span>
        </div>

        <div v-if="complianceData.por_obra?.length" class="stack-sm">
          <strong>Cumplimiento por obra activa:</strong>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <span v-for="ob in complianceData.por_obra" :key="ob.obra_id" class="chip">
              {{ ob.obra_nombre }}: <strong>{{ ob.porcentaje_cumplimiento }}%</strong> ({{ ob.aprobados }}/{{ ob.total_obligatorios }})
            </span>
          </div>
        </div>

        <p v-if="!complianceData.requisitos?.length">No hay requisitos configurados para el cargo u obras actuales del trabajador.</p>
        <div v-else style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
            <thead>
              <tr>
                <th>Documento requerido</th>
                <th>Ámbito</th>
                <th>Exigencia</th>
                <th>Estado</th>
                <th>Vencimiento</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in complianceData.requisitos" :key="r.key || `${r.tipo_documento_id}-${r.obra_id || 'general'}`">
                <td>{{ r.tipo_documento_nombre }}</td>
                <td>{{ r.obra_nombre || 'General / Cargo' }}</td>
                <td>{{ r.obligatorio ? 'Obligatorio' : 'Opcional' }}</td>
                <td><strong>{{ r.estado_label || complianceLabel(r.estado) }}</strong></td>
                <td>
                  {{ formatDate(r.fecha_vencimiento) }}
                  <small v-if="r.dias_restantes !== null && r.dias_restantes !== undefined">
                    ({{ r.dias_restantes < 0 ? `vencido hace ${Math.abs(r.dias_restantes)}d` : `${r.dias_restantes}d restantes` }})
                  </small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <template v-if="!busy">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:6px">
          <h3 style="margin:0">Documentos registrados ({{ docs.length }})</h3>
        </div>
        <details v-if="canCreate" class="create-drawer" style="margin-bottom:10px">
          <summary class="create-drawer__trigger">Registrar nuevo documento al trabajador</summary>
          <form class="stack-sm" @submit.prevent="create">
            <div class="form-grid">
              <label class="field">Tipo documental
                <select v-model="form.tipo_documento_id" required :disabled="Boolean(working)">
                  <option value="">Selecciona un tipo</option>
                  <option v-for="type in workerTypes" :key="type.id" :value="type.id">{{ type.nombre }}</option>
                </select>
              </label>
              <label class="field">Obra (opcional)
                <select v-model="form.obra_id" :disabled="Boolean(working)">
                  <option value="">General de la empresa</option>
                  <option v-for="obra in obras" :key="obra.obra_id" :value="obra.obra_id">{{ obra.obra_nombre || obra.obra_id }}</option>
                </select>
              </label>
              <label class="field">Fecha de emisión
                <input v-model="form.fecha_emision" type="date" :disabled="Boolean(working)" />
              </label>
              <label class="field">Fecha de vencimiento {{ selectedType?.requiere_vencimiento ? '(obligatoria)' : '(opcional)' }}
                <input v-model="form.fecha_vencimiento" type="date" :required="Boolean(selectedType?.requiere_vencimiento)" :disabled="Boolean(working)" />
                <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">
                  <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" @click="applyQuickValidityMonths(6)">+6 meses</button>
                  <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" @click="applyQuickValidityMonths(12)">+1 año</button>
                  <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" @click="applyQuickValidityMonths(24)">+2 años</button>
                  <button type="button" class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px" @click="applyQuickValidityMonths(36)">+3 años</button>
                </div>
              </label>
              <label class="field field--wide">Observaciones
                <textarea v-model="form.observaciones" maxlength="2000" rows="2" :disabled="Boolean(working)" />
              </label>
            </div>
            <p v-if="!workerTypes.length">Primero configura un tipo documental activo de categoría trabajador.</p>
            <button class="btn btn-primary" type="submit" :disabled="Boolean(working) || !workerTypes.length">Registrar documento</button>
          </form>
        </details>
        <p v-if="!docs.length">No hay documentos registrados para este trabajador.</p>
        <div v-for="doc in docs" :key="doc.id" class="card stack-sm" style="padding:16px">
          <div class="page-actions" style="justify-content:space-between">
            <div>
              <strong>{{ doc.tipo_documento_nombre || typeName(doc.tipo_documento_id) }}</strong>
              <span class="muted" style="margin-left:8px">
                {{ doc.tiene_archivo ? `Evidencia v${doc.version_actual || 1}` : 'Sin archivo adjunto' }}
              </span>
            </div>
            <span><strong>{{ statusLabel(doc) }}</strong></span>
          </div>
          <p>
            Obra: {{ doc.obra_nombre || obraName(doc.obra_id) }} ·
            Emisión: {{ formatDate(doc.fecha_emision) }} ·
            Vencimiento: {{ formatDate(doc.fecha_vencimiento) }}
            <template v-if="doc.dias_restantes !== null && doc.dias_restantes !== undefined">
              ({{ doc.dias_restantes < 0 ? `Vencido hace ${Math.abs(doc.dias_restantes)} días` : `Vence en ${doc.dias_restantes} días` }})
            </template>
          </p>
          <p v-if="doc.version_aprobada_numero" class="muted">
            Versión aprobada: v{{ doc.version_aprobada_numero }}
            <template v-if="doc.revisado_por_nombre"> por {{ doc.revisado_por_nombre }}</template>
            <template v-if="doc.revisado_en"> ({{ formatDateTime(doc.revisado_en) }})</template>
          </p>
          <p v-if="doc.motivo_rechazo" class="notice bad">
            <strong>Motivo de rechazo:</strong> {{ doc.motivo_rechazo }}
          </p>
          <p v-if="doc.observaciones">{{ doc.observaciones }}</p>

          <div class="page-actions">
            <button type="button" class="btn btn-ghost btn-sm" :disabled="Boolean(working)" @click="toggleFiles(doc)">
              {{ openFiles[doc.id] ? 'Ocultar versiones e historial' : 'Ver versiones y revisión' }}
            </button>
            <label v-if="canEdit" class="btn btn-ghost btn-sm" :aria-disabled="Boolean(working)">
              {{ doc.tiene_archivo ? 'Subir nueva versión' : 'Adjuntar evidencia' }}
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" style="max-width:180px" :disabled="Boolean(working)" @change="upload(doc, $event)" />
            </label>
          </div>

          <div v-if="openFiles[doc.id]" class="stack-sm" style="border-top:1px solid #e5e7eb;padding-top:10px">
            <strong>Versiones de archivo</strong>
            <p v-if="!files[doc.id]?.length">Sin archivos adjuntos. Debes subir una evidencia antes de aprobar.</p>
            <div v-for="(file, idx) in files[doc.id] || []" :key="file.id" class="page-actions" style="justify-content:space-between">
              <span>
                v{{ file.version }} · {{ file.nombre_original }} · {{ size(file.tamano_bytes) }}
                <small class="muted">({{ idx === 0 ? 'Vigente' : 'Histórica' }} · {{ formatDateTime(file.creado_en) }})</small>
              </span>
              <button v-if="canDownload" type="button" class="btn btn-ghost btn-sm" :disabled="Boolean(working)" @click="download(doc, file)">Descargar</button>
            </div>

            <div v-if="canApprove" class="stack-sm" style="margin-top:8px">
              <strong>Revisión documental</strong>
              <p v-if="!files[doc.id]?.length" class="muted">Para aprobar este documento primero debes adjuntar un archivo de evidencia.</p>
              <div v-else class="stack-sm">
                <div class="form-grid">
                  <label class="field">Observaciones de revisión (opcional)
                    <input v-model="reviewNotes[doc.id]" type="text" maxlength="500" placeholder="Comentario de revisión" :disabled="Boolean(working)" />
                  </label>
                  <label class="field">Motivo de rechazo (obligatorio al rechazar)
                    <input v-model="rejectReason[doc.id]" type="text" maxlength="500" placeholder="Indica por qué se rechaza la evidencia" :disabled="Boolean(working)" />
                  </label>
                </div>
                <div class="page-actions">
                  <button type="button" class="btn btn-sm" :disabled="Boolean(working) || !files[doc.id]?.length || (doc.estado === 'aprobado' && doc.version_aprobada_id)" @click="review(doc, 'aprobado')">
                    Aprobar versión vigente
                  </button>
                  <button type="button" class="btn btn-ghost btn-sm" :disabled="Boolean(working)" @click="review(doc, 'rechazado')">
                    Rechazar con observación
                  </button>
                </div>
              </div>
            </div>

            <div v-if="revisions[doc.id]?.length" class="stack-sm" style="margin-top:8px">
              <strong>Historial de revisiones</strong>
              <ul style="margin:0;padding-left:18px;font-size:12px">
                <li v-for="rev in revisions[doc.id]" :key="rev.id">
                  {{ formatDateTime(rev.creado_en) }} — <strong>{{ rev.estado }}</strong>
                  <template v-if="rev.version"> (v{{ rev.version }})</template>
                  por {{ rev.revisado_por_nombre || 'Sistema' }}
                  <template v-if="rev.observaciones"> · Obs: {{ rev.observaciones }}</template>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.kpi-strip { display: flex; gap: 14px; flex-wrap: wrap; font-size: 13px; background: #f8fafc; padding: 10px 12px; border-radius: 8px; }
.chip { font-size: 12px; padding: 4px 10px; border-radius: 999px; background: #f1f5f9; }
.badge { font-size: 12px; padding: 4px 10px; border-radius: 999px; font-weight: 600; }
.badge-ok { background: #dcfce7; color: #166534; }
.badge-warn { background: #fef3c7; color: #92400e; }
</style>

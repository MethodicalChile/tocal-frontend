<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { ArrowLeft, UserRound, Building2, BriefcaseBusiness, ShieldCheck } from 'lucide-vue-next';
import { state } from '../../../lib/state';
import { authorizationApi } from '../services/authorizationApi';
import { workforceApi } from '../services/workforceApi';
import { documentsApi } from '../services/documentsApi';
import WorkerDocumentsPanel from './WorkerDocumentsPanel.vue';

const route = useRoute();
const empresaId = computed(() => state.activeCompanyId);
const trabajadorId = computed(() => String(route.params.trabajadorId || ''));
const record = ref(null);
const assignments = ref([]);
const permissions = ref([]);
const loading = ref(false);
const error = ref('');

// Prevención: Habilitación, Capacitaciones y EPP (Etapa 9)
const habPreventiva = ref(null);
const trainings = ref([]);
const trainingTypes = ref([]);
const eppDeliveries = ref([]);
const eppCategories = ref([]);
const prevSaving = ref(false);
const prevFeedback = ref('');
const prevError = ref('');
const trainingForm = ref({ tipo_capacitacion_id: '', obra_id: '', fecha_realizacion: '', relator: '', estado: 'vigente', observaciones: '' });
const eppForm = ref({ categoria_id: '', descripcion_elemento: '', talla: '', cantidad: 1, fecha_entrega: '', firmado_recepcion: true });

let sequence = 0;

const canRead = computed(() => permissions.value.includes('empleados.ver'));
const canReadSensitive = computed(() => permissions.value.includes('empleados.ver_sensibles'));
const canManagePrev = computed(() => permissions.value.includes('documentos.crear') || permissions.value.includes('empleados.editar'));
const nombre = computed(() => record.value ? [record.value.nombres, record.value.apellido_paterno, record.value.apellido_materno].filter(Boolean).join(' ') : 'Ficha del trabajador');
const sortedAssignments = computed(() => [...assignments.value].sort((a, b) => String(b.fecha_inicio || '').localeCompare(String(a.fecha_inicio || ''))));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const vigente = a => Boolean(a.fecha_inicio) && a.fecha_inicio <= today() && (!a.fecha_fin || a.fecha_fin >= today());
const countVigentes = computed(() => sortedAssignments.value.filter(vigente).length);
function fecha(value) {
  if (!value) return '—';
  const parts = String(value).slice(0, 10).split('-');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : String(value);
}

async function loadPrevention(company, worker) {
  try {
    const [hab, trs, tTypes, epps, eCats] = await Promise.all([
      documentsApi.preventiveQualification(company, worker).catch(() => null),
      documentsApi.workerTrainings(company, worker).catch(() => []),
      documentsApi.trainingTypes(company).catch(() => []),
      documentsApi.workerEpp(company, worker).catch(() => []),
      documentsApi.eppCategories(company).catch(() => []),
    ]);
    habPreventiva.value = hab;
    trainings.value = trs;
    trainingTypes.value = tTypes;
    eppDeliveries.value = epps;
    eppCategories.value = eCats;
    if (!trainingForm.value.fecha_realizacion) trainingForm.value.fecha_realizacion = today();
    if (!eppForm.value.fecha_entrega) eppForm.value.fecha_entrega = today();
  } catch (_) {
    // Non-fatal if user only has worker read access
  }
}

async function submitTraining() {
  if (!empresaId.value || !trabajadorId.value || prevSaving.value) return;
  prevSaving.value = true; prevError.value = ''; prevFeedback.value = '';
  try {
    await documentsApi.createWorkerTraining(empresaId.value, trabajadorId.value, {
      tipo_capacitacion_id: trainingForm.value.tipo_capacitacion_id,
      obra_id: trainingForm.value.obra_id || null,
      fecha_realizacion: trainingForm.value.fecha_realizacion,
      relator: trainingForm.value.relator,
      estado: trainingForm.value.estado,
      observaciones: trainingForm.value.observaciones,
    });
    trainingForm.value = { tipo_capacitacion_id: '', obra_id: '', fecha_realizacion: today(), relator: '', estado: 'vigente', observaciones: '' };
    await loadPrevention(empresaId.value, trabajadorId.value);
    prevFeedback.value = 'Capacitación registrada correctamente.';
  } catch (e) {
    prevError.value = e.message || 'No fue posible registrar la capacitación.';
  } finally {
    prevSaving.value = false;
  }
}

async function submitEpp() {
  if (!empresaId.value || !trabajadorId.value || prevSaving.value) return;
  prevSaving.value = true; prevError.value = ''; prevFeedback.value = '';
  try {
    await documentsApi.createWorkerEpp(empresaId.value, trabajadorId.value, {
      categoria_id: eppForm.value.categoria_id,
      descripcion_elemento: eppForm.value.descripcion_elemento,
      talla: eppForm.value.talla,
      cantidad: Number(eppForm.value.cantidad) || 1,
      fecha_entrega: eppForm.value.fecha_entrega,
      firmado_recepcion: eppForm.value.firmado_recepcion,
    });
    eppForm.value = { categoria_id: '', descripcion_elemento: '', talla: '', cantidad: 1, fecha_entrega: today(), firmado_recepcion: true };
    await loadPrevention(empresaId.value, trabajadorId.value);
    prevFeedback.value = 'Entrega de EPP registrada correctamente.';
  } catch (e) {
    prevError.value = e.message || 'No fue posible registrar la entrega de EPP.';
  } finally {
    prevSaving.value = false;
  }
}

async function load() {
  const current = ++sequence;
  record.value = null;
  assignments.value = [];
  permissions.value = [];
  error.value = '';
  if (!empresaId.value || !trabajadorId.value) { loading.value = false; return; }
  loading.value = true;
  const company = empresaId.value;
  const worker = trabajadorId.value;
  try {
    const access = await authorizationApi.myPermissions(company);
    if (current !== sequence || company !== empresaId.value) return;
    permissions.value = Array.isArray(access.permissions) ? access.permissions : [];
    if (!canRead.value) { error.value = 'No tienes permiso para ver trabajadores de esta empresa.'; return; }
    const response = await workforceApi.detalleTrabajador(company, worker);
    if (current !== sequence || company !== empresaId.value || worker !== trabajadorId.value) return;
    record.value = response.record || null;
    assignments.value = Array.isArray(response.asignaciones) ? response.asignaciones : [];
    if (!record.value) error.value = 'No se encontró la ficha solicitada.';
    else await loadPrevention(company, worker);
  } catch (e) {
    if (current !== sequence) return;
    error.value = e?.message || 'No fue posible cargar la ficha del trabajador.';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(() => [empresaId.value, trabajadorId.value], load, { immediate: true });
onBeforeUnmount(() => { sequence++; });
</script>

<template>
  <section class="stack" style="max-width:1200px">
    <header class="stack-sm">
      <RouterLink class="btn btn-ghost btn-sm" to="/administracion/trabajadores" style="align-self:flex-start">
        <ArrowLeft :size="16" /> Volver a trabajadores
      </RouterLink>
      <h1>Ficha del trabajador</h1>
      <p>Identificación, trayectoria laboral, expediente documental y prevención en la empresa seleccionada.</p>
    </header>

    <p v-if="!empresaId" role="alert" class="notice bad">Selecciona una empresa activa para consultar esta ficha.</p>
    <p v-else-if="loading" role="status">Cargando ficha del trabajador…</p>
    <p v-else-if="error" role="alert" class="notice bad">{{ error }}</p>

    <template v-else-if="record && canRead">
      <div class="card stack-sm" style="padding:24px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:14px">
            <UserRound :size="32" aria-hidden="true" />
            <div>
              <h2 style="margin:0">{{ nombre }}</h2>
              <p style="margin:4px 0 0">{{ record.activo ? 'Trabajador activo' : 'Trabajador inactivo' }}</p>
            </div>
          </div>
          <div v-if="habPreventiva" class="card" style="padding:10px 16px">
            <small class="muted">Habilitación preventiva</small>
            <div>
              <strong>{{ habPreventiva.estado_habilitacion === 'habilitado' ? 'Habilitado' : habPreventiva.estado_habilitacion === 'condicionado' ? 'Condicionado' : 'No habilitado' }}</strong>
            </div>
          </div>
        </div>
        <dl class="facts" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px">
          <div><dt>Nombres</dt><dd>{{ record.nombres }}</dd></div>
          <div><dt>Apellido paterno</dt><dd>{{ record.apellido_paterno }}</dd></div>
          <div><dt>Apellido materno</dt><dd>{{ record.apellido_materno || '—' }}</dd></div>
          <div v-if="canReadSensitive && Object.prototype.hasOwnProperty.call(record, 'rut')">
            <dt>RUT (dato restringido)</dt><dd>{{ record.rut || '—' }}</dd>
          </div>
        </dl>
      </div>

      <div class="stat-grid cols-3">
        <div class="card" style="padding:18px"><Building2 :size="18"/><p>Obras registradas</p><h2>{{ new Set(assignments.map(a => a.obra_id)).size }}</h2></div>
        <div class="card" style="padding:18px"><ShieldCheck :size="18"/><p>Asignaciones vigentes</p><h2>{{ countVigentes }}</h2></div>
        <div class="card" style="padding:18px"><BriefcaseBusiness :size="18"/><p>Cargos históricos</p><h2>{{ new Set(assignments.map(a => a.cargo_id)).size }}</h2></div>
      </div>

      <div class="card stack-sm" style="padding:24px">
        <h2>Historial laboral</h2>
        <p v-if="!sortedAssignments.length">Este trabajador todavía no tiene asignaciones registradas en la empresa.</p>
        <div v-else style="overflow-x:auto">
          <table style="width:100%;text-align:left;border-collapse:collapse">
            <thead><tr><th scope="col">Obra</th><th scope="col">Cargo</th><th scope="col">Inicio</th><th scope="col">Término</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              <tr v-for="assignment in sortedAssignments" :key="assignment.id">
                <td>{{ assignment.obra_nombre || assignment.obra_id }}</td>
                <td>{{ assignment.cargo_nombre || assignment.cargo_id }}</td>
                <td>{{ fecha(assignment.fecha_inicio) }}</td>
                <td>{{ fecha(assignment.fecha_fin) }}</td>
                <td>{{ vigente(assignment) ? 'Vigente' : 'No vigente' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <WorkerDocumentsPanel
        :empresa-id="empresaId"
        :trabajador-id="trabajadorId"
        :assignments="assignments"
        :permissions="permissions"
      />

      <!-- Etapa 9: Habilitación Preventiva, Capacitaciones y EPP -->
      <div class="card stack-sm" style="padding:24px">
        <h2>Prevención de Riesgos: Habilitación, Capacitaciones y EPP</h2>
        <p v-if="prevError" role="alert" class="notice bad">{{ prevError }}</p>
        <p v-if="prevFeedback" role="status" class="notice">{{ prevFeedback }}</p>

        <div v-if="habPreventiva" class="stat-grid cols-3" style="margin-bottom:16px">
          <div class="card" style="padding:14px">
            <small class="muted">Cumplimiento documental</small>
            <div><strong>{{ habPreventiva.documentos?.porcentaje_cumplimiento ?? 100 }}%</strong> ({{ habPreventiva.documentos?.estado_global }})</div>
          </div>
          <div class="card" style="padding:14px">
            <small class="muted">Capacitaciones obligatorias</small>
            <div><strong>{{ habPreventiva.capacitaciones?.cumplidos ?? 0 }} / {{ habPreventiva.capacitaciones?.total_obligatorios ?? 0 }}</strong></div>
          </div>
          <div class="card" style="padding:14px">
            <small class="muted">EPP vigentes entregados</small>
            <div><strong>{{ habPreventiva.epp?.entregas_vigentes ?? 0 }}</strong> (vencidos: {{ habPreventiva.epp?.epp_vencidos ?? 0 }})</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px">
          <div>
            <h3>Capacitaciones y charlas registradas</h3>
            <table v-if="trainings.length" style="width:100%;text-align:left;border-collapse:collapse;font-size:13px">
              <thead><tr><th>Curso / Charla</th><th>Realización</th><th>Vencimiento</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="t in trainings" :key="t.id">
                  <td>{{ t.tipo_capacitacion_nombre }}</td>
                  <td>{{ fecha(t.fecha_realizacion) }}</td>
                  <td>{{ fecha(t.fecha_vencimiento) }}</td>
                  <td>{{ t.estado }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted">Sin capacitaciones registradas.</p>

            <form v-if="canManagePrev && trainingTypes.length" class="stack-sm" style="margin-top:12px" @submit.prevent="submitTraining">
              <h4>Registrar capacitación</h4>
              <select v-model="trainingForm.tipo_capacitacion_id" required style="padding:8px">
                <option value="">Selecciona tipo de capacitación…</option>
                <option v-for="tt in trainingTypes" :key="tt.id" :value="tt.id">{{ tt.nombre }}</option>
              </select>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <input v-model="trainingForm.fecha_realizacion" type="date" required style="padding:8px" />
                <input v-model="trainingForm.relator" placeholder="Relator / Organismo" style="padding:8px" />
              </div>
              <button class="btn btn-sm" type="submit" :disabled="prevSaving">Guardar capacitación</button>
            </form>
          </div>

          <div>
            <h3>Entregas de EPP</h3>
            <table v-if="eppDeliveries.length" style="width:100%;text-align:left;border-collapse:collapse;font-size:13px">
              <thead><tr><th>Elemento</th><th>Talla / Cant.</th><th>Entrega</th><th>Reposición</th></tr></thead>
              <tbody>
                <tr v-for="e in eppDeliveries" :key="e.id">
                  <td>{{ e.categoria_nombre }} {{ e.descripcion_elemento ? `(${e.descripcion_elemento})` : '' }}</td>
                  <td>{{ e.talla || '—' }} · x{{ e.cantidad }}</td>
                  <td>{{ fecha(e.fecha_entrega) }}</td>
                  <td>{{ fecha(e.fecha_vencimiento) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted">Sin entregas de EPP registradas.</p>

            <form v-if="canManagePrev && eppCategories.length" class="stack-sm" style="margin-top:12px" @submit.prevent="submitEpp">
              <h4>Registrar entrega de EPP</h4>
              <select v-model="eppForm.categoria_id" required style="padding:8px">
                <option value="">Selecciona categoría de EPP…</option>
                <option v-for="ec in eppCategories" :key="ec.id" :value="ec.id">{{ ec.nombre }}</option>
              </select>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                <input v-model="eppForm.fecha_entrega" type="date" required style="padding:8px" />
                <input v-model="eppForm.talla" placeholder="Talla" style="padding:8px" />
                <input v-model.number="eppForm.cantidad" type="number" min="1" required style="padding:8px" />
              </div>
              <button class="btn btn-sm" type="submit" :disabled="prevSaving">Registrar entrega EPP</button>
            </form>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

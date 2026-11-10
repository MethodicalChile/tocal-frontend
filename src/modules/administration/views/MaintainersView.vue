<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { state, can } from '../../../lib/state';
import { documentsApi } from '../services/documentsApi';
import { workforceApi } from '../services/workforceApi';
import { worksApi } from '../services/worksApi';
import RequirementsMaintainer from './RequirementsMaintainer.vue';

const route = useRoute();
const companyId = computed(() => state.activeCompanyId);
const canCreate = computed(() => can('tipos_documentales.crear') || can('documentos.crear'));
const canEdit = computed(() => can('tipos_documentales.editar') || can('documentos.editar'));
const canConfigureAlerts = computed(() => can('alertas.configurar') || can('tipos_documentales.editar'));
const canViewAlerts = computed(() => can('alertas.ver') || can('documentos.ver'));

const items = ref([]);
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const info = ref('');
const category = ref('todas');
const search = ref('');
const statusFilter = ref('todos');
const activeTab = ref('tipos');
const editing = ref(null);
const emptyForm = () => ({ codigo: '', nombre: '', categoria: 'trabajador', descripcion: '', requiere_vencimiento: false, activo: true });
const form = ref(emptyForm());

const alertThresholds = ref({ u1: 30, u2: 15, u3: 7 });
const alertConfig = ref({ dias_anticipacion: [30, 15, 7], notificar_vencidos: true, activo: true });
const alertsList = ref([]);
const alertsSummary = ref({ total: 0, no_leidas: 0, vencidos: 0, por_vencer: 0 });
const loadingAlerts = ref(false);

// Catálogos de Prevención (Etapa 3.5 y Etapa 9)
const trainingTypes = ref([]);
const trainingReqs = ref([]);
const eppCategories = ref([]);
const cargos = ref([]);
const obras = ref([]);
const loadingPrevention = ref(false);
const trainingTypeForm = ref({ codigo: '', nombre: '', descripcion: '', vigencia_meses: '', horas_duracion: 1, activo: true });
const trainingReqForm = ref({ tipo_capacitacion_id: '', cargo_id: '', obra_id: '', obligatorio: true, activo: true });
const eppCategoryForm = ref({ codigo: '', nombre: '', descripcion: '', vida_util_dias: '', activo: true });

let seq = 0;
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return items.value.filter(t => {
    if (category.value !== 'todas' && t.categoria !== category.value) return false;
    if (statusFilter.value === 'activos' && !t.activo) return false;
    if (statusFilter.value === 'inactivos' && t.activo) return false;
    if (q && !t.nombre.toLowerCase().includes(q) && !t.codigo.toLowerCase().includes(q)) return false;
    return true;
  });
});

async function load() {
  const id = companyId.value;
  const current = ++seq;
  items.value = [];
  error.value = '';
  if (!id) return;
  loading.value = true;
  try {
    const result = await documentsApi.types(id);
    if (seq === current && companyId.value === id) items.value = result;
  } catch (e) {
    if (seq === current) error.value = e.message;
  } finally {
    if (seq === current) loading.value = false;
  }
}

async function loadPreventionCatalogs() {
  const id = companyId.value;
  if (!id) return;
  loadingPrevention.value = true;
  error.value = '';
  try {
    const [tTypes, tReqs, eppCats, cargosResp, obrasResp] = await Promise.all([
      documentsApi.trainingTypes(id),
      documentsApi.trainingRequirements(id),
      documentsApi.eppCategories(id),
      workforceApi.cargos(id).catch(() => ({ results: [] })),
      worksApi.listByCompany(id).catch(() => ({ results: [] })),
    ]);
    trainingTypes.value = tTypes;
    trainingReqs.value = tReqs;
    eppCategories.value = eppCats;
    cargos.value = cargosResp.results || [];
    obras.value = obrasResp.results || [];
  } catch (e) {
    error.value = e.message || 'No se pudieron cargar los catálogos de prevención.';
  } finally {
    loadingPrevention.value = false;
  }
}

async function saveTrainingType() {
  if (!companyId.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.createTrainingType(companyId.value, {
      codigo: trainingTypeForm.value.codigo.trim().toLowerCase(),
      nombre: trainingTypeForm.value.nombre.trim(),
      descripcion: trainingTypeForm.value.descripcion,
      vigencia_meses: trainingTypeForm.value.vigencia_meses ? Number(trainingTypeForm.value.vigencia_meses) : null,
      horas_duracion: Number(trainingTypeForm.value.horas_duracion) || 1,
      activo: trainingTypeForm.value.activo,
    });
    trainingTypeForm.value = { codigo: '', nombre: '', descripcion: '', vigencia_meses: '', horas_duracion: 1, activo: true };
    await loadPreventionCatalogs();
    info.value = 'Tipo de capacitación registrado.';
  } catch (e) {
    error.value = e.message || 'No se pudo crear el tipo de capacitación.';
  } finally {
    saving.value = false;
  }
}

async function saveTrainingReq() {
  if (!companyId.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.createTrainingRequirement(companyId.value, {
      tipo_capacitacion_id: trainingReqForm.value.tipo_capacitacion_id,
      cargo_id: trainingReqForm.value.cargo_id || null,
      obra_id: trainingReqForm.value.obra_id || null,
      obligatorio: trainingReqForm.value.obligatorio,
      activo: trainingReqForm.value.activo,
    });
    trainingReqForm.value = { tipo_capacitacion_id: '', cargo_id: '', obra_id: '', obligatorio: true, activo: true };
    await loadPreventionCatalogs();
    info.value = 'Requisito de capacitación registrado.';
  } catch (e) {
    error.value = e.message || 'No se pudo crear el requisito de capacitación.';
  } finally {
    saving.value = false;
  }
}

async function saveEppCategory() {
  if (!companyId.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.createEppCategory(companyId.value, {
      codigo: eppCategoryForm.value.codigo.trim().toLowerCase(),
      nombre: eppCategoryForm.value.nombre.trim(),
      descripcion: eppCategoryForm.value.descripcion,
      vida_util_dias: eppCategoryForm.value.vida_util_dias ? Number(eppCategoryForm.value.vida_util_dias) : null,
      activo: eppCategoryForm.value.activo,
    });
    eppCategoryForm.value = { codigo: '', nombre: '', descripcion: '', vida_util_dias: '', activo: true };
    await loadPreventionCatalogs();
    info.value = 'Categoría de EPP registrada.';
  } catch (e) {
    error.value = e.message || 'No se pudo crear la categoría de EPP.';
  } finally {
    saving.value = false;
  }
}

async function loadAlertsSection(syncNow = false) {
  const id = companyId.value;
  if (!id || !canViewAlerts.value) return;
  loadingAlerts.value = true;
  error.value = '';
  try {
    if (syncNow) {
      await documentsApi.syncAlerts(id);
    }
    const [cfg, listResp] = await Promise.all([
      documentsApi.alertsConfig(id),
      documentsApi.alerts(id),
    ]);
    alertConfig.value = cfg;
    const dias = Array.isArray(cfg.dias_anticipacion) ? cfg.dias_anticipacion : [30, 15, 7];
    alertThresholds.value = { u1: dias[0] || 30, u2: dias[1] || 15, u3: dias[2] || 7 };
    alertsList.value = listResp.results || [];
    alertsSummary.value = listResp.resumen || { total: 0, no_leidas: 0, vencidos: 0, por_vencer: 0 };
  } catch (e) {
    error.value = e.message || 'No se pudieron cargar las alertas.';
  } finally {
    loadingAlerts.value = false;
  }
}

async function saveAlertConfig() {
  if (!companyId.value || !canConfigureAlerts.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    const dias = [
      Number(alertThresholds.value.u1) || 30,
      Number(alertThresholds.value.u2) || 15,
      Number(alertThresholds.value.u3) || 7,
    ].filter(n => n >= 1 && n <= 365);
    const updated = await documentsApi.updateAlertsConfig(companyId.value, {
      dias_anticipacion: dias,
      notificar_vencidos: alertConfig.value.notificar_vencidos,
      activo: alertConfig.value.activo,
    });
    alertConfig.value = updated;
    await loadAlertsSection(true);
    info.value = 'Configuración de alertas actualizada y sincronizada.';
  } catch (e) {
    error.value = e.message || 'No se pudo actualizar la configuración de alertas.';
  } finally {
    saving.value = false;
  }
}

async function toggleAlertRead(alerta) {
  if (!companyId.value || saving.value) return;
  saving.value = true;
  try {
    await documentsApi.markAlert(companyId.value, alerta.id, !alerta.leida);
    await loadAlertsSection(false);
  } catch (e) {
    error.value = e.message || 'No se pudo actualizar la alerta.';
  } finally {
    saving.value = false;
  }
}

function newItem() { editing.value = null; form.value = emptyForm(); error.value = ''; info.value = ''; }
function editItem(item) {
  editing.value = item.id;
  form.value = { codigo: item.codigo, nombre: item.nombre, categoria: item.categoria,
    descripcion: item.descripcion || '', requiere_vencimiento: item.requiere_vencimiento, activo: item.activo };
  error.value = ''; info.value = '';
}
async function save() {
  if (saving.value || !companyId.value) return;
  const id = companyId.value;
  saving.value = true; error.value = ''; info.value = '';
  try {
    if (editing.value) {
      await documentsApi.updateType(id, editing.value, {
        nombre: form.value.nombre.trim(), descripcion: form.value.descripcion,
        requiere_vencimiento: form.value.requiere_vencimiento, activo: form.value.activo,
      });
    } else {
      await documentsApi.createType(id, {
        codigo: form.value.codigo.trim().toLowerCase(), nombre: form.value.nombre.trim(),
        categoria: form.value.categoria, descripcion: form.value.descripcion,
        requiere_vencimiento: form.value.requiere_vencimiento, activo: form.value.activo,
      });
    }
    if (companyId.value !== id) return;
    const action = editing.value ? 'actualizado' : 'creado';
    newItem(); await load(); info.value = `Tipo documental ${action} correctamente.`;
  } catch (e) { if (companyId.value === id) error.value = e.message; }
  finally { saving.value = false; }
}
async function toggle(item) {
  if (!canEdit.value || saving.value) return;
  const id = companyId.value;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.updateType(id, item.id, { activo: !item.activo });
    if (companyId.value === id) { await load(); info.value = item.activo ? 'Tipo desactivado.' : 'Tipo activado.'; }
  } catch(e) { if (companyId.value === id) error.value = e.message; }
  finally { saving.value = false; }
}
async function seedBaseCatalogs() {
  if (!companyId.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    const res = await documentsApi.seedTocalCatalogs(companyId.value);
    await load();
    if (activeTab.value === 'capacitaciones' || activeTab.value === 'epp') await loadPreventionCatalogs();
    info.value = `Catálogos TOCAL sincronizados: +${res.cargos_creados || 0} cargos, +${res.tipos_documentales_creados || 0} tipos documentales, +${res.requisitos_documentales_creados || 0} requisitos, +${res.tipos_capacitacion_creados || 0} capacitaciones y +${res.categorias_epp_creadas || 0} categorías de EPP.`;
  } catch (e) {
    error.value = e.message || 'No se pudieron cargar los catálogos base de TOCAL.';
  } finally {
    saving.value = false;
  }
}

watch(companyId, () => {
  newItem();
  load();
  if (activeTab.value === 'alertas') loadAlertsSection();
  if (activeTab.value === 'capacitaciones' || activeTab.value === 'epp') loadPreventionCatalogs();
});
watch(activeTab, tab => {
  error.value = ''; info.value = '';
  if (tab === 'alertas') loadAlertsSection();
  if (tab === 'capacitaciones' || tab === 'epp') loadPreventionCatalogs();
});
watch(() => route.query.tab, qTab => {
  if (qTab && ['tipos', 'requisitos', 'capacitaciones', 'epp', 'alertas'].includes(String(qTab))) {
    activeTab.value = String(qTab);
  }
}, { immediate: true });
onMounted(load);
</script>

<template>
  <section class="stack" style="max-width:1100px">
    <header style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
      <div>
        <h1>Ajustes y mantenedores</h1>
        <p>Administra los catálogos documentales, requisitos, prevención y parámetros operacionales de la empresa seleccionada.</p>
      </div>
      <button v-if="canCreate" type="button" class="btn btn-primary" :disabled="saving || loading" @click="seedBaseCatalogs">
        Cargar catálogos base TOCAL
      </button>
    </header>
    <div class="maint-layout">
      <aside class="card maint-aside">
        <h2>Mantenedores</h2>
        <button type="button" class="maint-tab" :class="{'maint-selected':activeTab==='tipos'}" @click="activeTab='tipos'">Tipos de documento</button>
        <button type="button" class="maint-tab" :class="{'maint-selected':activeTab==='requisitos'}" @click="activeTab='requisitos'">Requisitos por cargo y obra</button>
        <button type="button" class="maint-tab" :class="{'maint-selected':activeTab==='capacitaciones'}" @click="activeTab='capacitaciones'">Catálogo de capacitaciones</button>
        <button type="button" class="maint-tab" :class="{'maint-selected':activeTab==='epp'}" @click="activeTab='epp'">Categorías de EPP</button>
        <button type="button" class="maint-tab" :class="{'maint-selected':activeTab==='alertas'}" @click="activeTab='alertas'">Alertas y vencimientos</button>
      </aside>

      <div v-if="activeTab==='tipos'" class="stack" style="min-width:0">
        <div class="card maint-content">
          <h2>Tipos de documento</h2>
          <p class="maint-muted">Catálogo utilizado por los expedientes de trabajadores y los documentos de empresa y equipos.</p>
          <p v-if="error" role="alert" class="maint-error">{{ error }}</p>
          <p v-if="info" role="status" class="maint-success">{{ info }}</p>
          <div class="maint-tools">
            <label>Buscar
              <input v-model="search" type="search" placeholder="Nombre o código…" />
            </label>
            <label>Categoría
              <select v-model="category"><option value="todas">Todas</option><option value="trabajador">Trabajador</option><option value="empresa">Empresa</option><option value="equipo">Equipo</option></select>
            </label>
            <label>Estado
              <select v-model="statusFilter"><option value="todos">Todos</option><option value="activos">Activos</option><option value="inactivos">Inactivos</option></select>
            </label>
            <button type="button" class="btn btn-ghost" :disabled="loading" @click="load">Actualizar</button>
          </div>
          <p v-if="loading">Cargando tipos documentales…</p>
          <p v-else-if="!filtered.length">No hay tipos documentales para los filtros seleccionados.</p>
          <div v-else class="maint-table-wrap"><table class="maint-table"><thead><tr><th>Nombre</th><th>Código</th><th>Categoría</th><th>Vencimiento</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
            <tr v-for="item in filtered" :key="item.id"><td>{{ item.nombre }}</td><td>{{ item.codigo }}</td><td>{{ item.categoria }}</td><td>{{ item.requiere_vencimiento ? 'Sí' : 'No' }}</td><td>{{ item.activo ? 'Activo' : 'Inactivo' }}</td>
              <td><div class="maint-actions"><button v-if="canEdit" type="button" class="btn btn-ghost" :disabled="saving" @click="editItem(item)">Editar</button><button v-if="canEdit" type="button" class="btn btn-ghost" :disabled="saving" @click="toggle(item)">{{ item.activo ? 'Desactivar' : 'Activar' }}</button></div></td>
            </tr>
          </tbody></table></div>
        </div>
        <form v-if="canCreate || (canEdit && editing)" class="card maint-content" @submit.prevent="save">
          <h2>{{ editing ? 'Editar tipo documental' : 'Nuevo tipo documental' }}</h2>
          <div class="maint-grid">
            <label>Código <input v-model.trim="form.codigo" required maxlength="64" pattern="[a-z0-9]+(?:[-_][a-z0-9]+)*" :disabled="!!editing" placeholder="contrato-trabajo" /></label>
            <label>Nombre <input v-model.trim="form.nombre" required maxlength="180" placeholder="Contrato de trabajo" /></label>
            <label>Categoría <select v-model="form.categoria" :disabled="!!editing"><option value="trabajador">Trabajador</option><option value="empresa">Empresa</option><option value="equipo">Equipo</option></select></label>
            <label>Descripción <input v-model="form.descripcion" maxlength="500" placeholder="Descripción opcional" /></label>
          </div>
          <label class="maint-check"><input v-model="form.requiere_vencimiento" type="checkbox" /> Requiere fecha de vencimiento</label>
          <label class="maint-check"><input v-model="form.activo" type="checkbox" /> Activo</label>
          <div class="maint-actions"><button class="btn" type="submit" :disabled="saving">{{ saving ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear tipo documental') }}</button><button v-if="editing" type="button" class="btn btn-ghost" @click="newItem">Cancelar</button></div>
          <p class="maint-muted">Los códigos y las categorías no se cambian después de crear un tipo para proteger los documentos existentes.</p>
        </form>
      </div>

      <RequirementsMaintainer v-else-if="activeTab==='requisitos'" :empresa-id="companyId" :can-create="canCreate" :can-edit="canEdit" />

      <div v-else-if="activeTab==='capacitaciones'" class="stack" style="min-width:0">
        <div class="card maint-content">
          <h2>Catálogo de capacitaciones y charlas</h2>
          <p class="maint-muted">Define cursos, inducciones ODI y charlas preventivas junto con su vigencia y horas.</p>
          <p v-if="error" role="alert" class="maint-error">{{ error }}</p>
          <p v-if="info" role="status" class="maint-success">{{ info }}</p>
          <p v-if="loadingPrevention">Cargando capacitaciones…</p>
          <div v-else-if="trainingTypes.length" class="maint-table-wrap">
            <table class="maint-table">
              <thead><tr><th>Nombre</th><th>Código</th><th>Vigencia (meses)</th><th>Duración (hrs)</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="tt in trainingTypes" :key="tt.id">
                  <td>{{ tt.nombre }}</td><td>{{ tt.codigo }}</td><td>{{ tt.vigencia_meses || 'Permanente' }}</td><td>{{ tt.horas_duracion }}</td><td>{{ tt.activo ? 'Activo' : 'Inactivo' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="maint-muted">No hay tipos de capacitación registrados todavía.</p>
        </div>

        <form v-if="canCreate" class="card maint-content" @submit.prevent="saveTrainingType">
          <h2>Nuevo tipo de capacitación</h2>
          <div class="maint-grid">
            <label>Código <input v-model.trim="trainingTypeForm.codigo" required placeholder="odi-general" /></label>
            <label>Nombre <input v-model.trim="trainingTypeForm.nombre" required placeholder="Inducción ODI General" /></label>
            <label>Vigencia en meses (opcional) <input v-model="trainingTypeForm.vigencia_meses" type="number" min="1" placeholder="12" /></label>
            <label>Horas de duración <input v-model="trainingTypeForm.horas_duracion" type="number" step="0.5" min="0.5" required /></label>
          </div>
          <button class="btn" type="submit" :disabled="saving">Crear tipo de capacitación</button>
        </form>

        <div class="card maint-content">
          <h2>Requisitos de capacitación por cargo y obra</h2>
          <div v-if="trainingReqs.length" class="maint-table-wrap">
            <table class="maint-table">
              <thead><tr><th>Capacitación</th><th>Cargo</th><th>Obra</th><th>Obligatorio</th></tr></thead>
              <tbody>
                <tr v-for="tr in trainingReqs" :key="tr.id">
                  <td>{{ tr.tipo_capacitacion_nombre }}</td>
                  <td>{{ tr.cargo_nombre || 'Todos los cargos' }}</td>
                  <td>{{ tr.obra_nombre || 'Todas las obras' }}</td>
                  <td>{{ tr.obligatorio ? 'Obligatoria' : 'Opcional' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="maint-muted">No hay requisitos de capacitación configurados.</p>
          <form v-if="canCreate && trainingTypes.length" style="margin-top:16px" @submit.prevent="saveTrainingReq">
            <h3>Asociar requisito de capacitación</h3>
            <div class="maint-grid">
              <label>Capacitación
                <select v-model="trainingReqForm.tipo_capacitacion_id" required>
                  <option value="">Selecciona…</option>
                  <option v-for="tt in trainingTypes" :key="tt.id" :value="tt.id">{{ tt.nombre }}</option>
                </select>
              </label>
              <label>Cargo (opcional)
                <select v-model="trainingReqForm.cargo_id">
                  <option value="">Todos los cargos</option>
                  <option v-for="c in cargos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                </select>
              </label>
              <label>Obra (opcional)
                <select v-model="trainingReqForm.obra_id">
                  <option value="">Todas las obras</option>
                  <option v-for="o in obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
                </select>
              </label>
            </div>
            <button class="btn" type="submit" :disabled="saving">Guardar requisito de capacitación</button>
          </form>
        </div>
      </div>

      <div v-else-if="activeTab==='epp'" class="stack" style="min-width:0">
        <div class="card maint-content">
          <h2>Categorías de Elementos de Protección Personal (EPP)</h2>
          <p class="maint-muted">Catálogo de EPP utilizado para registrar entregas y controlar reposiciones.</p>
          <p v-if="error" role="alert" class="maint-error">{{ error }}</p>
          <p v-if="info" role="status" class="maint-success">{{ info }}</p>
          <div v-if="eppCategories.length" class="maint-table-wrap">
            <table class="maint-table">
              <thead><tr><th>Nombre</th><th>Código</th><th>Vida útil (días)</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="cat in eppCategories" :key="cat.id">
                  <td>{{ cat.nombre }}</td><td>{{ cat.codigo }}</td><td>{{ cat.vida_util_dias || 'Segun desgaste' }}</td><td>{{ cat.activo ? 'Activo' : 'Inactivo' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="maint-muted">No hay categorías de EPP registradas todavía.</p>
        </div>
        <form v-if="canCreate" class="card maint-content" @submit.prevent="saveEppCategory">
          <h2>Nueva categoría de EPP</h2>
          <div class="maint-grid">
            <label>Código <input v-model.trim="eppCategoryForm.codigo" required placeholder="casco-seguridad" /></label>
            <label>Nombre <input v-model.trim="eppCategoryForm.nombre" required placeholder="Casco de seguridad dieléctrico" /></label>
            <label>Vida útil referencial (días) <input v-model="eppCategoryForm.vida_util_dias" type="number" min="1" placeholder="180" /></label>
            <label>Descripción <input v-model="eppCategoryForm.descripcion" placeholder="Observaciones técnicas" /></label>
          </div>
          <button class="btn" type="submit" :disabled="saving">Crear categoría de EPP</button>
        </form>
      </div>

      <div v-else-if="activeTab==='alertas'" class="stack" style="min-width:0">
        <form class="card maint-content" @submit.prevent="saveAlertConfig">
          <h2>Parámetros de alertas de vencimiento</h2>
          <p class="maint-muted">Configura los días de anticipación para generar alertas preventivas de documentos por vencer.</p>
          <p v-if="error" role="alert" class="maint-error">{{ error }}</p>
          <p v-if="info" role="status" class="maint-success">{{ info }}</p>
          <div class="maint-grid">
            <label>Umbral preventivo 1 (días)
              <input v-model.number="alertThresholds.u1" type="number" min="1" max="365" :disabled="!canConfigureAlerts || saving" />
            </label>
            <label>Umbral preventivo 2 (días)
              <input v-model.number="alertThresholds.u2" type="number" min="1" max="365" :disabled="!canConfigureAlerts || saving" />
            </label>
            <label>Umbral crítico 3 (días)
              <input v-model.number="alertThresholds.u3" type="number" min="1" max="365" :disabled="!canConfigureAlerts || saving" />
            </label>
          </div>
          <label class="maint-check"><input v-model="alertConfig.notificar_vencidos" type="checkbox" :disabled="!canConfigureAlerts || saving" /> Alertar documentos ya vencidos</label>
          <label class="maint-check"><input v-model="alertConfig.activo" type="checkbox" :disabled="!canConfigureAlerts || saving" /> Detección de alertas activa</label>
          <div class="maint-actions">
            <button v-if="canConfigureAlerts" class="btn" type="submit" :disabled="saving">Guardar y sincronizar alertas</button>
            <button type="button" class="btn btn-ghost" :disabled="loadingAlerts" @click="loadAlertsSection(true)">Detectar vencimientos ahora</button>
          </div>
        </form>

        <div class="card maint-content">
          <h2>Alertas activas de vencimiento</h2>
          <p class="maint-muted">
            Activas: <strong>{{ alertsSummary.total }}</strong> ·
            No leídas: <strong>{{ alertsSummary.no_leidas }}</strong> ·
            Vencidos: <strong>{{ alertsSummary.vencidos }}</strong> ·
            Próximos a vencer: <strong>{{ alertsSummary.por_vencer }}</strong>
          </p>
          <p v-if="loadingAlerts">Cargando alertas…</p>
          <p v-else-if="!alertsList.length">No hay alertas de vencimiento activas.</p>
          <div v-else class="maint-table-wrap">
            <table class="maint-table">
              <thead>
                <tr>
                  <th>Detalle / Documento</th>
                  <th>Nivel</th>
                  <th>Obra</th>
                  <th>Vencimiento</th>
                  <th>Estado alerta</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="al in alertsList" :key="al.id">
                  <td>{{ al.titulo }}</td>
                  <td>{{ al.nivel === 'vencido' ? 'Vencido' : `Por vencer (${al.umbral_dias}d)` }}</td>
                  <td>{{ al.obra_nombre || 'General' }}</td>
                  <td>{{ al.fecha_vencimiento }} ({{ al.dias_restantes < 0 ? `vencido hace ${Math.abs(al.dias_restantes)}d` : `${al.dias_restantes}d` }})</td>
                  <td>{{ al.leida ? 'Revisada' : 'Pendiente de lectura' }}</td>
                  <td>
                    <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="toggleAlertRead(al)">
                      {{ al.leida ? 'Marcar no leída' : 'Marcar revisada' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.maint-tab{display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px;cursor:pointer;border-radius:8px}.maint-tab.maint-selected{background:#f0ece5}.maint-layout{display:grid;grid-template-columns:210px minmax(0,1fr);gap:16px;align-items:start}.maint-aside,.maint-content{padding:20px}.maint-selected{padding:12px;border-radius:8px;background:#f0ece5;font-weight:600}.maint-muted{color:#697386;font-size:13px}.maint-tools,.maint-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.maint-tools{margin:15px 0}.maint-tools label{display:flex;gap:8px;align-items:center}.maint-table-wrap{overflow-x:auto}.maint-table{width:100%;border-collapse:collapse;font-size:13px}.maint-table td,.maint-table th{padding:10px 8px;border-bottom:1px solid #e1e4e8;text-align:left}.maint-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}.maint-grid label{display:flex;flex-direction:column;gap:5px}.maint-grid input,.maint-grid select{min-width:0;width:100%;padding:9px}.maint-check{display:flex;align-items:center;gap:8px;margin:10px 0}.maint-error{color:#b91c1c}.maint-success{color:#166534}@media(max-width:780px){.maint-layout,.maint-grid{grid-template-columns:1fr}}
</style>

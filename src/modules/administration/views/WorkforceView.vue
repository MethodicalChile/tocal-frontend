<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { state } from '../../../lib/state';
import { workforceApi } from '../services/workforceApi';
import { authorizationApi } from '../services/authorizationApi';

const empresaId = computed(() => state.activeCompanyId);
const loading = ref(false), saving = ref(false), error = ref(''), success = ref('');
const permissions = ref([]), workers = ref([]), cargos = ref([]), assignments = ref([]);
const tab = ref('trabajadores');
const selectedObra = ref('');
const workerFilters = ref({ q: '', activo: '', cargo_id: '' });
const editingWorkerId = ref(null);
const workerForm = ref({ nombres: '', apellido_paterno: '', apellido_materno: '', rut: '' });
const editingCargoId = ref(null);
const cargoForm = ref({ codigo: '', nombre: '', descripcion: '', activo: true });
const assignmentForm = ref({ trabajador_id: '', cargo_id: '', fecha_inicio: new Date().toISOString().slice(0, 10), observaciones: '' });
const changingAssignmentId = ref(null);
const changeCargoForm = ref({ cargo_id: '', fecha_cambio: new Date().toISOString().slice(0, 10) });

const globalPermissions = ref([]);
const obraPermissions = ref({});
const can = (permission, obraId = null) => {
  if (obraId && obraPermissions.value && Object.keys(obraPermissions.value).length) {
    if (globalPermissions.value.includes(permission)) return true;
    return Array.isArray(obraPermissions.value[String(obraId)]) && obraPermissions.value[String(obraId)].includes(permission);
  }
  return permissions.value.includes(permission);
};
const canRead = computed(() => can('empleados.ver'));
const canCreate = computed(() => can('empleados.crear'));
const canEditCompany = computed(() => can('empleados.editar'));
const canEdit = computed(() => can('empleados.editar', selectedObra.value || null));
const canDeactivate = computed(() => can('empleados.desactivar'));
const canSensitive = computed(() => can('empleados.ver_sensibles'));
const obraList = computed(() => state.obras || []);
const workerName = id => { const w = workers.value.find(x => String(x.id) === String(id)); return w ? `${w.nombres} ${w.apellido_paterno}` : `Trabajador ${id}`; };
const cargoName = id => cargos.value.find(x => String(x.id) === String(id))?.nombre || `Cargo ${id}`;
function message(e) { error.value = e?.message || 'No fue posible realizar la operación'; }

async function loadWorkers() {
  if (!canRead.value || !empresaId.value) return;
  try {
    workers.value = await workforceApi.trabajadores(empresaId.value, workerFilters.value);
  } catch (e) { message(e); }
}

async function reload() {
  error.value = ''; success.value = ''; loading.value = true;
  try {
    const info = await authorizationApi.myPermissions(empresaId.value);
    permissions.value = info.permissions || [];
    globalPermissions.value = Array.isArray(info.global_permissions) ? info.global_permissions : permissions.value;
    obraPermissions.value = info.obra_permissions && typeof info.obra_permissions === 'object' ? info.obra_permissions : {};
    if (!canRead.value) { workers.value = []; cargos.value = []; assignments.value = []; return; }
    [workers.value, cargos.value] = await Promise.all([
      workforceApi.trabajadores(empresaId.value, workerFilters.value),
      workforceApi.cargos(empresaId.value),
    ]);
    await loadAssignments();
  } catch (e) {
    permissions.value = []; globalPermissions.value = []; obraPermissions.value = {};
    workers.value = []; cargos.value = []; assignments.value = [];
    message(e);
  } finally { loading.value = false; }
}

async function loadAssignments() {
  assignments.value = [];
  if (!selectedObra.value || !canRead.value) return;
  try { assignments.value = await workforceApi.asignaciones(empresaId.value, selectedObra.value); }
  catch (e) { message(e); }
}

function startEditWorker(w) {
  editingWorkerId.value = w.id;
  workerForm.value = { nombres: w.nombres || '', apellido_paterno: w.apellido_paterno || '', apellido_materno: w.apellido_materno || '', rut: w.rut || '' };
}
function cancelEditWorker() {
  editingWorkerId.value = null;
  workerForm.value = { nombres: '', apellido_paterno: '', apellido_materno: '', rut: '' };
}

async function saveWorker() {
  saving.value = true; error.value = ''; success.value = '';
  try {
    const data = { ...workerForm.value };
    if (!canSensitive.value || !String(data.rut || '').trim()) delete data.rut;
    if (editingWorkerId.value) {
      if (!canEditCompany.value) return;
      await workforceApi.updateTrabajador(empresaId.value, editingWorkerId.value, data);
      success.value = 'Trabajador actualizado';
    } else {
      if (!canCreate.value) return;
      await workforceApi.createTrabajador(empresaId.value, data);
      success.value = 'Trabajador registrado';
    }
    cancelEditWorker();
    await loadWorkers();
  } catch (e) { message(e); } finally { saving.value = false; }
}

async function toggleWorkerActive(worker) {
  error.value = ''; success.value = '';
  try {
    if (worker.activo) {
      if (!canDeactivate.value || !window.confirm(`¿Desactivar a ${worker.nombres} ${worker.apellido_paterno}?`)) return;
      await workforceApi.deactivateTrabajador(empresaId.value, worker.id);
      success.value = 'Trabajador desactivado';
    } else {
      if (!canEditCompany.value) return;
      await workforceApi.updateTrabajador(empresaId.value, worker.id, { activo: true });
      success.value = 'Trabajador reactivado';
    }
    await loadWorkers();
  } catch (e) { message(e); }
}

function startEditCargo(c) {
  editingCargoId.value = c.id;
  cargoForm.value = { codigo: c.codigo || '', nombre: c.nombre || '', descripcion: c.descripcion || '', activo: Boolean(c.activo) };
}
function cancelEditCargo() {
  editingCargoId.value = null;
  cargoForm.value = { codigo: '', nombre: '', descripcion: '', activo: true };
}

async function saveCargo() {
  saving.value = true; error.value = ''; success.value = '';
  try {
    if (editingCargoId.value) {
      if (!canEditCompany.value) return;
      await workforceApi.updateCargo(empresaId.value, editingCargoId.value, cargoForm.value);
      success.value = 'Cargo actualizado';
    } else {
      if (!canCreate.value) return;
      await workforceApi.createCargo(empresaId.value, cargoForm.value);
      success.value = 'Cargo registrado';
    }
    cancelEditCargo();
    cargos.value = await workforceApi.cargos(empresaId.value);
  } catch (e) { message(e); } finally { saving.value = false; }
}

async function seedCatalogoTocal() {
  if (!canCreate.value) return;
  saving.value = true; error.value = ''; success.value = '';
  try {
    const res = await workforceApi.seedTocalCargos(empresaId.value);
    cargos.value = res.results || await workforceApi.cargos(empresaId.value);
    success.value = `Catálogo Tocal cargado (${res.creados || 0} nuevos, ${res.actualizados || 0} actualizados).`;
  } catch (e) { message(e); } finally { saving.value = false; }
}

async function saveAssignment() {
  if (!selectedObra.value || !canEdit.value) return;
  saving.value = true; error.value = ''; success.value = '';
  try {
    await workforceApi.createAsignacion(empresaId.value, selectedObra.value, {
      ...assignmentForm.value,
      trabajador_id: String(assignmentForm.value.trabajador_id),
      cargo_id: String(assignmentForm.value.cargo_id),
    });
    assignmentForm.value = { trabajador_id: '', cargo_id: '', fecha_inicio: new Date().toISOString().slice(0, 10), observaciones: '' };
    await loadAssignments();
    success.value = 'Asignación registrada';
  } catch (e) { message(e); } finally { saving.value = false; }
}

async function endAssignment(record) {
  if (!canEdit.value || record.fecha_fin || !selectedObra.value || !window.confirm('¿Finalizar esta asignación con fecha de hoy?')) return;
  error.value = ''; success.value = '';
  try {
    await workforceApi.updateAsignacion(empresaId.value, selectedObra.value, record.id, { fecha_fin: new Date().toISOString().slice(0, 10) });
    await loadAssignments();
    success.value = 'Asignación finalizada';
  } catch (e) { message(e); }
}

function startChangeCargo(record) {
  changingAssignmentId.value = record.id;
  changeCargoForm.value = { cargo_id: String(record.cargo_id), fecha_cambio: new Date().toISOString().slice(0, 10) };
}

async function submitChangeCargo(record) {
  if (!canEdit.value || !selectedObra.value) return;
  saving.value = true; error.value = ''; success.value = '';
  try {
    await workforceApi.updateAsignacion(empresaId.value, selectedObra.value, record.id, {
      cargo_id: String(changeCargoForm.value.cargo_id),
      fecha_cambio: changeCargoForm.value.fecha_cambio,
    });
    changingAssignmentId.value = null;
    await loadAssignments();
    success.value = 'Cambio de cargo registrado conservando historial.';
  } catch (e) { message(e); } finally { saving.value = false; }
}

watch(selectedObra, loadAssignments);
onMounted(() => { selectedObra.value = obraList.value[0]?.id || ''; if (empresaId.value) reload(); });
watch(empresaId, () => {
  workers.value = []; cargos.value = []; assignments.value = []; permissions.value = [];
  selectedObra.value = obraList.value[0]?.id || '';
  if (empresaId.value) reload();
});
</script>
<template>
<section class="stack" style="max-width:1200px">
  <header><h1>Trabajadores y cargos</h1><p>Administración laboral por empresa, catálogo de perfiles Tocal y asignaciones históricas por obra.</p></header>
  <p v-if="!empresaId" role="alert" class="card" style="padding:16px">No tienes una empresa activa autorizada.</p>
  <p v-if="error" role="alert" style="color:#b91c1c">{{ error }}</p>
  <p v-if="success" role="status" style="color:#166534">{{ success }}</p>
  <div v-if="empresaId" class="stack-sm">
    <div><button class="btn btn-ghost" type="button" :disabled="loading" @click="reload">{{ loading ? 'Cargando…' : 'Actualizar datos' }}</button></div>
    <p v-if="!loading && !canRead" class="card" style="padding:16px">No cuentas con permiso <code>empleados.ver</code>.</p>
    <template v-if="canRead">
      <div class="pills" role="tablist" aria-label="Gestión laboral">
        <button v-for="item in [{id:'trabajadores',label:'Trabajadores'},{id:'cargos',label:'Cargos y perfiles'},{id:'asignaciones',label:'Asignaciones por obra'}]" :key="item.id" class="pill" :aria-selected="tab===item.id" role="tab" @click="tab=item.id">{{item.label}}</button>
      </div>
      <template v-if="tab==='trabajadores'">
        <form v-if="canCreate || (editingWorkerId && canEditCompany)" class="card stack-sm" style="padding:20px" @submit.prevent="saveWorker">
          <h2>{{ editingWorkerId ? 'Editar trabajador' : 'Registrar trabajador' }}</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
            <label>Nombres <input v-model.trim="workerForm.nombres" required maxlength="120"></label>
            <label>Apellido paterno <input v-model.trim="workerForm.apellido_paterno" required maxlength="120"></label>
            <label>Apellido materno <input v-model.trim="workerForm.apellido_materno" maxlength="120"></label>
            <label v-if="canSensitive">RUT (opcional) <input v-model.trim="workerForm.rut" maxlength="20" autocomplete="off"></label>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" :disabled="saving" type="submit">{{ saving ? 'Guardando…' : (editingWorkerId ? 'Guardar cambios' : 'Registrar trabajador') }}</button>
            <button v-if="editingWorkerId" class="btn btn-ghost" type="button" @click="cancelEditWorker">Cancelar</button>
          </div>
        </form>
        <div class="card stack-sm" style="padding:20px">
          <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
            <h2 style="margin:0">Trabajadores registrados ({{ workers.length }})</h2>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
              <label style="font-size:0.85rem">Buscar <input v-model.trim="workerFilters.q" placeholder="Nombre o apellido…" @keyup.enter="loadWorkers"></label>
              <label style="font-size:0.85rem">Estado
                <select v-model="workerFilters.activo" @change="loadWorkers">
                  <option value="">Todos</option>
                  <option value="true">Activos</option>
                  <option value="false">Inactivos</option>
                </select>
              </label>
              <label style="font-size:0.85rem">Cargo
                <select v-model="workerFilters.cargo_id" @change="loadWorkers">
                  <option value="">Todos</option>
                  <option v-for="c in cargos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
                </select>
              </label>
              <button class="btn btn-ghost btn-sm" type="button" @click="loadWorkers">Filtrar</button>
            </div>
          </div>
          <p v-if="!workers.length">No hay trabajadores que coincidan con el filtro.</p>
          <div v-else style="overflow-x:auto">
            <table style="width:100%;text-align:left">
              <thead><tr><th>Nombre</th><th>Estado</th><th v-if="canSensitive">RUT</th><th>Acciones</th></tr></thead>
              <tbody>
                <tr v-for="worker in workers" :key="worker.id">
                  <td><RouterLink :to="{ name: 'trabajador-detalle', params: { trabajadorId: worker.id } }">{{worker.nombres}} {{worker.apellido_paterno}} {{worker.apellido_materno}}</RouterLink></td>
                  <td>{{worker.activo?'Activo':'Inactivo'}}</td>
                  <td v-if="canSensitive">{{worker.rut||'—'}}</td>
                  <td style="display:flex;gap:6px;flex-wrap:wrap">
                    <RouterLink class="btn btn-ghost btn-sm" :to="{ name: 'trabajador-detalle', params: { trabajadorId: worker.id } }">Ver ficha</RouterLink>
                    <button v-if="canEditCompany" class="btn btn-ghost btn-sm" type="button" @click="startEditWorker(worker)">Editar</button>
                    <button v-if="(worker.activo && canDeactivate) || (!worker.activo && canEditCompany)" class="btn btn-ghost btn-sm" type="button" @click="toggleWorkerActive(worker)">{{ worker.activo ? 'Desactivar' : 'Reactivar' }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <template v-if="tab==='cargos'">
        <form v-if="canCreate || (editingCargoId && canEditCompany)" class="card stack-sm" style="padding:20px" @submit.prevent="saveCargo">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <h2 style="margin:0">{{ editingCargoId ? 'Editar cargo' : 'Crear cargo' }}</h2>
            <button v-if="canCreate" class="btn btn-ghost btn-sm" type="button" :disabled="saving" @click="seedCatalogoTocal">Cargar catálogo de perfiles Tocal (15 cargos)</button>
          </div>
          <label>Código <input v-model.trim="cargoForm.codigo" required></label>
          <label>Nombre <input v-model.trim="cargoForm.nombre" required></label>
          <label>Descripción <textarea v-model.trim="cargoForm.descripcion" rows="2"></textarea></label>
          <label v-if="editingCargoId" style="display:flex;align-items:center;gap:8px"><input v-model="cargoForm.activo" type="checkbox"> Cargo activo</label>
          <div style="display:flex;gap:8px">
            <button type="submit" :disabled="saving" class="btn">{{ editingCargoId ? 'Actualizar cargo' : 'Guardar cargo' }}</button>
            <button v-if="editingCargoId" type="button" class="btn btn-ghost" @click="cancelEditCargo">Cancelar</button>
          </div>
        </form>
        <div class="card stack-sm" style="padding:20px">
          <h2>Catálogo empresarial de cargos ({{ cargos.length }})</h2>
          <p v-if="!cargos.length">No hay cargos registrados.</p>
          <div v-else style="overflow-x:auto">
            <table style="width:100%;text-align:left">
              <thead><tr><th>Cargo</th><th>Código</th><th>Descripción</th><th>Estado</th><th>Acción</th></tr></thead>
              <tbody>
                <tr v-for="cargo in cargos" :key="cargo.id">
                  <td><strong>{{cargo.nombre}}</strong></td>
                  <td><code>{{cargo.codigo}}</code></td>
                  <td><small>{{cargo.descripcion || '—'}}</small></td>
                  <td>{{cargo.activo?'Activo':'Inactivo'}}</td>
                  <td><button v-if="canEditCompany" class="btn btn-ghost btn-sm" type="button" @click="startEditCargo(cargo)">Editar</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <template v-if="tab==='asignaciones'">
        <div class="card stack-sm" style="padding:20px"><h2>Asignaciones por obra</h2><label>Obra <select v-model="selectedObra"><option value="">Seleccionar obra</option><option v-for="obra in obraList" :key="obra.id" :value="obra.id">{{obra.nombre}}</option></select></label><p v-if="!obraList.length">No tienes obras asignadas en tu sesión.</p></div>
        <form v-if="selectedObra && canEdit" class="card stack-sm" style="padding:20px" @submit.prevent="saveAssignment"><h2>Asignar trabajador</h2><label>Trabajador <select v-model="assignmentForm.trabajador_id" required><option value="">Seleccionar</option><option v-for="worker in workers.filter(w=>w.activo)" :key="worker.id" :value="worker.id">{{worker.nombres}} {{worker.apellido_paterno}}</option></select></label><label>Cargo <select v-model="assignmentForm.cargo_id" required><option value="">Seleccionar</option><option v-for="cargo in cargos.filter(c=>c.activo)" :key="cargo.id" :value="cargo.id">{{cargo.nombre}}</option></select></label><label>Inicio <input v-model="assignmentForm.fecha_inicio" type="date" required></label><label>Observaciones <textarea v-model="assignmentForm.observaciones" rows="2"></textarea></label><button class="btn" type="submit" :disabled="saving">Crear asignación</button></form>
        <div v-if="selectedObra" class="card" style="padding:20px">
          <h2>Historial de asignaciones</h2>
          <p v-if="!assignments.length">No hay asignaciones para esta obra.</p>
          <div v-else style="overflow-x:auto">
            <table style="width:100%;text-align:left">
              <thead><tr><th>Trabajador</th><th>Cargo</th><th>Inicio</th><th>Término</th><th>Acciones</th></tr></thead>
              <tbody>
                <template v-for="record in assignments" :key="record.id">
                  <tr>
                    <td>{{record.trabajador_nombre || workerName(record.trabajador_id)}}</td>
                    <td>{{record.cargo_nombre || cargoName(record.cargo_id)}}</td>
                    <td>{{record.fecha_inicio}}</td>
                    <td>{{record.fecha_fin||'Vigente'}}</td>
                    <td style="display:flex;gap:6px;flex-wrap:wrap">
                      <button v-if="canEdit && !record.fecha_fin" class="btn btn-ghost btn-sm" type="button" @click="startChangeCargo(record)">Cambiar cargo</button>
                      <button v-if="canEdit && !record.fecha_fin" class="btn btn-ghost btn-sm" type="button" @click="endAssignment(record)">Finalizar</button>
                    </td>
                  </tr>
                  <tr v-if="changingAssignmentId === record.id">
                    <td colspan="5" style="background:rgba(148,163,184,0.08);padding:10px">
                      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                        <strong>Nuevo cargo:</strong>
                        <select v-model="changeCargoForm.cargo_id">
                          <option v-for="c in cargos.filter(x=>x.activo)" :key="c.id" :value="String(c.id)">{{c.nombre}}</option>
                        </select>
                        <input v-model="changeCargoForm.fecha_cambio" type="date" />
                        <button class="btn btn-sm" type="button" :disabled="saving" @click="submitChangeCargo(record)">Confirmar cambio</button>
                        <button class="btn btn-ghost btn-sm" type="button" @click="changingAssignmentId = null">Cancelar</button>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </div>
</section>
</template>

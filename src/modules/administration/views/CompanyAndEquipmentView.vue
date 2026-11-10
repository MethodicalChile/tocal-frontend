<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { state, can } from '../../../lib/state';
import { documentsApi } from '../services/documentsApi';
import { worksApi } from '../services/worksApi';

const companyId = computed(() => state.activeCompanyId);
const canCreateDoc = computed(() => can('documentos.crear'));
const canApproveDoc = computed(() => can('documentos.aprobar') || can('documentos.editar'));
const canUploadDoc = computed(() => can('documentos.subir') || can('documentos.crear'));

const activeTab = ref('empresa');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const info = ref('');

// Obras y tipos documentales
const obras = ref([]);
const docTypes = ref([]);

// Etapa 7: Documentos de empresa
const companyDocs = ref([]);
const companyCompliance = ref(null);
const selectedCompanyDoc = ref(null);
const companyDocFiles = ref([]);
const companyDocHistory = ref([]);
const companyDocForm = ref({ tipo_documento_id: '', obra_id: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' });
const companyReviewObs = ref('');

// Etapa 8: Equipos y maquinaria
const equipmentList = ref([]);
const selectedEquipment = ref(null);
const equipmentAssignments = ref([]);
const equipmentDocs = ref([]);
const equipmentCompliance = ref(null);
const selectedEquipmentDoc = ref(null);
const equipmentDocFiles = ref([]);
const equipmentForm = ref({ codigo: '', nombre: '', tipo_equipo: 'Maquinaria', marca: '', modelo: '', patente_o_serie: '', estado: 'operativo' });
const assignmentForm = ref({ obra_id: '', responsable: '', fecha_inicio: '', fecha_fin: '', observaciones: '' });
const equipmentDocForm = ref({ tipo_documento_id: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' });
const equipmentReviewObs = ref('');

const companyDocTypes = computed(() => docTypes.value.filter(t => t.categoria === 'empresa' && t.activo));
const equipmentDocTypes = computed(() => docTypes.value.filter(t => t.categoria === 'equipo' && t.activo));

async function loadAll() {
  const id = companyId.value;
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const [typesResp, obrasResp, cDocs, cComp, eqList] = await Promise.all([
      documentsApi.types(id).catch(() => []),
      worksApi.listByCompany(id).catch(() => ({ results: [] })),
      documentsApi.companyDocuments(id).catch(() => []),
      documentsApi.companyCompliance(id).catch(() => null),
      documentsApi.equipmentList(id).catch(() => []),
    ]);
    docTypes.value = typesResp;
    obras.value = obrasResp.results || [];
    companyDocs.value = cDocs;
    companyCompliance.value = cComp;
    equipmentList.value = eqList;
    if (eqList.length && !selectedEquipment.value) {
      await selectEquipment(eqList[0]);
    }
  } catch (e) {
    error.value = e.message || 'No se pudo cargar la información.';
  } finally {
    loading.value = false;
  }
}

async function selectCompanyDocItem(doc) {
  selectedCompanyDoc.value = doc;
  companyReviewObs.value = doc.observaciones || '';
  if (!companyId.value || !doc) return;
  try {
    const resp = await documentsApi.companyDocumentFiles(companyId.value, doc.id);
    companyDocFiles.value = resp.results || [];
    companyDocHistory.value = resp.revisiones || [];
  } catch (e) {
    error.value = e.message;
  }
}

async function createCompanyDoc() {
  if (!companyId.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.createCompanyDocument(companyId.value, {
      tipo_documento_id: companyDocForm.value.tipo_documento_id,
      obra_id: companyDocForm.value.obra_id || null,
      fecha_emision: companyDocForm.value.fecha_emision || null,
      fecha_vencimiento: companyDocForm.value.fecha_vencimiento || null,
      observaciones: companyDocForm.value.observaciones,
    });
    companyDocForm.value = { tipo_documento_id: '', obra_id: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' };
    await loadAll();
    info.value = 'Documento de empresa registrado.';
  } catch (e) {
    error.value = e.message || 'No se pudo crear el documento de empresa.';
  } finally {
    saving.value = false;
  }
}

async function uploadCompanyDocFile(event) {
  const file = event.target?.files?.[0];
  if (!file || !companyId.value || !selectedCompanyDoc.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.uploadCompanyDocument(companyId.value, selectedCompanyDoc.value.id, file);
    await loadAll();
    const updated = companyDocs.value.find(d => d.id === selectedCompanyDoc.value.id);
    if (updated) await selectCompanyDocItem(updated);
    info.value = 'Evidencia cargada en documento de empresa.';
  } catch (e) {
    error.value = e.message || 'No se pudo subir el archivo.';
  } finally {
    saving.value = false;
    if (event.target) event.target.value = '';
  }
}

async function reviewCompanyDoc(estado) {
  if (!companyId.value || !selectedCompanyDoc.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.reviewCompanyDocument(companyId.value, selectedCompanyDoc.value.id, {
      estado,
      observaciones: companyReviewObs.value,
    });
    await loadAll();
    const updated = companyDocs.value.find(d => d.id === selectedCompanyDoc.value.id);
    if (updated) await selectCompanyDocItem(updated);
    info.value = `Estado del documento actualizado a ${estado}.`;
  } catch (e) {
    error.value = e.message || 'No fue posible actualizar la revisión.';
  } finally {
    saving.value = false;
  }
}

async function selectEquipment(eq) {
  selectedEquipment.value = eq;
  selectedEquipmentDoc.value = null;
  equipmentDocFiles.value = [];
  if (!companyId.value || !eq) return;
  try {
    const [asigs, docs, comp] = await Promise.all([
      documentsApi.equipmentAssignments(companyId.value, eq.id).catch(() => []),
      documentsApi.equipmentDocuments(companyId.value, eq.id).catch(() => []),
      documentsApi.equipmentCompliance(companyId.value, eq.id).catch(() => null),
    ]);
    equipmentAssignments.value = asigs;
    equipmentDocs.value = docs;
    equipmentCompliance.value = comp;
  } catch (e) {
    error.value = e.message;
  }
}

async function saveNewEquipment() {
  if (!companyId.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    const created = await documentsApi.createEquipment(companyId.value, {
      codigo: equipmentForm.value.codigo.trim().toLowerCase(),
      nombre: equipmentForm.value.nombre.trim(),
      tipo_equipo: equipmentForm.value.tipo_equipo,
      marca: equipmentForm.value.marca,
      modelo: equipmentForm.value.modelo,
      patente_o_serie: equipmentForm.value.patente_o_serie,
      estado: equipmentForm.value.estado,
    });
    equipmentForm.value = { codigo: '', nombre: '', tipo_equipo: 'Maquinaria', marca: '', modelo: '', patente_o_serie: '', estado: 'operativo' };
    await loadAll();
    await selectEquipment(created);
    info.value = 'Equipo registrado en el catálogo.';
  } catch (e) {
    error.value = e.message || 'No se pudo registrar el equipo.';
  } finally {
    saving.value = false;
  }
}

async function saveEquipmentAssignment() {
  if (!companyId.value || !selectedEquipment.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.createEquipmentAssignment(companyId.value, selectedEquipment.value.id, {
      obra_id: assignmentForm.value.obra_id,
      responsable: assignmentForm.value.responsable,
      fecha_inicio: assignmentForm.value.fecha_inicio,
      fecha_fin: assignmentForm.value.fecha_fin || null,
      observaciones: assignmentForm.value.observaciones,
    });
    assignmentForm.value = { obra_id: '', responsable: '', fecha_inicio: '', fecha_fin: '', observaciones: '' };
    await selectEquipment(selectedEquipment.value);
    info.value = 'Asignación de equipo a obra registrada.';
  } catch (e) {
    error.value = e.message || 'No se pudo registrar la asignación.';
  } finally {
    saving.value = false;
  }
}

async function saveEquipmentDocument() {
  if (!companyId.value || !selectedEquipment.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.createEquipmentDocument(companyId.value, selectedEquipment.value.id, {
      tipo_documento_id: equipmentDocForm.value.tipo_documento_id,
      fecha_emision: equipmentDocForm.value.fecha_emision || null,
      fecha_vencimiento: equipmentDocForm.value.fecha_vencimiento || null,
      observaciones: equipmentDocForm.value.observaciones,
    });
    equipmentDocForm.value = { tipo_documento_id: '', fecha_emision: '', fecha_vencimiento: '', observaciones: '' };
    await selectEquipment(selectedEquipment.value);
    info.value = 'Documento de equipo registrado.';
  } catch (e) {
    error.value = e.message || 'No se pudo crear el documento del equipo.';
  } finally {
    saving.value = false;
  }
}

async function selectEquipmentDocItem(doc) {
  selectedEquipmentDoc.value = doc;
  equipmentReviewObs.value = doc.observaciones || '';
  if (!companyId.value || !selectedEquipment.value || !doc) return;
  try {
    const resp = await documentsApi.equipmentDocumentFiles(companyId.value, selectedEquipment.value.id, doc.id);
    equipmentDocFiles.value = resp.results || [];
  } catch (e) {
    error.value = e.message;
  }
}

async function uploadEquipmentDocFile(event) {
  const file = event.target?.files?.[0];
  if (!file || !companyId.value || !selectedEquipment.value || !selectedEquipmentDoc.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.uploadEquipmentDocument(companyId.value, selectedEquipment.value.id, selectedEquipmentDoc.value.id, file);
    await selectEquipment(selectedEquipment.value);
    const updated = equipmentDocs.value.find(d => d.id === selectedEquipmentDoc.value.id);
    if (updated) await selectEquipmentDocItem(updated);
    info.value = 'Evidencia de equipo cargada.';
  } catch (e) {
    error.value = e.message || 'No se pudo cargar el archivo.';
  } finally {
    saving.value = false;
    if (event.target) event.target.value = '';
  }
}

async function reviewEquipmentDoc(estado) {
  if (!companyId.value || !selectedEquipment.value || !selectedEquipmentDoc.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.reviewEquipmentDocument(companyId.value, selectedEquipment.value.id, selectedEquipmentDoc.value.id, {
      estado,
      observaciones: equipmentReviewObs.value,
    });
    await selectEquipment(selectedEquipment.value);
    const updated = equipmentDocs.value.find(d => d.id === selectedEquipmentDoc.value.id);
    if (updated) await selectEquipmentDocItem(updated);
    info.value = `Estado del documento de equipo actualizado a ${estado}.`;
  } catch (e) {
    error.value = e.message || 'No fue posible actualizar la revisión.';
  } finally {
    saving.value = false;
  }
}

watch(companyId, () => {
  selectedCompanyDoc.value = null;
  selectedEquipment.value = null;
  loadAll();
});
onMounted(loadAll);
</script>

<template>
  <section class="stack" style="max-width:1200px">
    <header class="stack-sm">
      <h1>Documentos de empresa, equipos y maquinaria</h1>
      <p>Control documental corporativo, catálogo de maquinaria, asignaciones a obra y cumplimiento operacional.</p>
    </header>

    <div class="pills" style="display:flex;gap:8px">
      <button type="button" class="pill" :aria-selected="activeTab==='empresa'" @click="activeTab='empresa'">Documentos de empresa</button>
      <button type="button" class="pill" :aria-selected="activeTab==='equipos'" @click="activeTab='equipos'">Equipos y maquinaria</button>
    </div>

    <p v-if="error" role="alert" class="notice bad">{{ error }}</p>
    <p v-if="info" role="status" class="notice">{{ info }}</p>

    <!-- ETAPA 7: DOCUMENTOS DE EMPRESA -->
    <div v-if="activeTab==='empresa'" class="stack">
      <div v-if="companyCompliance" class="stat-grid cols-4">
        <div class="card" style="padding:16px"><small class="muted">Cumplimiento empresa</small><h2>{{ companyCompliance.porcentaje_cumplimiento }}%</h2></div>
        <div class="card" style="padding:16px"><small class="muted">Estado global</small><h2>{{ companyCompliance.estado_global }}</h2></div>
        <div class="card" style="padding:16px"><small class="muted">Aprobados vigentes</small><h2>{{ companyCompliance.cumplidos }} / {{ companyCompliance.total_obligatorios }}</h2></div>
        <div class="card" style="padding:16px"><small class="muted">Faltantes / Vencidos</small><h2>{{ (companyCompliance.resumen?.faltantes || 0) + (companyCompliance.resumen?.vencidos || 0) }}</h2></div>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:start">
        <div class="card stack-sm" style="padding:20px">
          <h2>Expediente documental de la empresa</h2>
          <p v-if="loading">Cargando documentos…</p>
          <p v-else-if="!companyDocs.length" class="muted">No hay documentos corporativos registrados.</p>
          <table v-else style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
            <thead><tr><th>Tipo documental</th><th>Alcance</th><th>Vencimiento</th><th>Estado</th><th>Evidencias</th><th></th></tr></thead>
            <tbody>
              <tr v-for="doc in companyDocs" :key="doc.id">
                <td>{{ doc.tipo_documento_nombre }}</td>
                <td>{{ doc.obra_nombre || 'General empresa' }}</td>
                <td>{{ doc.fecha_vencimiento || '—' }}</td>
                <td>{{ doc.estado }}</td>
                <td>{{ doc.tiene_evidencia ? `${doc.total_archivos} archivo(s)` : 'Sin archivo' }}</td>
                <td><button type="button" class="btn btn-ghost btn-sm" @click="selectCompanyDocItem(doc)">Gestionar</button></td>
              </tr>
            </tbody>
          </table>

          <form v-if="canCreateDoc" class="stack-sm" style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:16px" @submit.prevent="createCompanyDoc">
            <h3>Registrar documento de empresa</h3>
            <p v-if="!companyDocTypes.length" class="muted">Primero registra un tipo documental de categoría «Empresa» en Ajustes y mantenedores.</p>
            <template v-else>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <label class="stack-sm">Tipo documental
                  <select v-model="companyDocForm.tipo_documento_id" required style="padding:8px">
                    <option value="">Selecciona…</option>
                    <option v-for="t in companyDocTypes" :key="t.id" :value="t.id">{{ t.nombre }}</option>
                  </select>
                </label>
                <label class="stack-sm">Obra asociada (opcional)
                  <select v-model="companyDocForm.obra_id" style="padding:8px">
                    <option value="">General empresa</option>
                    <option v-for="o in obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
                  </select>
                </label>
                <label class="stack-sm">Fecha emisión <input v-model="companyDocForm.fecha_emision" type="date" style="padding:8px" /></label>
                <label class="stack-sm">Fecha vencimiento <input v-model="companyDocForm.fecha_vencimiento" type="date" style="padding:8px" /></label>
              </div>
              <input v-model="companyDocForm.observaciones" placeholder="Observaciones" style="padding:8px" />
              <button class="btn" type="submit" :disabled="saving">Crear documento empresarial</button>
            </template>
          </form>
        </div>

        <div class="card stack-sm" style="padding:20px">
          <h2>Evidencias y revisión</h2>
          <p v-if="!selectedCompanyDoc" class="muted">Selecciona un documento de empresa para subir archivos, descargar o aprobar.</p>
          <template v-else>
            <h3>{{ selectedCompanyDoc.tipo_documento_nombre }} ({{ selectedCompanyDoc.estado }})</h3>
            <label v-if="canUploadDoc" class="btn btn-ghost btn-sm" style="display:inline-block;cursor:pointer">
              Subir evidencia (PDF/Imagen/Office)
              <input type="file" style="display:none" @change="uploadCompanyDocFile" />
            </label>
            <ul v-if="companyDocFiles.length">
              <li v-for="f in companyDocFiles" :key="f.id" style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
                <span>v{{ f.version }} · {{ f.nombre_original }}</span>
                <button type="button" class="btn btn-ghost btn-sm" @click="documentsApi.downloadCompanyDocument(companyId, selectedCompanyDoc.id, f.id, f.nombre_original)">Descargar</button>
              </li>
            </ul>
            <p v-else class="muted">Sin archivos cargados. No es posible aprobar sin evidencia.</p>

            <div v-if="canApproveDoc" class="stack-sm" style="border-top:1px solid #e5e7eb;padding-top:12px">
              <label class="stack-sm">Observación de revisión
                <input v-model="companyReviewObs" placeholder="Obligatoria al rechazar" style="padding:8px" />
              </label>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn btn-sm" :disabled="saving || !selectedCompanyDoc.tiene_evidencia" @click="reviewCompanyDoc('aprobado')">Aprobar</button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="reviewCompanyDoc('en_revision')">En revisión</button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="reviewCompanyDoc('rechazado')">Rechazar</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- ETAPA 8: EQUIPOS Y MAQUINARIA -->
    <div v-else-if="activeTab==='equipos'" class="stack">
      <div style="display:grid;grid-template-columns:1fr 1.3fr;gap:18px;align-items:start">
        <div class="card stack-sm" style="padding:20px">
          <h2>Catálogo de equipos y maquinaria</h2>
          <p v-if="!equipmentList.length" class="muted">No hay equipos registrados en la empresa.</p>
          <table v-else style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
            <thead><tr><th>Nombre</th><th>Código / Patente</th><th>Tipo</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr v-for="eq in equipmentList" :key="eq.id">
                <td>{{ eq.nombre }}</td>
                <td>{{ eq.codigo }} {{ eq.patente_o_serie ? `· ${eq.patente_o_serie}` : '' }}</td>
                <td>{{ eq.tipo_equipo }}</td>
                <td>{{ eq.estado }}</td>
                <td><button type="button" class="btn btn-ghost btn-sm" @click="selectEquipment(eq)">Ver ficha</button></td>
              </tr>
            </tbody>
          </table>

          <form v-if="canCreateDoc" class="stack-sm" style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:16px" @submit.prevent="saveNewEquipment">
            <h3>Registrar equipo o maquinaria</h3>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <input v-model.trim="equipmentForm.codigo" required placeholder="Código (ej. exc-01)" style="padding:8px" />
              <input v-model.trim="equipmentForm.nombre" required placeholder="Retroexcavadora CAT 416" style="padding:8px" />
              <input v-model="equipmentForm.tipo_equipo" placeholder="Tipo (Maquinaria, Vehículo…)" style="padding:8px" />
              <input v-model="equipmentForm.patente_o_serie" placeholder="Patente o N° serie" style="padding:8px" />
              <input v-model="equipmentForm.marca" placeholder="Marca" style="padding:8px" />
              <input v-model="equipmentForm.modelo" placeholder="Modelo" style="padding:8px" />
            </div>
            <button class="btn" type="submit" :disabled="saving">Crear equipo</button>
          </form>
        </div>

        <div class="card stack-sm" style="padding:20px">
          <template v-if="!selectedEquipment">
            <p class="muted">Selecciona un equipo para gestionar sus asignaciones a obras, documentos y cumplimiento.</p>
          </template>
          <template v-else>
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap">
              <div>
                <h2 style="margin:0">{{ selectedEquipment.nombre }} ({{ selectedEquipment.codigo }})</h2>
                <p class="muted" style="margin:4px 0 0">{{ selectedEquipment.tipo_equipo }} · Estado: {{ selectedEquipment.estado }}</p>
              </div>
              <div v-if="equipmentCompliance" class="card" style="padding:10px 14px">
                <small class="muted">Cumplimiento equipo</small>
                <div><strong>{{ equipmentCompliance.porcentaje_cumplimiento }}% ({{ equipmentCompliance.estado_global }})</strong></div>
              </div>
            </div>

            <h3>Asignaciones históricas a obras</h3>
            <table v-if="equipmentAssignments.length" style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
              <thead><tr><th>Obra</th><th>Responsable</th><th>Inicio</th><th>Término</th></tr></thead>
              <tbody>
                <tr v-for="a in equipmentAssignments" :key="a.id">
                  <td>{{ a.obra_nombre }}</td>
                  <td>{{ a.responsable || '—' }}</td>
                  <td>{{ a.fecha_inicio }}</td>
                  <td>{{ a.fecha_fin || 'Vigente' }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted">Sin asignaciones a obras registradas.</p>

            <form v-if="canCreateDoc && obras.length" class="stack-sm" @submit.prevent="saveEquipmentAssignment">
              <h4>Asignar equipo a obra</h4>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                <select v-model="assignmentForm.obra_id" required style="padding:8px">
                  <option value="">Selecciona obra…</option>
                  <option v-for="o in obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
                </select>
                <input v-model="assignmentForm.fecha_inicio" type="date" required style="padding:8px" />
                <input v-model="assignmentForm.responsable" placeholder="Responsable / Operador" style="padding:8px" />
              </div>
              <button class="btn btn-sm" type="submit" :disabled="saving">Asignar a obra</button>
            </form>

            <h3 style="margin-top:14px">Documentación del equipo</h3>
            <table v-if="equipmentDocs.length" style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
              <thead><tr><th>Documento</th><th>Vencimiento</th><th>Estado</th><th>Evidencia</th><th></th></tr></thead>
              <tbody>
                <tr v-for="d in equipmentDocs" :key="d.id">
                  <td>{{ d.tipo_documento_nombre }}</td>
                  <td>{{ d.fecha_vencimiento || '—' }}</td>
                  <td>{{ d.estado }}</td>
                  <td>{{ d.tiene_evidencia ? `${d.total_archivos} archivo(s)` : 'Sin archivo' }}</td>
                  <td><button type="button" class="btn btn-ghost btn-sm" @click="selectEquipmentDocItem(d)">Revisar</button></td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted">Sin documentos registrados para este equipo.</p>

            <form v-if="canCreateDoc && equipmentDocTypes.length" class="stack-sm" @submit.prevent="saveEquipmentDocument">
              <h4>Registrar documento del equipo</h4>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <select v-model="equipmentDocForm.tipo_documento_id" required style="padding:8px">
                  <option value="">Tipo documental (Equipo)…</option>
                  <option v-for="t in equipmentDocTypes" :key="t.id" :value="t.id">{{ t.nombre }}</option>
                </select>
                <input v-model="equipmentDocForm.fecha_vencimiento" type="date" style="padding:8px" />
              </div>
              <button class="btn btn-sm" type="submit" :disabled="saving">Crear documento de equipo</button>
            </form>

            <div v-if="selectedEquipmentDoc" class="card stack-sm" style="padding:14px;background:#f9fafb">
              <h4>Evidencias y aprobación: {{ selectedEquipmentDoc.tipo_documento_nombre }}</h4>
              <label v-if="canUploadDoc" class="btn btn-ghost btn-sm" style="display:inline-block;cursor:pointer">
                Subir archivo de equipo
                <input type="file" style="display:none" @change="uploadEquipmentDocFile" />
              </label>
              <ul v-if="equipmentDocFiles.length">
                <li v-for="f in equipmentDocFiles" :key="f.id" style="display:flex;justify-content:space-between;padding:4px 0">
                  <span>v{{ f.version }} · {{ f.nombre_original }}</span>
                  <button type="button" class="btn btn-ghost btn-sm" @click="documentsApi.downloadEquipmentDocument(companyId, selectedEquipment.id, selectedEquipmentDoc.id, f.id, f.nombre_original)">Descargar</button>
                </li>
              </ul>
              <div v-if="canApproveDoc" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input v-model="equipmentReviewObs" placeholder="Observación de revisión" style="padding:6px;flex:1" />
                <button type="button" class="btn btn-sm" :disabled="saving || !selectedEquipmentDoc.tiene_evidencia" @click="reviewEquipmentDoc('aprobado')">Aprobar</button>
                <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="reviewEquipmentDoc('rechazado')">Rechazar</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>


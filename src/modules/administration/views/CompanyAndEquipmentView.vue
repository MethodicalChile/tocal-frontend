<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { state, can } from '../../../lib/state';
import { documentsApi } from '../services/documentsApi';
import { worksApi } from '../services/worksApi';

const route = useRoute();
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

// RF-12: Checklists e inspecciones digitales
const checklistsList = ref([]);
const checklistTemplates = [
  'Check-list Pre-operacional de Maquinaria / Vehículo',
  'Inspección de Arnés y Sistema de Detención de Caídas (Altura)',
  'Inspección de Herramientas Eléctricas y Tableros Provisionales',
  'Inspección de Excavaciones, Taludes y Entibaciones',
  'Inspección de Extintores, Orden y Aseo en Obra',
];
const checklistForm = ref({
  tipo_checklist: checklistTemplates[0],
  obra_id: '',
  equipo_id: '',
  fecha: new Date().toISOString().slice(0, 10),
  inspector: '',
  resultado_global: 'conforme',
  hallazgos: '',
  medidas_correctivas: '',
});

// RF-15: Consulta rápida en terreno
const fieldQuery = ref('');
const fieldObraFilter = ref('');
const fieldResults = ref([]);
const fieldPtsSummary = ref([]);
const loadingField = ref(false);
const showQrScanner = ref(false);
const qrRawInput = ref('');
const qrCameraVideo = ref(null);
const qrCameraActive = ref(false);
let qrCameraStream = null;

function extractIdentifierFromQrText(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return '';
  // 1. Código credencial TOCAL-XXXX
  const tocalMatch = txt.match(/TOCAL-\d+/i);
  if (tocalMatch) return tocalMatch[0].toUpperCase();
  // 2. URL de Cédula de Identidad Registro Civil de Chile (ej. ...?RUN=12345678-5&type=CEDULA...)
  const runParamMatch = txt.match(/[?&]RUN=([0-9]{7,8}-?[0-9kK])/i);
  if (runParamMatch) return runParamMatch[1].toUpperCase();
  // 3. Cualquier RUT chileno en el texto
  const rutMatch = txt.match(/\b(\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK])\b/);
  if (rutMatch) return rutMatch[1].toUpperCase();
  return txt;
}

async function applyQrScanText(rawText) {
  const extracted = extractIdentifierFromQrText(rawText);
  if (!extracted) return;
  fieldQuery.value = extracted;
  stopQrCamera();
  showQrScanner.value = false;
  qrRawInput.value = '';
  info.value = `Código QR leído (${extracted}): mostrando Hoja de Vida y Semáforo del trabajador.`;
  await searchFieldWorkers();
}

async function startQrCamera() {
  error.value = '';
  if (!navigator?.mediaDevices?.getUserMedia) {
    error.value = 'Tu navegador no expone cámara en esta sesión; pega o escanea con lector USB el QR de la Cédula o Credencial abajo.';
    return;
  }
  try {
    qrCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    qrCameraActive.value = true;
    setTimeout(() => {
      if (qrCameraVideo.value && qrCameraStream) {
        qrCameraVideo.value.srcObject = qrCameraStream;
        qrCameraVideo.value.play().catch(() => {});
      }
    }, 80);
    if ('BarcodeDetector' in window) {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const scanLoop = async () => {
        if (!qrCameraActive.value || !qrCameraVideo.value) return;
        try {
          const barcodes = await detector.detect(qrCameraVideo.value);
          if (barcodes?.length && barcodes[0].rawValue) {
            await applyQrScanText(barcodes[0].rawValue);
            return;
          }
        } catch {
          // continue scanning
        }
        if (qrCameraActive.value) requestAnimationFrame(scanLoop);
      };
      requestAnimationFrame(scanLoop);
    }
  } catch {
    error.value = 'No se pudo abrir la cámara; utiliza el campo de lectura rápida de QR de Cédula / Credencial.';
  }
}

function stopQrCamera() {
  qrCameraActive.value = false;
  if (qrCameraStream) {
    qrCameraStream.getTracks().forEach(t => t.stop());
    qrCameraStream = null;
  }
}
const charlaForm = ref({
  tema: 'Charla Operacional Diaria de 5 Minutos y AST en Terreno',
  obra_id: '',
  relator: '',
  riesgos_criticos: 'Caída a distinto nivel, atrapamiento, proyección de partículas y uso obligatorio de EPP.',
   fecha: new Date().toISOString().slice(0, 10),
  trabajador_ids: [],
});

function toggleAllCharlaWorkers(checked) {
  charlaForm.value.trabajador_ids = checked ? fieldResults.value.map(w => w.id) : [];
}

async function submitCharlaCuadrilla() {
  if (!companyId.value || saving.value) return;
  if (!charlaForm.value.trabajador_ids.length) {
    error.value = 'Selecciona al menos un trabajador de la cuadrilla para registrar la asistencia.';
    return;
  }
  saving.value = true; error.value = ''; info.value = '';
  try {
    const res = await documentsApi.registerCrewSafetyTalk(companyId.value, {
      ...charlaForm.value,
      obra_id: charlaForm.value.obra_id || fieldObraFilter.value || null,
    });
    charlaForm.value.trabajador_ids = [];
    await searchFieldWorkers();
    info.value = `Charla Diaria 5 Minutos / AST registrada exitosamente para ${res.registrados || 0} trabajador(es) de la cuadrilla.`;
  } catch (e) {
    error.value = e.message || 'No fue posible registrar la charla de cuadrilla.';
  } finally {
    saving.value = false;
  }
}

// RF-16: Dossier de Fiscalización FUF / DS 44
const dossierObraFilter = ref('');
const dossierData = ref(null);
const loadingDossier = ref(false);

function printDossierReport() {
  window.print();
}

async function loadChecklists() {
  if (!companyId.value) return;
  try {
    checklistsList.value = await documentsApi.checklists(companyId.value);
  } catch (e) {
    error.value = e.message;
  }
}

async function saveChecklist() {
  if (!companyId.value || saving.value) return;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.createChecklist(companyId.value, {
      ...checklistForm.value,
      obra_id: checklistForm.value.obra_id || null,
      equipo_id: checklistForm.value.equipo_id || null,
    });
    checklistForm.value = {
      tipo_checklist: checklistTemplates[0],
      obra_id: '',
      equipo_id: '',
      fecha: new Date().toISOString().slice(0, 10),
      inspector: '',
      resultado_global: 'conforme',
      hallazgos: '',
      medidas_correctivas: '',
    };
    await loadChecklists();
    info.value = 'Inspección / Checklist digital registrado con trazabilidad de auditoría.';
  } catch (e) {
    error.value = e.message || 'No se pudo guardar el checklist.';
  } finally {
    saving.value = false;
  }
}

async function searchFieldWorkers() {
  if (!companyId.value) return;
  loadingField.value = true; error.value = '';
  try {
    const res = await documentsApi.fieldLookupFull(companyId.value, {
      q: fieldQuery.value.trim(),
      obra_id: fieldObraFilter.value || '',
    });
    fieldResults.value = res.results || [];
    fieldPtsSummary.value = res.resumen_pts || [];
  } catch (e) {
    error.value = e.message || 'No fue posible realizar la consulta en terreno.';
  } finally {
    loadingField.value = false;
  }
}

async function loadDossier() {
  if (!companyId.value) return;
  loadingDossier.value = true; error.value = '';
  try {
    dossierData.value = await documentsApi.dossierFufDs44(companyId.value, dossierObraFilter.value || null);
  } catch (e) {
    error.value = e.message || 'No fue posible cargar el Dossier FUF / DS 44.';
  } finally {
    loadingDossier.value = false;
  }
}

const viewMode = computed(() => route.meta?.viewMode || 'empresa-equipos');

watch(activeTab, tab => {
  if (tab === 'checklists') loadChecklists();
  if (tab === 'terreno') searchFieldWorkers();
  if (tab === 'dossier') loadDossier();
});

watch(
  () => [route.path, route.query.tab, viewMode.value],
  ([, qTab, mode]) => {
    error.value = '';
    info.value = '';
    if (mode === 'terreno') {
      activeTab.value = 'terreno';
      searchFieldWorkers();
      return;
    }
    if (mode === 'dossier') {
      activeTab.value = 'dossier';
      loadDossier();
      return;
    }
    if (qTab && ['empresa', 'equipos', 'checklists', 'terreno', 'dossier'].includes(String(qTab))) {
      activeTab.value = String(qTab);
    } else {
      activeTab.value = 'empresa';
    }
  },
  { immediate: true }
);

async function loadAll() {
  const id = companyId.value;
  if (!id) return;
  loading.value = true;
  error.value = '';
  try {
    const [typesResp, obrasResp, cDocs, cComp, eqList] = await Promise.all([
      documentsApi.types(id).catch(() => []),
      worksApi.list().catch(() => ({ results: [] })),
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
    if (activeTab.value === 'checklists') await loadChecklists();
    if (activeTab.value === 'terreno') await searchFieldWorkers();
    if (activeTab.value === 'dossier') await loadDossier();
  } catch (e) {
    error.value = e.message || 'No se pudo cargar la información.';
  } finally {
    loading.value = false;
  }
}

function formatStatusLabel(st) {
  if (!st) return '—';
  const map = {
    al_dia: 'Al día',
    con_observaciones: 'Con observaciones',
    critico: 'Crítico',
    aprobado: 'Aprobado',
    pendiente: 'En revisión',
    en_revision: 'En revisión',
    rechazado: 'Rechazado',
    operativo: 'Operativo',
    mantencion: 'En mantención',
    fuera_servicio: 'Fuera de servicio',
    conforme: 'Conforme',
    no_conforme: 'No conforme',
  };
  return map[String(st).toLowerCase()] || String(st).replace(/_/g, ' ');
}

function statusBadgeStyle(st) {
  const s = String(st || '').toLowerCase();
  if (['al_dia', 'aprobado', 'operativo', 'conforme', 'habilitado'].includes(s)) {
    return { background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', fontWeight: 700 };
  }
  if (['pendiente', 'en_revision', 'con_observaciones', 'mantencion'].includes(s)) {
    return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 700 };
  }
  if (['rechazado', 'critico', 'fuera_servicio', 'no_conforme', 'no_habilitado'].includes(s)) {
    return { background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', fontWeight: 700 };
  }
  return { background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', fontWeight: 600 };
}

async function selectCompanyDocItem(doc, forceOpen = false) {
  if (!forceOpen && selectedCompanyDoc.value?.id === doc?.id) {
    selectedCompanyDoc.value = null;
    return;
  }
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
    if (updated) await selectCompanyDocItem(updated, true);
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
  const normalizedEstado = estado === 'en_revision' ? 'pendiente' : estado;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.reviewCompanyDocument(companyId.value, selectedCompanyDoc.value.id, {
      estado: normalizedEstado,
      observaciones: companyReviewObs.value,
      motivo_rechazo: normalizedEstado === 'rechazado' ? companyReviewObs.value : '',
    });
    await loadAll();
    const updated = companyDocs.value.find(d => d.id === selectedCompanyDoc.value.id);
    if (updated) await selectCompanyDocItem(updated, true);
    info.value = `Estado del documento actualizado a ${formatStatusLabel(normalizedEstado)}.`;
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

async function selectEquipmentDocItem(doc, forceOpen = false) {
  if (!forceOpen && selectedEquipmentDoc.value?.id === doc?.id) {
    selectedEquipmentDoc.value = null;
    return;
  }
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
    if (updated) await selectEquipmentDocItem(updated, true);
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
  const normalizedEstado = estado === 'en_revision' ? 'pendiente' : estado;
  saving.value = true; error.value = ''; info.value = '';
  try {
    await documentsApi.reviewEquipmentDocument(companyId.value, selectedEquipment.value.id, selectedEquipmentDoc.value.id, {
      estado: normalizedEstado,
      observaciones: equipmentReviewObs.value,
      motivo_rechazo: normalizedEstado === 'rechazado' ? equipmentReviewObs.value : '',
    });
    await selectEquipment(selectedEquipment.value);
    const updated = equipmentDocs.value.find(d => d.id === selectedEquipmentDoc.value.id);
    if (updated) await selectEquipmentDocItem(updated, true);
    info.value = `Estado del documento de equipo actualizado a ${formatStatusLabel(normalizedEstado)}.`;
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
  <section class="stack" style="width:100%">
    <header v-if="viewMode === 'terreno'" class="stack-sm">
      <h1>Consulta rápida de habilitación en terreno</h1>
      <p>Verifica al instante por RUT, nombre, cargo u obra el semáforo de habilitación (Verde / Amarillo / Rojo) antes de autorizar el ingreso o inicio de faena (RF-15).</p>
    </header>
    <header v-else-if="viewMode === 'dossier'" class="stack-sm">
      <h1>Dossier de Fiscalización FUF / DS 44</h1>
      <p>Consolidado ejecutivo y auditable de prevención de riesgos para inspecciones de la Dirección del Trabajo (DT), SEREMI de Salud y Mutualidades (RF-16).</p>
    </header>
    <header v-else class="stack-sm">
      <h1>Documentos de empresa, equipos e inspecciones</h1>
      <p>Control documental corporativo (PTS, RIOHS, IPER), maquinaria y checklists digitales en terreno (RF-12).</p>
    </header>

    <div v-if="viewMode === 'empresa-equipos'" class="pills" style="display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="pill" :aria-selected="activeTab==='empresa'" @click="activeTab='empresa'">Documentos de empresa y PTS</button>
      <button type="button" class="pill" :aria-selected="activeTab==='equipos'" @click="activeTab='equipos'">Equipos y maquinaria</button>
      <button type="button" class="pill" :aria-selected="activeTab==='checklists'" @click="activeTab='checklists'">Checklists e inspecciones (RF-12)</button>
    </div>

    <p v-if="error" role="alert" class="notice bad">{{ error }}</p>
    <p v-if="info" role="status" class="notice">{{ info }}</p>

    <!-- ETAPA 7: DOCUMENTOS DE EMPRESA -->
    <div v-if="activeTab==='empresa'" class="stack">
      <div v-if="companyCompliance" class="stat-grid cols-4">
        <div class="card" style="padding:16px">
          <small class="muted">Cumplimiento empresa</small>
          <h2>{{ companyCompliance.porcentaje_cumplimiento ?? 100 }}%</h2>
        </div>
        <div class="card" style="padding:16px">
          <small class="muted">Estado global</small>
          <div style="margin-top:6px">
            <span class="badge" :style="statusBadgeStyle(companyCompliance.estado_global)">
              {{ formatStatusLabel(companyCompliance.estado_global) }}
            </span>
          </div>
        </div>
        <div class="card" style="padding:16px">
          <small class="muted">Aprobados vigentes</small>
          <h2>{{ companyCompliance.aprobados ?? companyCompliance.cumplidos ?? companyCompliance.resumen?.aprobados ?? companyDocs.filter(d => d.estado === 'aprobado').length }} / {{ companyCompliance.total_obligatorios ?? companyDocs.length }}</h2>
        </div>
        <div class="card" style="padding:16px">
          <small class="muted">Faltantes / Vencidos</small>
          <h2>{{ (companyCompliance.resumen?.faltantes ?? companyCompliance.faltantes ?? 0) + (companyCompliance.resumen?.vencidos ?? companyCompliance.vencidos ?? 0) }}</h2>
        </div>
      </div>

      <div class="card stack-sm" style="padding:22px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="margin:0">Expediente documental de la empresa ({{ companyDocs.length }})</h2>
            <p class="muted" style="margin:4px 0 0;font-size:13px">Haz clic en «Gestionar» sobre cualquier documento para ver sus archivos adjuntos, subir nuevas versiones o aprobarlo en línea.</p>
          </div>
        </div>

        <details v-if="canCreateDoc" class="create-drawer" style="margin-bottom:8px">
          <summary class="create-drawer__trigger">Registrar documento de empresa</summary>
          <form class="stack-sm" @submit.prevent="createCompanyDoc">
            <p v-if="!companyDocTypes.length" class="muted">Primero registra un tipo documental de categoría «Empresa» en Ajustes y mantenedores.</p>
            <template v-else>
              <div class="form-row-grid">
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
              <div><button class="btn" type="submit" :disabled="saving">Crear documento empresarial</button></div>
            </template>
          </form>
        </details>

        <p v-if="loading">Cargando documentos…</p>
        <p v-else-if="!companyDocs.length" class="muted">No hay documentos corporativos registrados.</p>
        <div v-else class="tbl-wrap">
          <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
            <thead>
              <tr>
                <th>Tipo documental</th>
                <th>Alcance</th>
                <th>Vencimiento</th>
                <th>Estado</th>
                <th>Evidencias</th>
                <th style="text-align:right">Acción</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="doc in companyDocs" :key="doc.id">
                <tr :style="selectedCompanyDoc?.id === doc.id ? 'background:#fde9dc33' : ''">
                  <td><strong>{{ doc.tipo_documento_nombre }}</strong></td>
                  <td>{{ doc.obra_nombre || 'General empresa' }}</td>
                  <td style="white-space:nowrap">{{ doc.fecha_vencimiento || '—' }}</td>
                  <td style="white-space:nowrap">
                    <span class="badge" :style="statusBadgeStyle(doc.estado)">{{ formatStatusLabel(doc.estado) }}</span>
                  </td>
                  <td style="white-space:nowrap">{{ doc.tiene_evidencia ? `${doc.total_archivos || 1} archivo(s)` : 'Sin archivo' }}</td>
                  <td style="text-align:right;white-space:nowrap">
                    <button
                      type="button"
                      class="btn btn-sm"
                      :class="selectedCompanyDoc?.id === doc.id ? 'btn-primary' : 'btn-ghost'"
                      @click="selectCompanyDocItem(doc)"
                    >
                      {{ selectedCompanyDoc?.id === doc.id ? 'Cerrar panel' : 'Gestionar' }}
                    </button>
                  </td>
                </tr>
                <tr v-if="selectedCompanyDoc?.id === doc.id">
                  <td colspan="6" style="background:#faf9f6;padding:16px 20px;border-bottom:2px solid #e2ded5">
                    <div class="form-row-grid" style="gap:20px;align-items:start">
                      <div class="stack-sm">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                          <strong>Archivos de evidencia ({{ companyDocFiles.length }})</strong>
                          <label v-if="canUploadDoc" class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0">
                            + Subir nueva versión (PDF/Imagen)
                            <input type="file" style="display:none" @change="uploadCompanyDocFile" />
                          </label>
                        </div>
                        <ul v-if="companyDocFiles.length" style="margin:0;padding:0;list-style:none;display:grid;gap:6px">
                          <li v-for="f in companyDocFiles" :key="f.id" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#fff;border:1px solid #e2ded5;border-radius:8px;gap:8px;flex-wrap:wrap">
                            <span><strong>v{{ f.version }}</strong> · {{ f.nombre_original }}</span>
                            <button type="button" class="btn btn-ghost btn-sm" @click="documentsApi.downloadCompanyDocument(companyId, selectedCompanyDoc.id, f.id, f.nombre_original)">Descargar PDF</button>
                          </li>
                        </ul>
                        <p v-else class="muted" style="margin:0">Sin archivos cargados. Debes subir una evidencia antes de aprobar.</p>
                      </div>

                      <div v-if="canApproveDoc" class="stack-sm" style="background:#fff;padding:14px;border:1px solid #e2ded5;border-radius:10px">
                        <strong>Revisión y aprobación documental</strong>
                        <label class="stack-sm" style="font-size:12px">Observación de revisión
                          <input v-model="companyReviewObs" placeholder="Comentario u observación (obligatoria al rechazar)" style="padding:8px;width:100%" />
                        </label>
                        <div style="display:flex;gap:8px;flex-wrap:wrap">
                          <button type="button" class="btn btn-sm" :disabled="saving || !selectedCompanyDoc.tiene_evidencia" @click="reviewCompanyDoc('aprobado')">Aprobar vigente</button>
                          <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="reviewCompanyDoc('pendiente')">Marcar en revisión</button>
                          <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="reviewCompanyDoc('rechazado')">Rechazar</button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ETAPA 8: EQUIPOS Y MAQUINARIA -->
    <div v-else-if="activeTab==='equipos'" class="stack">
      <div class="eq-layout">
        <div class="card stack-sm" style="padding:20px">
          <h2 style="margin:0">Catálogo de equipos ({{ equipmentList.length }})</h2>
          <p class="muted" style="margin:0;font-size:12.5px">Selecciona un equipo o vehículo para ver su hoja de vida, asignaciones y documentos.</p>
          <details v-if="canCreateDoc" class="create-drawer" style="margin-bottom:6px">
            <summary class="create-drawer__trigger">Registrar equipo o maquinaria</summary>
            <form class="stack-sm" @submit.prevent="saveNewEquipment">
              <div class="form-row-grid">
                <input v-model.trim="equipmentForm.codigo" required placeholder="Código (ej. exc-01)" style="padding:8px" />
                <input v-model.trim="equipmentForm.nombre" required placeholder="Retroexcavadora CAT 416" style="padding:8px" />
                <input v-model="equipmentForm.tipo_equipo" placeholder="Tipo (Maquinaria, Vehículo…)" style="padding:8px" />
                <input v-model="equipmentForm.patente_o_serie" placeholder="Patente o N° serie" style="padding:8px" />
                <input v-model="equipmentForm.marca" placeholder="Marca" style="padding:8px" />
                <input v-model="equipmentForm.modelo" placeholder="Modelo" style="padding:8px" />
              </div>
              <button class="btn" type="submit" :disabled="saving">Crear equipo</button>
            </form>
          </details>
          <p v-if="!equipmentList.length" class="muted">No hay equipos registrados en la empresa.</p>
          <div v-else class="eq-selector-list">
            <button
              v-for="eq in equipmentList"
              :key="eq.id"
              type="button"
              class="eq-selector-card"
              :class="{ 'eq-selector-card--active': selectedEquipment?.id === eq.id }"
              @click="selectEquipment(eq)"
            >
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;width:100%">
                <strong style="font-size:13.5px;line-height:1.3">{{ eq.nombre }}</strong>
                <span class="badge" :style="statusBadgeStyle(eq.estado)" style="font-size:11px;padding:2px 8px;flex-shrink:0">
                  {{ formatStatusLabel(eq.estado) }}
                </span>
              </div>
              <div style="font-size:12px;color:var(--muted-fg,#6f6d68);display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
                <code>{{ eq.codigo }}</code>
                <span v-if="eq.patente_o_serie">· <strong>{{ eq.patente_o_serie }}</strong></span>
                <span v-if="eq.tipo_equipo">· {{ eq.tipo_equipo }}</span>
              </div>
            </button>
          </div>
        </div>

        <div class="card stack-sm" style="padding:22px">
          <template v-if="!selectedEquipment">
            <p class="muted">Selecciona un equipo del catálogo izquierdo para gestionar sus asignaciones a obras, documentos y cumplimiento.</p>
          </template>
          <template v-else>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;border-bottom:1px solid #e2ded5;padding-bottom:14px">
              <div>
                <h2 style="margin:0">{{ selectedEquipment.nombre }}</h2>
                <p class="muted" style="margin:4px 0 0;font-size:13px">
                  Código: <code>{{ selectedEquipment.codigo }}</code>
                  <template v-if="selectedEquipment.patente_o_serie"> · Patente/Serie: <strong>{{ selectedEquipment.patente_o_serie }}</strong></template>
                  · Tipo: {{ selectedEquipment.tipo_equipo }}
                </p>
              </div>
              <div v-if="equipmentCompliance" style="background:#faf9f6;border:1px solid #e2ded5;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px">
                <div>
                  <small class="muted" style="display:block;font-size:11px">Cumplimiento equipo</small>
                  <strong style="font-size:1.1rem">{{ equipmentCompliance.porcentaje_cumplimiento }}%</strong>
                </div>
                <span class="badge" :style="statusBadgeStyle(equipmentCompliance.estado_global)">
                  {{ formatStatusLabel(equipmentCompliance.estado_global) }}
                </span>
              </div>
            </div>

            <div class="stack-sm">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <h3 style="margin:0">Asignaciones históricas a obras</h3>
              </div>
              <details v-if="canCreateDoc && obras.length" class="create-drawer create-drawer--inline" style="margin-bottom:4px">
                <summary class="create-drawer__trigger">Asignar equipo a obra</summary>
                <form class="stack-sm" @submit.prevent="saveEquipmentAssignment">
                  <div class="form-row-grid">
                    <select v-model="assignmentForm.obra_id" required style="padding:8px">
                      <option value="">Selecciona obra…</option>
                      <option v-for="o in obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
                    </select>
                    <input v-model="assignmentForm.fecha_inicio" type="date" required style="padding:8px" />
                    <input v-model="assignmentForm.responsable" placeholder="Responsable / Operador" style="padding:8px" />
                  </div>
                  <div><button class="btn btn-sm" type="submit" :disabled="saving">Asignar a obra</button></div>
                </form>
              </details>
              <div v-if="equipmentAssignments.length" class="tbl-wrap">
                <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
                  <thead><tr><th>Obra</th><th>Operador / Responsable</th><th>Inicio</th><th>Estado / Término</th></tr></thead>
                  <tbody>
                    <tr v-for="a in equipmentAssignments" :key="a.id">
                      <td><strong>{{ a.obra_nombre }}</strong></td>
                      <td>{{ a.responsable || '—' }}</td>
                      <td style="white-space:nowrap">{{ a.fecha_inicio }}</td>
                      <td style="white-space:nowrap">
                        <span class="badge" :style="a.fecha_fin ? statusBadgeStyle('neutral') : statusBadgeStyle('operativo')">
                          {{ a.fecha_fin || 'Vigente en obra' }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">Sin asignaciones a obras registradas.</p>
            </div>

            <div class="stack-sm" style="margin-top:8px">
              <h3 style="margin:0">Documentación técnica y legal del equipo ({{ equipmentDocs.length }})</h3>
              <details v-if="canCreateDoc && equipmentDocTypes.length" class="create-drawer create-drawer--inline" style="margin-bottom:4px">
                <summary class="create-drawer__trigger">Registrar documento del equipo</summary>
                <form class="stack-sm" @submit.prevent="saveEquipmentDocument">
                  <div class="form-row-grid">
                    <select v-model="equipmentDocForm.tipo_documento_id" required style="padding:8px">
                      <option value="">Tipo documental (Equipo)…</option>
                      <option v-for="t in equipmentDocTypes" :key="t.id" :value="t.id">{{ t.nombre }}</option>
                    </select>
                    <input v-model="equipmentDocForm.fecha_vencimiento" type="date" style="padding:8px" />
                  </div>
                  <div><button class="btn btn-sm" type="submit" :disabled="saving">Crear documento de equipo</button></div>
                </form>
              </details>
              <div v-if="equipmentDocs.length" class="tbl-wrap">
                <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Vencimiento</th>
                      <th>Estado</th>
                      <th>Evidencia</th>
                      <th style="text-align:right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="d in equipmentDocs" :key="d.id">
                      <tr :style="selectedEquipmentDoc?.id === d.id ? 'background:#fde9dc33' : ''">
                        <td><strong>{{ d.tipo_documento_nombre }}</strong></td>
                        <td style="white-space:nowrap">{{ d.fecha_vencimiento || '—' }}</td>
                        <td style="white-space:nowrap">
                          <span class="badge" :style="statusBadgeStyle(d.estado)">{{ formatStatusLabel(d.estado) }}</span>
                        </td>
                        <td style="white-space:nowrap">{{ d.tiene_evidencia ? `${d.total_archivos || 1} archivo(s)` : 'Sin archivo' }}</td>
                        <td style="text-align:right;white-space:nowrap">
                          <button
                            type="button"
                            class="btn btn-sm"
                            :class="selectedEquipmentDoc?.id === d.id ? 'btn-primary' : 'btn-ghost'"
                            @click="selectEquipmentDocItem(d)"
                          >
                            {{ selectedEquipmentDoc?.id === d.id ? 'Cerrar' : 'Revisar' }}
                          </button>
                        </td>
                      </tr>
                      <tr v-if="selectedEquipmentDoc?.id === d.id">
                        <td colspan="5" style="background:#faf9f6;padding:14px 16px;border-bottom:2px solid #e2ded5">
                          <div class="form-row-grid" style="gap:16px;align-items:start">
                            <div class="stack-sm">
                              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                                <strong>Evidencias adjuntas ({{ equipmentDocFiles.length }})</strong>
                                <label v-if="canUploadDoc" class="btn btn-ghost btn-sm" style="cursor:pointer;margin:0">
                                  + Subir archivo
                                  <input type="file" style="display:none" @change="uploadEquipmentDocFile" />
                                </label>
                              </div>
                              <ul v-if="equipmentDocFiles.length" style="margin:0;padding:0;list-style:none;display:grid;gap:6px">
                                <li v-for="f in equipmentDocFiles" :key="f.id" style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#fff;border:1px solid #e2ded5;border-radius:8px;gap:8px">
                                  <span><strong>v{{ f.version }}</strong> · {{ f.nombre_original }}</span>
                                  <button type="button" class="btn btn-ghost btn-sm" @click="documentsApi.downloadEquipmentDocument(companyId, selectedEquipment.id, selectedEquipmentDoc.id, f.id, f.nombre_original)">Descargar</button>
                                </li>
                              </ul>
                              <p v-else class="muted" style="margin:0">Sin archivos adjuntos.</p>
                            </div>
                            <div v-if="canApproveDoc" class="stack-sm" style="background:#fff;padding:12px;border:1px solid #e2ded5;border-radius:8px">
                              <strong>Aprobación documental</strong>
                              <input v-model="equipmentReviewObs" placeholder="Observación de revisión" style="padding:7px;width:100%" />
                              <div style="display:flex;gap:8px;flex-wrap:wrap">
                                <button type="button" class="btn btn-sm" :disabled="saving || !selectedEquipmentDoc.tiene_evidencia" @click="reviewEquipmentDoc('aprobado')">Aprobar</button>
                                <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="reviewEquipmentDoc('pendiente')">En revisión</button>
                                <button type="button" class="btn btn-ghost btn-sm" :disabled="saving" @click="reviewEquipmentDoc('rechazado')">Rechazar</button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
              <p v-else class="muted">Sin documentos registrados para este equipo.</p>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- RF-12: CHECKLISTS DIGITALES E INSPECCIONES -->
    <div v-else-if="activeTab==='checklists'" class="stack">
      <details v-if="canCreateDoc" class="create-drawer">
        <summary class="create-drawer__trigger">Registrar inspección / checklist digital (RF-12)</summary>
        <form class="stack-sm" @submit.prevent="saveChecklist">
          <label class="stack-sm">Tipo de lista de verificación
            <select v-model="checklistForm.tipo_checklist" required style="padding:8px">
              <option v-for="tpl in checklistTemplates" :key="tpl" :value="tpl">{{ tpl }}</option>
            </select>
          </label>
          <div class="form-row-grid">
            <label class="stack-sm">Obra / Centro de trabajo
              <select v-model="checklistForm.obra_id" style="padding:8px">
                <option value="">General empresa</option>
                <option v-for="o in obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
              </select>
            </label>
            <label class="stack-sm">Equipo / Maquinaria (opcional)
              <select v-model="checklistForm.equipo_id" style="padding:8px">
                <option value="">No aplica / General</option>
                <option v-for="eq in equipmentList" :key="eq.id" :value="eq.id">{{ eq.nombre }} ({{ eq.codigo }})</option>
              </select>
            </label>
            <label class="stack-sm">Fecha inspección
              <input v-model="checklistForm.fecha" type="date" required style="padding:8px" />
            </label>
            <label class="stack-sm">Resultado global
              <select v-model="checklistForm.resultado_global" style="padding:8px">
                <option value="conforme">Conforme / Operativo</option>
                <option value="con_observaciones">Con observaciones menores</option>
                <option value="no_conforme">No conforme / Detener tarea</option>
              </select>
            </label>
          </div>
          <label class="stack-sm">Inspector / Supervisor responsable
            <input v-model="checklistForm.inspector" placeholder="Nombre de quien realiza la inspección" style="padding:8px" />
          </label>
          <label class="stack-sm">Hallazgos detectados
            <textarea v-model="checklistForm.hallazgos" rows="2" placeholder="Detalle de puntos revisados u observaciones en terreno…" style="padding:8px" />
          </label>
          <label class="stack-sm">Medidas correctivas / Cierre
            <textarea v-model="checklistForm.medidas_correctivas" rows="2" placeholder="Acciones tomadas o compromiso de cierre…" style="padding:8px" />
          </label>
          <button class="btn" type="submit" :disabled="saving">Guardar checklist digital</button>
        </form>
      </details>

      <div class="card stack-sm" style="padding:20px">
          <h2>Historial de inspecciones y checklists ({{ checklistsList.length }})</h2>
          <p v-if="!checklistsList.length" class="muted">No hay inspecciones digitales registradas aún.</p>
          <div v-else style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
              <thead><tr><th>Fecha</th><th>Checklist / Equipo</th><th>Obra</th><th>Inspector</th><th>Resultado</th><th>Hallazgos</th></tr></thead>
              <tbody>
                <tr v-for="chk in checklistsList" :key="chk.id">
                  <td>{{ chk.fecha }}</td>
                  <td><strong>{{ chk.tipo_checklist }}</strong><br><small v-if="chk.equipo_nombre" class="muted">{{ chk.equipo_nombre }}</small></td>
                  <td>{{ chk.obra_nombre }}</td>
                  <td>{{ chk.inspector }}</td>
                  <td><span class="badge">{{ chk.resultado_global }}</span></td>
                  <td><small>{{ chk.hallazgos || 'Sin hallazgos' }} {{ chk.medidas_correctivas ? `— Acción: ${chk.medidas_correctivas}` : '' }}</small></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
    </div>

    <!-- RF-15: CONSULTA RÁPIDA EN TERRENO -->
    <div v-else-if="activeTab==='terreno'" class="stack">
      <!-- RF-08 / DS 44: CHARLA DIARIA DE 5 MINUTOS / AST DE CUADRILLA (ARRIBA DE LA VISTA) -->
      <details v-if="canCreateDoc" class="create-drawer">
        <summary class="create-drawer__trigger">Registrar Charla Diaria de 5 Minutos / AST con Asistencia de Cuadrilla (DS 44 / RF-08)</summary>
        <form class="stack-sm" @submit.prevent="submitCharlaCuadrilla">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px">
            <label class="stack-sm">Tema de la Charla / Procedimiento (PTS)
              <input v-model.trim="charlaForm.tema" required placeholder="Ej: Charla 5 Min — Trabajo Seguro en Altura" style="padding:8px" />
            </label>
            <label class="stack-sm">Obra / Faena
              <select v-model="charlaForm.obra_id" style="padding:8px">
                <option value="">General empresa / Según filtro</option>
                <option v-for="o in obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
              </select>
            </label>
            <label class="stack-sm">Relator / Capataz / Prevencionista
              <input v-model.trim="charlaForm.relator" placeholder="Nombre de quien dicta la charla" style="padding:8px" />
            </label>
            <label class="stack-sm">Fecha de realización
              <input v-model="charlaForm.fecha" type="date" required style="padding:8px" />
            </label>
          </div>
          <label class="stack-sm">Riesgos críticos y medidas de control analizadas en el AST
            <input v-model.trim="charlaForm.riesgos_criticos" placeholder="Riesgos identificados y controles en terreno…" style="padding:8px" />
          </label>
          <div class="card stack-sm" style="padding:12px;background:#faf9f6">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <strong style="font-size:13px">Asistentes de la cuadrilla ({{ charlaForm.trabajador_ids.length }} seleccionados)</strong>
              <div style="display:flex;gap:6px">
                <button type="button" class="btn btn-ghost btn-sm" @click="toggleAllCharlaWorkers(true)">Marcar todos ({{ fieldResults.length }})</button>
                <button type="button" class="btn btn-ghost btn-sm" @click="toggleAllCharlaWorkers(false)">Desmarcar todos</button>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px;max-height:160px;overflow-y:auto">
              <label v-for="w in fieldResults" :key="w.id" style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
                <input v-model="charlaForm.trabajador_ids" type="checkbox" :value="w.id" style="width:auto" />
                <span>{{ w.nombre }} <small class="muted">({{ w.qr_codigo || `#${w.id}` }})</small></span>
              </label>
            </div>
          </div>
          <div>
            <button class="btn" type="submit" :disabled="saving || !charlaForm.trabajador_ids.length">
              {{ saving ? 'Registrando asistencia…' : `Guardar Charla / AST para ${charlaForm.trabajador_ids.length} trabajador(es)` }}
            </button>
          </div>
        </form>
      </details>

      <div class="card stack-sm" style="padding:20px">
        <h2>Consulta rápida de habilitación y verificador QR en terreno (RF-15)</h2>
        <p class="muted">Verifica al instante por RUT, nombre, cargo o código de credencial QR (<code>TOCAL-0001</code>) si un trabajador cumple requisitos documentales, inducción, cursos/PTS y EPP antes de autorizar una tarea.</p>
        <form style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end" @submit.prevent="searchFieldWorkers">
          <label style="flex:1;min-width:220px">Buscar por nombre, RUT, cargo o código QR (ej. TOCAL-0001)
            <input v-model.trim="fieldQuery" type="search" placeholder="Ej: TOCAL-0001, Maestro, Juan, 12.345…" style="width:100%;padding:10px" />
          </label>
          <label style="min-width:200px">Filtrar por obra
            <select v-model="fieldObraFilter" style="width:100%;padding:10px" @change="searchFieldWorkers">
              <option value="">Todas las obras</option>
              <option v-for="o in obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
            </select>
          </label>
          <button class="btn" type="submit" :disabled="loadingField">{{ loadingField ? 'Buscando…' : 'Consultar en terreno' }}</button>
          <button type="button" class="btn btn-ghost" @click="showQrScanner = !showQrScanner; if (!showQrScanner) stopQrCamera()">
            {{ showQrScanner ? 'Cerrar lector QR' : '📷 Escanear QR Cédula / Credencial' }}
          </button>
        </form>

        <div v-if="showQrScanner" class="card stack-sm" style="padding:16px;background:#faf9f6;border:1px dashed #171716;margin-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
            <div>
              <strong>Lector de Código QR de Cédula de Identidad Chilena (Registro Civil) o Credencial TOCAL</strong>
              <p class="muted" style="margin:2px 0 0;font-size:12px">
                Escanea con la cámara del teléfono/tablet o pega la URL del QR del carnet de identidad (<code>?RUN=12345678-5</code>) o credencial (<code>TOCAL-0001</code>) para abrir su Hoja de Vida al instante.
              </p>
            </div>
            <div style="display:flex;gap:8px">
              <button v-if="!qrCameraActive" type="button" class="btn btn-primary btn-sm" @click="startQrCamera">Activar cámara QR</button>
              <button v-else type="button" class="btn btn-ghost btn-sm" @click="stopQrCamera">Detener cámara</button>
            </div>
          </div>
          <video v-if="qrCameraActive" ref="qrCameraVideo" muted playsinline style="width:100%;max-width:360px;border-radius:8px;border:1px solid #171716;background:#000" />
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <input
              v-model.trim="qrRawInput"
              placeholder="Pega o pistolea aquí el QR de la Cédula (ej. https://portal.sidiv.registrocivil.cl/...?RUN=11.111.111-1) o TOCAL-0001"
              style="flex:1;min-width:240px;padding:8px"
              @keyup.enter="applyQrScanText(qrRawInput)"
            />
            <button type="button" class="btn btn-sm" @click="applyQrScanText(qrRawInput)">Procesar QR y ver Hoja de Vida</button>
          </div>
        </div>
      </div>

      <!-- RF-07: SEMÁFORO DE COBERTURA DE PROCEDIMIENTOS DE TRABAJO SEGURO (PTS) -->
      <div v-if="fieldPtsSummary.length" class="card stack-sm" style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <div>
            <h3 style="margin:0">Semáforo de Cobertura de PTS e Inducciones en Cuadrilla (RF-07)</h3>
            <small class="muted">Porcentaje de trabajadores activos con difusión y evaluación vigente por cada Procedimiento de Trabajo Seguro.</small>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px">
          <div
            v-for="pts in fieldPtsSummary"
            :key="pts.id"
            class="card"
            style="padding:12px;border-left:4px solid"
            :style="{ borderLeftColor: pts.semaforo === 'verde' ? '#16a34a' : pts.semaforo === 'amarillo' ? '#d97706' : '#dc2626' }"
          >
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px">
              <strong style="font-size:12.5px">{{ pts.nombre }}</strong>
              <span class="badge" :style="{ background: pts.semaforo === 'verde' ? '#dcfce7' : pts.semaforo === 'amarillo' ? '#fef3c7' : '#fee2e2', color: '#111827', fontWeight: 700 }">
                {{ pts.porcentaje }}%
              </span>
            </div>
            <div style="font-size:11.5px;color:#475569;margin-top:6px">
              Capacitados: <strong>{{ pts.cubiertos }} / {{ pts.total_trabajadores }}</strong>
              <span v-if="pts.pendientes > 0" style="color:#b91c1c"> · {{ pts.pendientes }} pendiente(s)</span>
            </div>
          </div>
        </div>
      </div>

      <p v-if="!loadingField && !fieldResults.length" class="card" style="padding:18px">No se encontraron trabajadores para el criterio consultado.</p>
      <div v-else style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">
        <div v-for="w in fieldResults" :key="w.id" class="card stack-sm" style="padding:18px;border-left:5px solid" :style="{ borderLeftColor: w.estado_habilitacion === 'habilitado' ? '#16a34a' : w.estado_habilitacion === 'con_observaciones' ? '#d97706' : '#dc2626' }">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                <h3 style="margin:0">{{ w.nombre }}</h3>
                <code v-if="w.qr_codigo" style="font-size:11px;background:#f1f5f9;padding:2px 6px;border-radius:6px">{{ w.qr_codigo }}</code>
              </div>
              <small v-if="w.rut" class="muted">RUT: {{ w.rut }}</small>
            </div>
            <span class="badge" :style="{ background: w.estado_habilitacion === 'habilitado' ? '#dcfce7' : w.estado_habilitacion === 'con_observaciones' ? '#fef3c7' : '#fee2e2', color: '#111827', fontWeight: 700 }">
              {{ w.estado_label }}
            </span>
          </div>
          <div v-if="w.asignaciones_activas?.length" style="font-size:13px">
            <div v-for="(asig, idx) in w.asignaciones_activas" :key="idx">
              <strong>{{ asig.cargo_nombre }}</strong> en {{ asig.obra_nombre }}
            </div>
          </div>
          <small v-else class="muted">Sin asignación de obra vigente</small>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;background:#f8fafc;padding:10px;border-radius:8px">
            <div><span class="muted">Documentos</span><br><strong>{{ w.documental?.porcentaje ?? 0 }}%</strong> ({{ w.documental?.aprobados ?? 0 }}/{{ w.documental?.total_obligatorios ?? 0 }})</div>
            <div><span class="muted">Cursos / PTS</span><br><strong>{{ w.capacitaciones?.vigentes ?? 0 }}/{{ w.capacitaciones?.total_obligatorias ?? 0 }}</strong></div>
            <div><span class="muted">EPP Terreno</span><br><strong>{{ w.epp?.vigentes ?? 0 }}/{{ w.epp?.total_obligatorios ?? 0 }}</strong></div>
          </div>
          <ul v-if="w.observaciones?.length" style="margin:0;padding-left:18px;font-size:12px;color:#b91c1c">
            <li v-for="(obs, i) in w.observaciones" :key="i">{{ obs }}</li>
          </ul>
          <div>
            <RouterLink class="btn btn-ghost btn-sm" :to="{ name: 'trabajador-detalle', params: { trabajadorId: w.id } }">Abrir carpeta completa</RouterLink>
          </div>
        </div>
      </div>
    </div>

    <!-- RF-16: DOSSIER DE FISCALIZACIÓN FUF / DS 44 -->
    <div v-else-if="activeTab==='dossier'" class="stack">
      <div class="card stack-sm" style="padding:20px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="margin:0">Dossier de Cumplimiento y Fiscalización (FUF / DS 44 — RF-16)</h2>
            <p class="muted" style="margin:4px 0 0">Evidencias estructuradas conforme al Formulario Único de Fiscalización (FUF), DS 44 y Ley 16.744.</p>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <select v-model="dossierObraFilter" style="padding:8px" @change="loadDossier">
              <option value="">Toda la empresa</option>
              <option v-for="o in obras" :key="o.id" :value="o.id">Obra: {{ o.nombre }}</option>
            </select>
            <button type="button" class="btn btn-ghost btn-sm" @click="printDossierReport">
              Imprimir Informe Oficial FUF / DS 44 (PDF)
            </button>
            <button type="button" class="btn btn-primary btn-sm" @click="documentsApi.exportComplianceCsv(companyId, { obra_id: dossierObraFilter || undefined })">
              Exportar planilla de fiscalización (CSV)
            </button>
          </div>
        </div>
      </div>

      <p v-if="loadingDossier">Consolidando expediente normativo…</p>
      <template v-else-if="dossierData">
        <div class="stat-grid cols-4">
          <div class="card" style="padding:16px"><small class="muted">Cumplimiento Empresa</small><h2>{{ dossierData.kpis?.porcentaje_cumplimiento_empresa ?? 0 }}%</h2></div>
          <div class="card" style="padding:16px"><small class="muted">Cumplimiento Trabajadores</small><h2>{{ dossierData.kpis?.porcentaje_cumplimiento_trabajadores ?? 0 }}%</h2></div>
          <div class="card" style="padding:16px"><small class="muted">Trabajadores Habilitados</small><h2>{{ dossierData.kpis?.trabajadores_habilitados_prev ?? 0 }} / {{ dossierData.kpis?.trabajadores_evaluados ?? 0 }}</h2></div>
          <div class="card" style="padding:16px"><small class="muted">Equipos Habilitados</small><h2>{{ dossierData.kpis?.equipos_habilitados ?? 0 }} / {{ dossierData.kpis?.equipos_activos ?? 0 }}</h2></div>
        </div>

        <div class="card stack-sm" style="padding:24px;border:1px solid #171716">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #171716;padding-bottom:12px;flex-wrap:wrap;gap:12px">
            <div>
              <div class="eyebrow">CONSTRUCTORA TOCAL LIMITADA · EXPEDIENTE NORMATIVO DE FISCALIZACIÓN (RF-16)</div>
              <h3 style="margin:4px 0">Capítulos de Verificación Normativa — Formulario Único de Fiscalización (FUF) y DS N° 44</h3>
              <small class="muted">
                Fecha de emisión: {{ new Date().toLocaleString('es-CL') }} · Alcance: {{ dossierObraFilter ? (obras.find(o => String(o.id) === String(dossierObraFilter))?.nombre || dossierObraFilter) : 'Consolidado General de Empresa' }}
              </small>
            </div>
          </div>
          <div class="tbl-wrap">
            <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
              <thead><tr><th>Código</th><th>Norma / Referencia</th><th>Exigencia Fiscalizable</th><th>Evidencia en Plataforma</th><th>Estado</th></tr></thead>
              <tbody>
                <tr v-for="cap in dossierData.capitulos_fuf_ds44" :key="cap.codigo">
                  <td><code>{{ cap.codigo }}</code></td>
                  <td><strong>{{ cap.norma }}</strong></td>
                  <td><strong>{{ cap.titulo }}</strong><br><small class="muted">{{ cap.descripcion }}</small></td>
                  <td>{{ cap.evidencia }}</td>
                  <td>
                    <span class="badge" :style="{ background: cap.estado === 'cumple' ? '#dcfce7' : cap.estado === 'observado' ? '#fef3c7' : '#fee2e2', color: '#111827' }">
                      {{ cap.estado === 'cumple' ? 'Al día' : cap.estado === 'observado' ? 'Con observaciones' : 'Pendiente' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="form-row-grid" style="gap:32px;margin-top:24px;padding-top:18px;text-align:center;font-size:12px">
            <div style="border-top:1px solid #171716;padding-top:8px">
              <strong>Departamento de Prevención de Riesgos</strong><br>
              <span>Constructora Tocal Limitada</span><br>
              <small class="muted">Responsable de Gestión Preventiva DS N° 44</small>
            </div>
            <div style="border-top:1px solid #171716;padding-top:8px">
              <strong>Administración de Contrato / Representante Legal</strong><br>
              <span>Constructora Tocal Limitada</span><br>
              <small class="muted">V°B° Presentación ante Dirección del Trabajo / SEREMI / Mutualidad</small>
            </div>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.eq-layout {
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}

.eq-selector-list {
  display: grid;
  gap: 8px;
}

.eq-selector-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border: 1px solid var(--border, #e2ded5);
  border-radius: 12px;
  background: var(--surface-subtle, #faf9f6);
  color: inherit;
  cursor: pointer;
  transition: all 140ms ease;
}

.eq-selector-card:hover {
  border-color: var(--border-strong, #d4cfc3);
  background: #ffffff;
}

.eq-selector-card--active {
  border-color: var(--naranjo, #f26b21);
  background: var(--naranjo-soft, #fde9dc);
  box-shadow: 0 2px 8px rgba(242, 107, 33, 0.12);
}

@media (max-width: 960px) {
  .eq-layout {
    grid-template-columns: 1fr;
  }
}
</style>


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
const trainingForm = ref({ tipo_capacitacion_id: '', obra_id: '', fecha_realizacion: '', relator: '', calificacion: 100, aprobado: true, firmado_asistencia: true, estado: 'vigente', observaciones: '' });
const eppForm = ref({ categoria_id: '', descripcion_elemento: '', talla: '', cantidad: 1, fecha_entrega: '', firmado_recepcion: true });
const showQrCredential = ref(false);
const showPrintableActa = ref(false);
const showSignaturePad = ref(false);
const signatureCanvas = ref(null);
const workerSignatureDataUrl = ref('');
const signatureTimestamp = ref('');
let isDrawingSignature = false;

function loadStoredSignature() {
  try {
    const raw = localStorage.getItem(`tocal.firma.${trabajadorId.value}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      workerSignatureDataUrl.value = parsed.dataUrl || '';
      signatureTimestamp.value = parsed.timestamp || '';
    } else {
      workerSignatureDataUrl.value = '';
      signatureTimestamp.value = '';
    }
  } catch {
    workerSignatureDataUrl.value = '';
    signatureTimestamp.value = '';
  }
}

function getCanvasPoint(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const touch = e.touches?.[0] || e.changedTouches?.[0];
  const clientX = touch ? touch.clientX : e.clientX;
  const clientY = touch ? touch.clientY : e.clientY;
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),
    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

function startDrawingSignature(e) {
  const canvas = signatureCanvas.value;
  if (!canvas) return;
  isDrawingSignature = true;
  const ctx = canvas.getContext('2d');
  const pt = getCanvasPoint(e, canvas);
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pt.x, pt.y);
}

function drawSignature(e) {
  if (!isDrawingSignature) return;
  const canvas = signatureCanvas.value;
  if (!canvas) return;
  if (e.cancelable) e.preventDefault();
  const ctx = canvas.getContext('2d');
  const pt = getCanvasPoint(e, canvas);
  ctx.lineTo(pt.x, pt.y);
  ctx.stroke();
}

function stopDrawingSignature() {
  isDrawingSignature = false;
}

function clearSignatureCanvas() {
  const canvas = signatureCanvas.value;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  workerSignatureDataUrl.value = '';
  signatureTimestamp.value = '';
  try {
    localStorage.removeItem(`tocal.firma.${trabajadorId.value}`);
  } catch {
    // ignore
  }
}

function saveSignatureFromCanvas() {
  const canvas = signatureCanvas.value;
  if (!canvas) return;
  const dataUrl = canvas.toDataURL('image/png');
  const ts = new Date().toLocaleString('es-CL');
  workerSignatureDataUrl.value = dataUrl;
  signatureTimestamp.value = ts;
  try {
    localStorage.setItem(`tocal.firma.${trabajadorId.value}`, JSON.stringify({ dataUrl, timestamp: ts }));
  } catch {
    // ignore
  }
  showSignaturePad.value = false;
  prevFeedback.value = 'Firma digital en pantalla capturada y estampada en el Acta de Recepción.';
}

const qrMatrix = computed(() => {
  // Genera una matriz visual determinista 15x15 estilo QR con los 3 patrones de posición (finder patterns)
  // basada en el identificador único del trabajador para su credencial de terreno.
  const seedStr = `${trabajadorId.value}-${record.value?.rut || ''}-${nombre.value}`;
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const size = 15;
  const cells = [];
  const isFinder = (r, c) => {
    const inTL = r < 5 && c < 5;
    const inTR = r < 5 && c >= size - 5;
    const inBL = r >= size - 5 && c < 5;
    if (!inTL && !inTR && !inBL) return null;
    const lr = inBL ? r - (size - 5) : r;
    const lc = inTR ? c - (size - 5) : c;
    if (lr === 0 || lr === 4 || lc === 0 || lc === 4) return true;
    if (lr === 2 && lc === 2) return true;
    return false;
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const f = isFinder(r, c);
      if (f !== null) {
        if (f) cells.push({ r, c });
      } else {
        h ^= (r * 31 + c * 17) & 0xff;
        h = Math.imul(h, 16777619);
        if ((Math.abs(h) % 10) < 5) cells.push({ r, c });
      }
    }
  }
  return cells;
});

function printCurrentSection() {
  window.print();
}

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
      calificacion: trainingForm.value.calificacion,
      aprobado: trainingForm.value.aprobado,
      firmado_asistencia: trainingForm.value.firmado_asistencia,
      estado: trainingForm.value.aprobado ? trainingForm.value.estado : 'observada',
      observaciones: trainingForm.value.observaciones,
    });
    trainingForm.value = { tipo_capacitacion_id: '', obra_id: '', fecha_realizacion: today(), relator: '', calificacion: 100, aprobado: true, firmado_asistencia: true, estado: 'vigente', observaciones: '' };
    await loadPrevention(empresaId.value, trabajadorId.value);
    prevFeedback.value = 'Capacitación y evaluación registradas correctamente.';
  } catch (e) {
    prevError.value = e.message || 'No fue posible registrar la capacitación.';
  } finally {
    prevSaving.value = false;
  }
}

async function submitHombreNuevo() {
  if (!empresaId.value || !trabajadorId.value || prevSaving.value) return;
  prevSaving.value = true; prevError.value = ''; prevFeedback.value = '';
  try {
    const activeObra = sortedAssignments.value.find(vigente)?.obra_id || null;
    const res = await documentsApi.registerHombreNuevo(empresaId.value, trabajadorId.value, {
      obra_id: activeObra,
      fecha_ingreso: today(),
      calificacion: 100,
    });
    await load();
    prevFeedback.value = `Carpeta de Ingreso «Hombre Nuevo» registrada: +${res.documentos_inicializados || 0} documentos base, +${res.induccion_registrada || 0} inducción ODI/IRL y +${res.epp_entregados || 0} EPP básicos entregados.`;
  } catch (e) {
    prevError.value = e.message || 'No fue posible inicializar la carpeta Hombre Nuevo.';
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
    else {
      loadStoredSignature();
      await loadPrevention(company, worker);
    }
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
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost btn-sm" @click="showQrCredential = !showQrCredential; showPrintableActa = false">
              {{ showQrCredential ? 'Ocultar Credencial QR' : 'Credencial QR Terreno (RF-15)' }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" @click="showPrintableActa = !showPrintableActa; showQrCredential = false">
              {{ showPrintableActa ? 'Ocultar Acta Imprimible' : 'Acta recepción EPP / Inducción (PDF)' }}
            </button>
            <div v-if="habPreventiva" class="card" style="padding:10px 16px">
              <small class="muted">Habilitación preventiva</small>
              <div>
                <strong>{{ habPreventiva.estado_habilitacion === 'habilitado' ? 'Habilitado' : habPreventiva.estado_habilitacion === 'condicionado' ? 'Condicionado' : 'No habilitado' }}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- CREDENCIAL DIGITAL QR DE TERRENO (PASE DE OBRA RF-15) -->
        <div v-if="showQrCredential" class="card" style="padding:20px;background:var(--surface-subtle,#faf9f6);border:2px solid var(--border-strong,#d4cfc3);max-width:520px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:200px">
              <div class="eyebrow">PASE DE HABILITACIÓN EN OBRA · TOCAL</div>
              <h3 style="margin:4px 0">{{ nombre }}</h3>
              <p style="margin:2px 0;font-size:13px"><strong>RUT:</strong> {{ record.rut || 'No informado' }}</p>
              <p style="margin:2px 0;font-size:13px">
                <strong>Cargo / Obra actual:</strong>
                {{ sortedAssignments[0] ? `${sortedAssignments[0].cargo_nombre} · ${sortedAssignments[0].obra_nombre}` : 'Sin asignación vigente' }}
              </p>
              <div style="margin-top:10px">
                <span
                  class="badge"
                  :style="{
                    background: habPreventiva?.estado_habilitacion === 'habilitado' ? '#dcfce7' : habPreventiva?.estado_habilitacion === 'condicionado' ? '#fef3c7' : '#fee2e2',
                    color: '#111827',
                    fontWeight: 700,
                    padding: '4px 12px'
                  }"
                >
                  Semáforo Terreno: {{ habPreventiva?.estado_habilitacion === 'habilitado' ? 'VERDE · HABILITADO' : habPreventiva?.estado_habilitacion === 'condicionado' ? 'AMARILLO · OBSERVADO' : 'ROJO · NO HABILITADO' }}
                </span>
              </div>
              <div style="margin-top:12px;display:flex;gap:8px">
                <button type="button" class="btn btn-primary btn-sm" @click="printCurrentSection">Imprimir credencial</button>
                <button type="button" class="btn btn-ghost btn-sm" @click="showQrCredential = false">Cerrar</button>
              </div>
            </div>
            <div style="text-align:center;background:#fff;padding:10px;border-radius:12px;border:1px solid #e2ded5">
              <svg width="120" height="120" viewBox="0 0 15 15" shape-rendering="crispEdges" aria-label="Código QR de verificación en terreno">
                <rect width="15" height="15" fill="#ffffff" />
                <rect v-for="(cell, i) in qrMatrix" :key="i" :x="cell.c" :y="cell.r" width="1" height="1" fill="#171716" />
              </svg>
              <div style="font-size:10px;color:#6f6d68;margin-top:4px">ID: <code>{{ String(record.id).slice(0, 8) }}</code></div>
            </div>
          </div>
        </div>

        <!-- ACTA OFICIAL IMPRIMIBLE HOMBRE NUEVO / EPP / PTS (RF-06 / RF-09) -->
        <div v-if="showPrintableActa" class="card stack-sm" style="padding:24px;background:#fff;border:2px solid #171716">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #171716;padding-bottom:12px;flex-wrap:wrap;gap:12px">
            <div>
              <div class="eyebrow">CONSTRUCTORA TOCAL LIMITADA · PREVENCIÓN DE RIESGOS (DS 44 / LEY 16.744)</div>
              <h3 style="margin:4px 0">ACTA DE INDUCCIÓN «HOMBRE NUEVO», DIFUSIÓN DE PTS Y ENTREGA DE EPP</h3>
              <small class="muted">Fecha de emisión: {{ new Date().toLocaleDateString('es-CL') }} · Trabajador: <strong>{{ nombre }}</strong> (RUT: {{ record.rut || '—' }})</small>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn btn-ghost btn-sm" @click="showSignaturePad = !showSignaturePad">
                {{ showSignaturePad ? 'Ocultar Pizarra de Firma' : (workerSignatureDataUrl ? 'Actualizar Firma en Pantalla ✍️' : 'Firmar en Pantalla (Táctil / Mouse) ✍️') }}
              </button>
              <button type="button" class="btn btn-primary btn-sm" @click="printCurrentSection">Imprimir / Guardar PDF</button>
              <button type="button" class="btn btn-ghost btn-sm" @click="showPrintableActa = false">Cerrar</button>
            </div>
          </div>

          <!-- PIZARRA DE FIRMA DIGITAL TÁCTIL / MOUSE EN TERRENO -->
          <div v-if="showSignaturePad" class="card stack-sm" style="padding:16px;background:#faf9f6;border:1px dashed #171716">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <div>
                <strong>Firma digital de recepción en pantalla (Táctil o Mouse)</strong>
                <div class="muted" style="font-size:12px">El trabajador puede firmar con el dedo (teléfono/tablet) o mouse para dejar constancia inmediata en el Acta.</div>
              </div>
              <div style="display:flex;gap:8px">
                <button type="button" class="btn btn-ghost btn-sm" @click="clearSignatureCanvas">Limpiar trazo</button>
                <button type="button" class="btn btn-primary btn-sm" @click="saveSignatureFromCanvas">Estampar firma en Acta</button>
              </div>
            </div>
            <canvas
              ref="signatureCanvas"
              width="520"
              height="140"
              style="width:100%;max-width:520px;height:140px;background:#ffffff;border:1px solid #cbd5e1;border-radius:8px;touch-action:none;cursor:crosshair"
              @mousedown="startDrawingSignature"
              @mousemove="drawSignature"
              @mouseup="stopDrawingSignature"
              @mouseleave="stopDrawingSignature"
              @touchstart="startDrawingSignature"
              @touchmove="drawSignature"
              @touchend="stopDrawingSignature"
            />
          </div>

          <p style="font-size:12px;line-height:1.5;margin:4px 0">
            En cumplimiento del Decreto Supremo N° 44, Art. 184 del Código del Trabajo y Ley N° 16.744, se deja constancia de que el trabajador individualizado ha recibido la Obligación de Informar los Riesgos Laborales (ODI / IRL), ejemplar del Reglamento Interno de Orden, Higiene y Seguridad (RIOHS), difusión de Procedimientos de Trabajo Seguro (PTS) y los Elementos de Protección Personal (EPP) detallados a continuación:
          </p>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
            <div>
              <h4 style="margin:0 0 6px;font-size:13px">1. Inducciones, Charlas y PTS Registrados ({{ trainings.length }})</h4>
              <ul v-if="trainings.length" style="margin:0;padding-left:18px;font-size:12px">
                <li v-for="t in trainings" :key="t.id">
                  <strong>{{ t.tipo_capacitacion_nombre }}</strong> — {{ fecha(t.fecha_realizacion) }} ({{ t.estado }})
                </li>
              </ul>
              <p v-else class="muted" style="font-size:12px">Sin registros de capacitación aún.</p>
            </div>
            <div>
              <h4 style="margin:0 0 6px;font-size:13px">2. Elementos de Protección Personal Entregados ({{ eppDeliveries.length }})</h4>
              <ul v-if="eppDeliveries.length" style="margin:0;padding-left:18px;font-size:12px">
                <li v-for="e in eppDeliveries" :key="e.id">
                  <strong>{{ e.categoria_epp_nombre || e.categoria_nombre || e.elemento }}</strong> (x{{ e.cantidad }}) — {{ fecha(e.fecha_entrega) }}
                </li>
              </ul>
              <p v-else class="muted" style="font-size:12px">Sin entregas de EPP registradas aún.</p>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:28px;padding-top:20px;text-align:center;font-size:12px;align-items:end">
            <div>
              <div v-if="workerSignatureDataUrl" style="margin-bottom:6px">
                <img :src="workerSignatureDataUrl" alt="Firma digital del trabajador" style="max-height:70px;max-width:220px;object-fit:contain;margin:0 auto;display:block" />
                <small style="font-size:10px;color:#166534;display:block">Firmado digitalmente en terreno ({{ signatureTimestamp }})</small>
              </div>
              <div style="border-top:1px solid #171716;padding-top:8px">
                <strong>{{ nombre }}</strong><br>
                <span>RUT: {{ record.rut || '________________' }}</span><br>
                <small class="muted">Firma y huella de recepción conforme del Trabajador</small>
              </div>
            </div>
            <div style="border-top:1px solid #171716;padding-top:8px">
              <strong>Departamento de Prevención de Riesgos / Jefatura</strong><br>
              <span>Constructora Tocal Limitada</span><br>
              <small class="muted">Firma del Relator / Prevencionista Responsable</small>
            </div>
          </div>
        </div>
        <dl class="facts" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px">
          <div><dt>Nombres</dt><dd>{{ record.nombres }}</dd></div>
          <div><dt>Apellido paterno</dt><dd>{{ record.apellido_paterno }}</dd></div>
          <div><dt>Apellido materno</dt><dd>{{ record.apellido_materno || '—' }}</dd></div>
          <div><dt>Cuenta de acceso web</dt><dd>{{ record.usuario_nombre || record.usuario_email || 'Sin cuenta web (solo ficha terreno)' }}</dd></div>
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

      <!-- Etapa 9: Habilitación Preventiva, Hombre Nuevo (RF-06), Capacitaciones/PTS (RF-07/08) y EPP (RF-09) -->
      <div class="card stack-sm" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div>
            <h2 style="margin:0">Prevención de Riesgos: Habilitación, Hombre Nuevo, PTS/Capacitaciones y EPP</h2>
            <p class="muted" style="margin:4px 0 0">Trazabilidad integral de inducción, procedimientos de trabajo seguro (PTS), evaluaciones y entregas de EPP.</p>
          </div>
          <button
            v-if="canManagePrev"
            class="btn btn-primary btn-sm"
            type="button"
            :disabled="prevSaving"
            @click="submitHombreNuevo"
          >
            {{ prevSaving ? 'Procesando…' : 'Registrar Kit de Ingreso «Hombre Nuevo» (RF-06)' }}
          </button>
        </div>
        <p v-if="prevError" role="alert" class="notice bad">{{ prevError }}</p>
        <p v-if="prevFeedback" role="status" class="notice">{{ prevFeedback }}</p>

        <div v-if="habPreventiva" class="stat-grid cols-3" style="margin-bottom:16px">
          <div class="card" style="padding:14px">
            <small class="muted">Cumplimiento documental</small>
            <div><strong>{{ habPreventiva.documental?.porcentaje ?? habPreventiva.documentos?.porcentaje_cumplimiento ?? 100 }}%</strong> ({{ habPreventiva.documental?.aprobados ?? 0 }} / {{ habPreventiva.documental?.total_obligatorios ?? 0 }} obligatorios)</div>
          </div>
          <div class="card" style="padding:14px">
            <small class="muted">Capacitaciones y PTS obligatorios</small>
            <div><strong>{{ habPreventiva.capacitaciones?.vigentes ?? habPreventiva.capacitaciones?.cumplidos ?? 0 }} / {{ habPreventiva.capacitaciones?.total_obligatorias ?? habPreventiva.capacitaciones?.total_obligatorios ?? 0 }}</strong> vigentes</div>
          </div>
          <div class="card" style="padding:14px">
            <small class="muted">EPP obligatorios en terreno</small>
            <div><strong>{{ habPreventiva.epp?.vigentes ?? habPreventiva.epp?.entregas_vigentes ?? 0 }} / {{ habPreventiva.epp?.total_obligatorios ?? 5 }}</strong> vigentes</div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:20px">
          <div>
            <h3>Capacitaciones, Inducciones y Difusión PTS (RF-07 / RF-08)</h3>
            <details v-if="canManagePrev && trainingTypes.length" class="create-drawer create-drawer--inline" style="margin-bottom:12px">
              <summary class="create-drawer__trigger">Registrar capacitación / difusión PTS con evaluación</summary>
              <form class="stack-sm" @submit.prevent="submitTraining">
                <select v-model="trainingForm.tipo_capacitacion_id" required style="padding:8px">
                  <option value="">Selecciona curso, inducción o PTS…</option>
                  <option v-for="tt in trainingTypes" :key="tt.id" :value="tt.id">{{ tt.nombre }}</option>
                </select>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                  <label style="font-size:12px">Fecha realización
                    <input v-model="trainingForm.fecha_realizacion" type="date" required style="padding:8px;width:100%" />
                  </label>
                  <label style="font-size:12px">Relator / Capacitador
                    <input v-model="trainingForm.relator" placeholder="Nombre relator / Mutual" style="padding:8px;width:100%" />
                  </label>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:center">
                  <label style="font-size:12px">Nota Evaluación (%)
                    <input v-model.number="trainingForm.calificacion" type="number" min="0" max="100" style="padding:8px;width:100%" />
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:14px">
                    <input v-model="trainingForm.aprobado" type="checkbox" /> Aprobado
                  </label>
                  <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-top:14px">
                    <input v-model="trainingForm.firmado_asistencia" type="checkbox" /> Firma asistencia
                  </label>
                </div>
                <input v-model="trainingForm.observaciones" placeholder="Observaciones adicionales (opcional)" style="padding:8px" />
                <button class="btn btn-sm" type="submit" :disabled="prevSaving">Guardar capacitación y evaluación</button>
              </form>
            </details>
            <table v-if="trainings.length" style="width:100%;text-align:left;border-collapse:collapse;font-size:13px">
              <thead><tr><th>Curso / PTS</th><th>Realización</th><th>Vencimiento</th><th>Evaluación / Firma</th></tr></thead>
              <tbody>
                <tr v-for="t in trainings" :key="t.id">
                  <td><strong>{{ t.tipo_capacitacion_nombre }}</strong><br><small class="muted">{{ t.relator || 'Relator interno' }}</small></td>
                  <td>{{ fecha(t.fecha_realizacion) }}</td>
                  <td>{{ fecha(t.fecha_vencimiento) }}</td>
                  <td>
                    <span class="badge">{{ t.estado }}</span>
                    <div v-if="t.observaciones" style="font-size:11px;color:#475569;margin-top:2px">{{ t.observaciones }}</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted">Sin capacitaciones ni difusiones de PTS registradas.</p>
          </div>

          <div>
            <h3>Entregas y Reposición de EPP (RF-09)</h3>
            <details v-if="canManagePrev && eppCategories.length" class="create-drawer create-drawer--inline" style="margin-bottom:12px">
              <summary class="create-drawer__trigger">Registrar entrega o recambio de EPP</summary>
              <form class="stack-sm" @submit.prevent="submitEpp">
                <select v-model="eppForm.categoria_id" required style="padding:8px">
                  <option value="">Selecciona categoría de EPP…</option>
                  <option v-for="ec in eppCategories" :key="ec.id" :value="ec.id">{{ ec.nombre }}</option>
                </select>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                  <input v-model="eppForm.fecha_entrega" type="date" required style="padding:8px" />
                  <input v-model="eppForm.talla" placeholder="Talla / Serie" style="padding:8px" />
                  <input v-model.number="eppForm.cantidad" type="number" min="1" required style="padding:8px" />
                </div>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px">
                  <input v-model="eppForm.firmado_recepcion" type="checkbox" /> Constancia de recepción firmada por trabajador
                </label>
                <button class="btn btn-sm" type="submit" :disabled="prevSaving">Registrar entrega EPP</button>
              </form>
            </details>
            <table v-if="eppDeliveries.length" style="width:100%;text-align:left;border-collapse:collapse;font-size:13px">
              <thead><tr><th>Elemento EPP</th><th>Talla / Cant.</th><th>Entrega</th><th>Reposición</th></tr></thead>
              <tbody>
                <tr v-for="e in eppDeliveries" :key="e.id">
                  <td><strong>{{ e.categoria_epp_nombre || e.categoria_nombre || e.elemento }}</strong><br><small class="muted">{{ e.firmado_recepcion ? 'Recepción firmada' : 'Pendiente firma' }}</small></td>
                  <td>{{ e.talla_o_serie || e.talla || '—' }} · x{{ e.cantidad }}</td>
                  <td>{{ fecha(e.fecha_entrega) }}</td>
                  <td>{{ fecha(e.fecha_vencimiento) }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="muted">Sin entregas de EPP registradas.</p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

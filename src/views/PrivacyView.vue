<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../lib/api';
import { date } from '../lib/format';
import PageCard from '../components/PageCard.vue';

const rows = ref([]);
const adminRows = ref([]);
const canManage = ref(false);
const kind = ref('acceso');
const detail = ref('');
const error = ref('');
const notice = ref('');
const busy = ref(false);

const kinds = [
  ['acceso', 'Acceso'],
  ['rectificacion', 'Rectificación'],
  ['supresion', 'Supresión'],
  ['oposicion', 'Oposición'],
  ['portabilidad', 'Portabilidad'],
  ['bloqueo', 'Bloqueo'],
];

const statusLabels = {
  pendiente: 'Pendiente',
  revision: 'En revisión',
  resuelta: 'Resuelta',
  rechazada: 'Rechazada con fundamento',
};

async function load() {
  try {
    const res = await api.get('/privacidad/solicitudes');
    rows.value = res.results || [];
    canManage.value = Boolean(res.can_manage);
    adminRows.value = res.admin_results || [];
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);

async function submit() {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await api.post('/privacidad/solicitudes', { tipo: kind.value, detalle: detail.value });
    detail.value = '';
    notice.value = 'Solicitud registrada. Se revisará tu identidad y el alcance aplicable antes de responder.';
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function updateStatus(reqItem, nuevoEstado) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await api.patch(`/privacidad/solicitudes/${encodeURIComponent(reqItem.id)}`, { estado: nuevoEstado });
    notice.value = `Solicitud actualizada a «${statusLabels[nuevoEstado] || nuevoEstado}».`;
    await load();
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function downloadPortability(format = 'json') {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const pkg = await api.get('/privacidad/portabilidad');
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portabilidad_datos_tocal_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const lines = [
        'Seccion;Campo;Valor;Detalle;Fecha',
        `Titular;Nombre;${pkg.titular?.nombre || ''};${pkg.titular?.email || ''};${pkg.generado_en || ''}`,
      ];
      for (const f of pkg.fichas_laborales_y_prevencion || []) {
        lines.push(`Ficha Laboral;${f.empresa};${f.nombres} ${f.apellido_paterno};RUT: ${f.rut || 'Reservado'};Activo: ${f.activo ? 'Si' : 'No'}`);
        for (const a of f.asignaciones_obra || []) {
          lines.push(`Asignacion Obra;${a.obra_nombre};${a.cargo};Obra ${a.obra_id};${a.fecha_inicio || ''}`);
        }
        for (const d of f.documentos_laborales || []) {
          lines.push(`Documento;${d.tipo_documento};${d.estado};Vence: ${d.fecha_vencimiento || '—'};${d.fecha_emision || ''}`);
        }
        for (const c of f.capacitaciones_y_pts || []) {
          lines.push(`Capacitacion / PTS;${c.curso_o_pts};${c.estado};Relator: ${c.relator || '—'};${c.fecha_realizacion || ''}`);
        }
        for (const e of f.entregas_epp || []) {
          lines.push(`Entrega EPP;${e.elemento};x${e.cantidad};Firmado: ${e.firmado_recepcion ? 'Si' : 'No'};${e.fecha_entrega || ''}`);
        }
      }
      const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `portabilidad_datos_tocal_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    notice.value = `Paquete de portabilidad personal (${format.toUpperCase()}) descargado exitosamente conforme a la Ley N° 21.719.`;
  } catch (e) {
    error.value = e.message || 'No fue posible generar el archivo de portabilidad.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page-heading">
    <div class="page-heading__titles">
      <h1 class="page-title display">Privacidad y datos personales</h1>
      <p class="page-description">Canal de ejercicio de derechos ARCO+ (Acceso, Rectificación, Supresión, Oposición, Portabilidad y Bloqueo — Ley 19.628 / Ley 21.719)</p>
    </div>
  </div>
  <p class="notice">La presentación de una solicitud no implica su resolución automática. Se evaluarán identidad, alcance y obligaciones legales de conservación laboral y de seguridad (Código del Trabajo, Ley 16.744 y DS 44).</p>
  <p v-if="error" role="alert" class="notice bad">{{error}}</p>
  <p v-if="notice" class="notice">{{notice}}</p>
  <div class="stack">
    <PageCard
      title="Derecho de Portabilidad de Datos Personales en 1 Clic (Ley N° 21.719)"
      description="Descarga de forma inmediata una copia electrónica estructurada con tus datos de cuenta, fichas laborales, asignaciones de obra, documentos, capacitaciones/PTS y entregas de EPP."
    >
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="downloadPortability('json')">
          Descargar mis datos estructurados (JSON)
        </button>
        <button type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="downloadPortability('csv')">
          Descargar resumen en planilla (CSV / Excel)
        </button>
      </div>
    </PageCard>

    <details class="create-drawer">
      <summary class="create-drawer__trigger">Registrar nueva solicitud de derechos ARCO+</summary>
      <form @submit.prevent="submit" class="record-form">
        <div class="field">
          <label>Tipo de solicitud</label>
          <select v-model="kind"><option v-for="[v,label] in kinds" :key="v" :value="v">{{label}}</option></select>
        </div>
        <div class="field">
          <label>Descripción (máximo 1000 caracteres)</label>
          <textarea v-model="detail" maxlength="1000" rows="5" placeholder="Describe brevemente la información involucrada"/>
        </div>
        <button class="btn btn-primary" :disabled="busy">Enviar solicitud</button>
      </form>
    </details>

    <PageCard title="Mis solicitudes registradas">
      <div class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>Fecha</th><th>Derecho ejercido</th><th>Detalle</th><th>Estado</th><th>Cierre</th></tr></thead>
          <tbody>
            <tr v-for="r in rows" :key="r.id">
              <td>{{date(r.created_at)}}</td>
              <td><strong>{{r.tipo}}</strong></td>
              <td><small>{{r.detalle || '—'}}</small></td>
              <td><span class="badge">{{ statusLabels[r.estado] || r.estado }}</span></td>
              <td>{{ r.closed_at ? date(r.closed_at) : '—' }}</td>
            </tr>
            <tr v-if="!rows.length"><td colspan="5">No hay solicitudes registradas.</td></tr>
          </tbody>
        </table>
      </div>
    </PageCard>

    <PageCard
      v-if="canManage"
      title="Administración de Solicitudes ARCO+ (Encargado de Privacidad / Admin)"
      description="Revisión y resolución formal de solicitudes de titulares conforme a la Ley N° 21.719"
    >
      <div class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Titular solicitante</th>
              <th>Derecho</th>
              <th>Detalle</th>
              <th>Estado actual</th>
              <th>Resolución</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ar in adminRows" :key="ar.id">
              <td>{{ date(ar.created_at) }}</td>
              <td>
                <strong>{{ ar.usuario_nombre }}</strong><br>
                <small class="muted">{{ ar.usuario_email }}</small>
              </td>
              <td><strong>{{ ar.tipo }}</strong></td>
              <td><small>{{ ar.detalle || '—' }}</small></td>
              <td><span class="badge">{{ statusLabels[ar.estado] || ar.estado }}</span></td>
              <td style="display:flex;gap:6px;flex-wrap:wrap">
                <button v-if="ar.estado !== 'revision'" type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="updateStatus(ar, 'revision')">En revisión</button>
                <button v-if="ar.estado !== 'resuelta'" type="button" class="btn btn-primary btn-sm" :disabled="busy" @click="updateStatus(ar, 'resuelta')">Marcar resuelta</button>
                <button v-if="ar.estado !== 'rechazada'" type="button" class="btn btn-ghost btn-sm" :disabled="busy" @click="updateStatus(ar, 'rechazada')">Rechazar (conservación legal)</button>
              </td>
            </tr>
            <tr v-if="!adminRows.length"><td colspan="6">No existen solicitudes de titulares registradas en la plataforma.</td></tr>
          </tbody>
        </table>
      </div>
    </PageCard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { state, refreshSession, selectCompany } from '../../../lib/state';
import { formatRut, isValidRut } from '../../../lib/format';
import { authorizationApi as auth } from '../services/authorizationApi';

const companyId = computed(() => state.activeCompanyId);
const tabs = [['company','Empresa'], ['roles','Roles y permisos'], ['members','Miembros'], ['assignments','Asignaciones'], ['audit','Auditoría']];
const activeTab = ref('roles');
const loading = ref(false), working = ref(false), error = ref(''), message = ref('');
const allowed = ref(false), canManage = ref(false), canViewAudit = ref(false), canEditCompany = ref(false);
const companyInfo = ref(null);
const companyForm = ref({ nombre: '', rut: '', activa: true });
const newCompanyForm = ref({ nombre: '', rut: '', sembrar_catalogos: true });
const roles = ref([]), permissions = ref([]), members = ref([]), assignments = ref([]), auditLogs = ref([]);
const auditSearch = ref(''), auditEntityFilter = ref(''), copiedAuditId = ref(''), activeAuditLog = ref(null);

const ENTITY_LABELS = {
  AlertaVencimiento: 'Alerta de Vencimiento',
  DocumentoEmpresa: 'Documento de Empresa',
  DocumentoEquipo: 'Documento de Equipo / Maquinaria',
  DocumentoTrabajador: 'Documento de Trabajador',
  ChecklistInspeccion: 'Checklist / Inspección (RF-12)',
  CapacitacionTrabajador: 'Capacitación / Difusión PTS',
  EntregaEppTrabajador: 'Entrega de EPP (RF-09)',
  Rol: 'Rol de Seguridad (RBAC)',
  AsignacionRol: 'Asignación de Rol',
  MembresiaEmpresa: 'Membresía de Empresa',
  Empresa: 'Empresa',
  Obra: 'Obra / Centro de Trabajo',
  Trabajador: 'Ficha de Trabajador',
};

const ACTION_LABELS = {
  'catalogos.sembrar_base_tocal': 'Inicializar catálogos base TOCAL',
  'alertas.vencimiento.marcar_leida': 'Marcar alerta como leída',
  'alertas.vencimiento.generar': 'Generar alertas de vencimiento',
  'documentos.empresa.aprobar': 'Aprobar documento de empresa',
  'documentos.empresa.rechazar': 'Rechazar documento de empresa',
  'documentos.empresa.pendiente': 'Pasar documento de empresa a revisión',
  'documentos.empresa.en_revision': 'Pasar documento de empresa a revisión',
  'documentos.empresa.crear': 'Registrar documento de empresa',
  'documentos.equipo.aprobar': 'Aprobar documento de equipo',
  'documentos.equipo.rechazar': 'Rechazar documento de equipo',
  'documentos.equipo.pendiente': 'Pasar documento de equipo a revisión',
  'documentos.equipo.en_revision': 'Pasar documento de equipo a revisión',
  'documentos.equipo.crear': 'Registrar documento de equipo',
  'documentos.trabajador.aprobar': 'Aprobar documento laboral',
  'documentos.trabajador.rechazar': 'Rechazar documento laboral',
  'documentos.trabajador.en_revision': 'Pasar documento laboral a revisión',
  'rol.crear': 'Crear rol de seguridad',
  'rol.permisos_actualizar': 'Actualizar matriz de permisos',
};

const DETAIL_KEY_LABELS = {
  leida: 'Estado lectura',
  estado: 'Nuevo estado',
  estado_anterior: 'Estado anterior',
  observacion_revision: 'Observación',
  observacion: 'Observación',
  codigo: 'Código',
  nombre: 'Nombre',
  rol: 'Rol',
  obra_id: 'Obra',
  usuario_id: 'Usuario',
  empresa_id: 'ID Empresa',
  empresa_nombre: 'Empresa',
  documento_id: 'ID Documento',
  entidad_tipo: 'Tipo de entidad',
  nivel: 'Nivel de alerta',
  umbral_dias: 'Umbral (días)',
  dias_restantes: 'Días restantes',
  cargos_creados: 'Cargos creados',
  categorias_epp_creadas: 'Categorías EPP creadas',
  tipos_capacitacion_creados: 'Tipos capacitación creados',
  tipos_documentales_creados: 'Tipos documentales creados',
  requisitos_capacitacion_creados: 'Requisitos capacitación creados',
  requisitos_documentales_creados: 'Requisitos documentales creados',
  creadas: 'Alertas creadas',
  actualizadas: 'Alertas actualizadas',
  resueltas: 'Alertas resueltas',
};

function entityLabel(ent) {
  if (!ent) return 'General';
  return ENTITY_LABELS[ent] || ent.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function actionMeta(accion) {
  const raw = String(accion || '').trim();
  const low = raw.toLowerCase();
  let label = ACTION_LABELS[raw];
  if (!label) {
    label = raw
      .replace(/[._]/g, ' · ')
      .replace(/\b(crear|create)\b/gi, 'Crear')
      .replace(/\b(aprobar|aprobado)\b/gi, 'Aprobar')
      .replace(/\b(rechazar|rechazado)\b/gi, 'Rechazar')
      .replace(/\b(actualizar|update)\b/gi, 'Actualizar')
      .replace(/\b(marcar · leida)\b/gi, 'Marcar leída');
  }
  let tone = 'neutral';
  if (low.includes('aprobar') || low.includes('crear') || low.includes('create') || low.includes('activar') || low.includes('habilitar')) {
    tone = 'ok';
  } else if (low.includes('rechazar') || low.includes('revocar') || low.includes('revoke') || low.includes('eliminar') || low.includes('desactivar')) {
    tone = 'bad';
  } else if (low.includes('revision') || low.includes('pendiente') || low.includes('actualizar') || low.includes('marcar_leida')) {
    tone = 'warn';
  }
  return { label, code: raw, tone };
}

function actorInfo(log) {
  const byId = log.actor_id ? members.value.find(m => String(m.usuario_id) === String(log.actor_id)) : null;
  const byUsername = log.actor_username ? members.value.find(m => String(m.username) === String(log.actor_username) || String(m.usuario_id) === String(log.actor_username)) : null;
  const member = byId || byUsername;
  const name = log.actor_name || (member?.name && member.name !== member.username ? member.name : '') || '';
  const email = log.actor_email || member?.email || '';
  const rawUser = log.actor_username || (log.actor_id ? String(log.actor_id) : '');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(rawUser);
  if (name || email) {
    return {
      primary: name || email,
      secondary: name && email ? email : (isUuid ? `ID #${rawUser.slice(0, 8)}` : rawUser),
    };
  }
  if (!rawUser) return { primary: 'Sistema Automático', secondary: 'Proceso interno TOCAL' };
  if (isUuid) return { primary: 'Usuario Corporativo', secondary: `ID #${rawUser.slice(0, 8)}` };
  return { primary: rawUser, secondary: '' };
}

function formatAuditDate(iso) {
  const raw = String(iso || '');
  if (!raw) return { date: '—', time: '' };
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return {
      date: d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      time: d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
  }
  const [datePart, timePart] = raw.slice(0, 19).split('T');
  return { date: datePart || raw, time: timePart || '' };
}

function shortEntityId(val) {
  const s = String(val || '').trim();
  if (!s) return '—';
  if (s.length <= 12) return `#${s}`;
  return `#${s.slice(0, 8)}…`;
}

async function copyEntityId(val) {
  const s = String(val || '').trim();
  if (!s) return;
  try {
    await navigator.clipboard.writeText(s);
    copiedAuditId.value = s;
    setTimeout(() => { if (copiedAuditId.value === s) copiedAuditId.value = ''; }, 1800);
  } catch { /* ignore */ }
}

function formatDetailValue(key, val) {
  if (val === true) return key === 'leida' ? 'Leída ✓' : 'Sí';
  if (val === false) return key === 'leida' ? 'No leída' : 'No';
  if (val === null || val === undefined || val === '') return '—';
  if (Array.isArray(val)) return val.length ? `${val.length} elemento(s)` : 'Vacío';
  if (typeof val === 'object') return JSON.stringify(val);
  const s = String(val);
  if (s === 'pendiente' || s === 'en_revision') return 'En revisión';
  if (s === 'aprobado') return 'Aprobado';
  if (s === 'rechazado') return 'Rechazado';
  return s;
}

function detailEntries(detalle) {
  if (!detalle || typeof detalle !== 'object') return [];
  return Object.entries(detalle)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => ({
      key: k,
      label: DETAIL_KEY_LABELS[k] || k.replace(/_/g, ' '),
      value: formatDetailValue(k, v),
    }));
}

const filteredAuditLogs = computed(() => {
  const q = auditSearch.value.trim().toLowerCase();
  const ent = auditEntityFilter.value.trim().toLowerCase();
  return auditLogs.value.filter(log => {
    if (ent && String(log.entidad || '').toLowerCase() !== ent) return false;
    if (q) {
      const actor = actorInfo(log);
      const act = actionMeta(log.accion);
      const hay = `${log.accion || ''} ${act.label} ${log.entidad || ''} ${entityLabel(log.entidad)} ${actor.primary} ${actor.secondary} ${log.entidad_id || ''} ${JSON.stringify(log.detalle || {})}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

const auditStats = computed(() => {
  const list = filteredAuditLogs.value;
  let docsAndPrev = 0;
  let accessAndRoles = 0;
  let alertsCount = 0;
  for (const l of list) {
    const e = String(l.entidad || '').toLowerCase();
    const a = String(l.accion || '').toLowerCase();
    if (e.includes('alerta') || a.includes('alerta')) alertsCount++;
    else if (e.includes('rol') || e.includes('membresia') || a.includes('rol') || a.includes('permiso')) accessAndRoles++;
    else docsAndPrev++;
  }
  return { total: list.length, docsAndPrev, accessAndRoles, alertsCount };
});

const auditEntities = computed(() => [...new Set(auditLogs.value.map(l => l.entidad).filter(Boolean))].sort());
const selectedRoleId = ref(''), selectedPermissions = ref([]), expandedMemberId = ref(null);
const newRole = ref({ codigo: '', nombre: '', descripcion: '' });
const newMemberId = ref('');
const newUser = ref({ nombre: '', email: '', password: '', rol_id: '', obra_id: '', crear_trabajador: false, rut: '' });
const assignmentForm = ref({ usuario_id: '', rol_id: '', obra_id: '' });
const selectedRole = computed(() => roles.value.find(r => r.id === selectedRoleId.value));
const modules = computed(() => Object.entries(permissions.value.reduce((acc, p) => { (acc[p.modulo] ||= []).push(p); return acc; }, {})).sort(([a], [b]) => a.localeCompare(b)));
const obraList = computed(() => state.obras || []);
const obraNames = computed(() => Object.fromEntries(obraList.value.map(o => [String(o.id), o.nombre])));
function memberLabel(m) {
  if (!m) return '';
  if (m.name && m.email && m.name !== m.username) return `${m.name} (${m.email})`;
  return m.name || m.email || m.username;
}
const usernames = computed(() => Object.fromEntries(members.value.map(m => [String(m.usuario_id), memberLabel(m)])));
function showError(e) { error.value = e.message || 'Error inesperado'; message.value = ''; }
function selectRole(id) { selectedRoleId.value = id; selectedPermissions.value = [...(roles.value.find(r => r.id === id)?.permisos || [])]; }
async function load() {
  if (!companyId.value) { error.value = 'No tienes una empresa activa autorizada.'; return; }
  loading.value = true; error.value = ''; message.value = '';
  try {
    const rights = await auth.myPermissions(companyId.value);
    const p = rights.permissions || [];
    allowed.value = p.includes('roles.ver') || p.includes('roles.administrar') || p.includes('empresas.ver') || p.includes('auditoria.ver');
    canManage.value = p.includes('roles.administrar');
    canViewAudit.value = p.includes('auditoria.ver') || p.includes('roles.administrar');
    canEditCompany.value = p.includes('empresas.editar') || p.includes('roles.administrar');
    if (!allowed.value) { error.value = 'No tienes permisos para consultar esta sección.'; return; }
    try {
      const compRes = await auth.getCompany(companyId.value);
      companyInfo.value = compRes?.empresa || (compRes?.id ? compRes : null);
      if (companyInfo.value) companyForm.value = { nombre: companyInfo.value.nombre || '', rut: companyInfo.value.rut || '', activa: Boolean(companyInfo.value.activa) };
    } catch { companyInfo.value = null; }
    const [roleRes, permRes] = await Promise.all([auth.roles(companyId.value), auth.permissions(companyId.value)]);
    roles.value = roleRes.results || []; permissions.value = permRes.results || [];
    if (selectedRoleId.value && roles.value.some(r => r.id === selectedRoleId.value)) selectRole(selectedRoleId.value);
    if (canManage.value) {
      const [mRes, aRes] = await Promise.all([
        auth.members(companyId.value),
        auth.assignments(companyId.value),
      ]);
      members.value = mRes.results || []; assignments.value = aRes.results || [];
    }
    if (canViewAudit.value) {
      const logRes = await auth.auditLogs(companyId.value, { limit: 100 }).catch(() => ({ results: [] }));
      auditLogs.value = logRes.results || [];
    }
  } catch (e) { showError(e); } finally { loading.value = false; }
}
async function perform(work, successText) {
  working.value = true; error.value = ''; message.value = '';
  try { await work(); await load(); message.value = successText; } catch (e) { showError(e); } finally { working.value = false; }
}
async function saveCompany() {
  if (!canEditCompany.value) return;
  await perform(async () => { await auth.updateCompany(companyId.value, { ...companyForm.value }); await refreshSession(); }, 'Datos de la empresa actualizados.');
}
async function createNewCompany() {
  if (!canEditCompany.value && !canManage.value) return;
  working.value = true; error.value = ''; message.value = '';
  try {
    const res = await auth.createCompany({ ...newCompanyForm.value });
    const created = res?.empresa || res;
    newCompanyForm.value = { nombre: '', rut: '', sembrar_catalogos: true };
    await refreshSession();
    if (created?.id) {
      selectCompany(created.id);
    }
    await load();
    message.value = `Nueva empresa «${created?.nombre || ''}» creada, configurada con roles y seleccionada como activa.`;
  } catch (e) {
    showError(e);
  } finally {
    working.value = false;
  }
}
async function toggleMemberActive(m) {
  if (!window.confirm(`¿Confirmas ${m.activa ? 'desactivar' : 'activar'} la membresía de ${m.username}?`)) return;
  await perform(() => auth.updateMember(companyId.value, m.id, { activa: !m.activa }), `Membresía ${m.activa ? 'desactivada' : 'activada'}.`);
}
async function createRole() {
  await perform(() => auth.createRole(companyId.value, { ...newRole.value }), 'Rol creado.');
  if (!error.value) newRole.value = { codigo: '', nombre: '', descripcion: '' };
}
async function savePermissions() {
  if (!selectedRole.value) return;
  await perform(() => auth.replaceRolePermissions(companyId.value, selectedRole.value.id, selectedPermissions.value), 'Permisos actualizados.');
}
async function createUser() {
  const payload = {
    nombre: newUser.value.nombre,
    email: newUser.value.email,
    password: newUser.value.password,
  };
  if (newUser.value.rol_id) payload.rol_id = newUser.value.rol_id;
  if (newUser.value.rol_id && newUser.value.obra_id) payload.obra_id = newUser.value.obra_id;
  if (newUser.value.crear_trabajador) {
    payload.crear_trabajador = true;
    if (newUser.value.rut) payload.rut = newUser.value.rut;
  }
  await perform(() => auth.createUser(companyId.value, payload), 'Usuario registrado exitosamente en la empresa.');
  if (!error.value) newUser.value = { nombre: '', email: '', password: '', rol_id: '', obra_id: '', crear_trabajador: false, rut: '' };
}
async function addMember() {
  await perform(() => auth.addMember(companyId.value, newMemberId.value.trim()), 'Membresía registrada.');
  if (!error.value) newMemberId.value = '';
}
async function assign() {
  const payload = { usuario_id: assignmentForm.value.usuario_id, rol_id: assignmentForm.value.rol_id };
  if (assignmentForm.value.obra_id.trim()) payload.obra_id = assignmentForm.value.obra_id.trim();
  await perform(() => auth.assignRole(companyId.value, payload), 'Rol asignado.');
  if (!error.value) assignmentForm.value = { usuario_id: '', rol_id: '', obra_id: '' };
}
async function revoke(item) {
  if (!window.confirm(`¿Revocar el rol ${item.rol} de ${usernames.value[String(item.usuario_id)] || item.usuario_id}?`)) return;
  await perform(() => auth.revokeAssignment(companyId.value, item.id), 'Asignación revocada.');
}
function exportAuditCsv() {
  const lines = ['Fecha;Actor;Correo_o_Referencia;Operacion;Codigo_Accion;Entidad;ID_Entidad;Detalle'];
  for (const log of filteredAuditLogs.value) {
    const fecha = String(log.creado_en || '').slice(0, 19).replace('T', ' ');
    const act = actorInfo(log);
    const actor = String(act.primary || 'Sistema').replace(/;/g, ',');
    const actorSec = String(act.secondary || '').replace(/;/g, ',');
    const meta = actionMeta(log.accion);
    const op = String(meta.label || '').replace(/;/g, ',');
    const accion = String(log.accion || '').replace(/;/g, ',');
    const entidad = String(entityLabel(log.entidad) || '').replace(/;/g, ',');
    const entId = String(log.entidad_id || '').replace(/;/g, ',');
    const det = detailEntries(log.detalle).map(i => `${i.label}: ${i.value}`).join(' | ').replace(/;/g, ',');
    lines.push(`${fecha};${actor};${actorSec};${op};${accion};${entidad};${entId};${det}`);
  }
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bitacora_auditoria_tocal_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
onMounted(load);
watch(companyId, () => { roles.value=[]; permissions.value=[]; members.value=[]; assignments.value=[]; auditLogs.value=[]; allowed.value=false; canManage.value=false; if(companyId.value) load(); });
</script>

<template>
  <section class="authorization-admin">
    <header class="authorization-admin__header">
      <div><h1>Empresa, usuarios, roles y permisos</h1><p>Administración general de la empresa, membresías, control de acceso RBAC y auditoría.</p></div>
      <button class="btn btn-ghost" type="button" :disabled="loading || working" @click="load">Actualizar</button>
    </header>
    <p v-if="error" class="authorization-admin__error" role="alert">{{ error }}</p>
    <p v-if="message" class="authorization-admin__success" role="status">{{ message }}</p>
    <p v-if="loading">Cargando información…</p>
    <template v-if="allowed && !loading">
      <nav class="authorization-admin__tabs" aria-label="Administrar acceso">
        <button v-for="[key,label] in tabs" :key="key" v-show="canManage || key === 'roles' || key === 'company' || (key === 'audit' && canViewAudit)" type="button" class="btn" :class="activeTab === key ? 'btn-primary' : 'btn-ghost'" @click="activeTab=key">{{ label }}</button>
      </nav>
      <section v-if="activeTab === 'company'" class="authorization-admin__grid">
        <div class="card authorization-admin__pane">
          <h2>Empresa activa</h2>
          <template v-if="companyInfo">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0">
              <div style="background:var(--surface-subtle,#faf9f6);padding:12px;border-radius:10px;border:1px solid var(--border,#e2ded5)">
                <small style="color:var(--muted-fg,#6f6d68)">Obras vinculadas</small>
                <div style="font-size:1.3rem;font-weight:750">{{ companyInfo.total_obras ?? obraList.length }}</div>
              </div>
              <div style="background:var(--surface-subtle,#faf9f6);padding:12px;border-radius:10px;border:1px solid var(--border,#e2ded5)">
                <small style="color:var(--muted-fg,#6f6d68)">Miembros activos</small>
                <div style="font-size:1.3rem;font-weight:750">{{ companyInfo.total_miembros_activos ?? members.length }}</div>
              </div>
            </div>
            <form class="authorization-admin__form" @submit.prevent="saveCompany">
              <label>ID de empresa<input :value="companyInfo.id" disabled /></label>
              <label>Nombre / Razón social<input v-model.trim="companyForm.nombre" required maxlength="200" :disabled="!canEditCompany || working" /></label>
              <label>RUT empresarial
                <input v-model.trim="companyForm.rut" maxlength="14" placeholder="76.123.456-7" :disabled="!canEditCompany || working" @input="companyForm.rut = formatRut(companyForm.rut)" />
                <small v-if="companyForm.rut" :style="{ color: isValidRut(companyForm.rut) ? '#166534' : '#b91c1c' }">
                  {{ isValidRut(companyForm.rut) ? '✓ RUT válido' : '✕ Dígito verificador inválido' }}
                </small>
              </label>
              <label class="authorization-admin__check"><input v-model="companyForm.activa" type="checkbox" :disabled="!canEditCompany || working" /><span>Empresa activa</span></label>
              <button v-if="canEditCompany" class="btn btn-primary" type="submit" :disabled="working">Guardar cambios de empresa</button>
            </form>
          </template>
          <p v-else>No fue posible cargar el detalle de la empresa activa.</p>
        </div>

        <div v-if="canEditCompany || canManage" class="card authorization-admin__pane">
          <h2>Multiempresa</h2>
          <p style="color:var(--muted-fg,#6f6d68);font-size:0.9rem;margin-top:4px;margin-bottom:14px">
            Registra una nueva razón social o empresa contratista en la plataforma. Se creará automáticamente tu membresía como Administrador General y sus roles operativos.
          </p>
          <details class="create-drawer">
            <summary class="create-drawer__trigger">Crear nueva empresa</summary>
            <form class="authorization-admin__form" style="margin-top:4px" @submit.prevent="createNewCompany">
              <label>Nombre / Razón social de la nueva empresa
                <input v-model.trim="newCompanyForm.nombre" required maxlength="200" placeholder="Ej: Constructora e Ingeniería Sur SpA" :disabled="working" />
              </label>
              <label>RUT empresarial (opcional)
                <input v-model.trim="newCompanyForm.rut" maxlength="14" placeholder="Ej: 77.654.321-K" :disabled="working" @input="newCompanyForm.rut = formatRut(newCompanyForm.rut)" />
              </label>
              <label class="authorization-admin__check">
                <input v-model="newCompanyForm.sembrar_catalogos" type="checkbox" :disabled="working" />
                <span>Inicializar con catálogos oficiales TOCAL (21 cargos, 27 tipos documentales, PTS, capacitaciones y EPP)</span>
              </label>
              <button class="btn btn-primary" type="submit" :disabled="working">
                {{ working ? 'Creando empresa…' : 'Crear nueva empresa' }}
              </button>
            </form>
          </details>
        </div>
      </section>
      <section v-if="activeTab === 'roles'" class="authorization-admin__grid">
        <div class="card authorization-admin__pane">
          <h2>Roles de la empresa</h2>
          <details v-if="canManage" class="create-drawer" style="margin:10px 0 14px">
            <summary class="create-drawer__trigger">Crear nuevo rol</summary>
            <form class="authorization-admin__form" style="margin-top:4px" @submit.prevent="createRole">
              <label>Código<input v-model.trim="newRole.codigo" required maxlength="100" placeholder="prevencionista" /></label>
              <label>Nombre<input v-model.trim="newRole.nombre" required maxlength="150" placeholder="Prevencionista" /></label>
              <label>Descripción<textarea v-model.trim="newRole.descripcion" rows="2" /></label>
              <button class="btn btn-primary" :disabled="working" type="submit">Crear rol</button>
            </form>
          </details>
          <button v-for="role in roles" :key="role.id" class="authorization-admin__role" :class="{'authorization-admin__role--active':selectedRoleId===role.id}" type="button" @click="selectRole(role.id)">
            <strong>{{ role.nombre }}</strong><small>{{ role.codigo }} · {{ (role.permisos || []).length }} permisos{{ role.protegido ? ' · protegido' : '' }}</small>
          </button>
          <p v-if="!roles.length">No hay roles configurados.</p>
        </div>
        <div class="card authorization-admin__pane">
          <h2>Matriz de permisos</h2>
          <template v-if="selectedRole">
            <p><strong>{{ selectedRole.nombre }}</strong> — {{ selectedRole.descripcion || 'Sin descripción' }}</p>
            <fieldset v-for="[moduleName, perms] in modules" :key="moduleName" class="authorization-admin__permissions">
              <legend>{{ moduleName }}</legend>
              <label v-for="perm in perms" :key="perm.codigo" class="authorization-admin__check">
                <input v-model="selectedPermissions" type="checkbox" :value="perm.codigo" :disabled="selectedRole.protegido || !canManage || working" />
                <span>{{ perm.nombre }} <small>({{ perm.codigo }})</small></span>
              </label>
            </fieldset>
            <button v-if="canManage && !selectedRole.protegido" class="btn btn-primary" type="button" :disabled="working" @click="savePermissions">Guardar permisos</button>
          </template>
          <p v-else>Selecciona un rol para revisar sus permisos.</p>
        </div>
      </section>
      <section v-if="activeTab === 'members' && canManage" class="card authorization-admin__pane">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px">
          <h2 style="margin:0">Miembros de la empresa ({{ members.length }})</h2>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start;margin-bottom:14px">
          <details class="create-drawer" style="flex:1;min-width:280px">
            <summary class="create-drawer__trigger">Crear nuevo usuario en la empresa</summary>
            <form class="authorization-admin__form" style="margin-top:4px" autocomplete="off" @submit.prevent="createUser">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
                <label>Nombre completo<input v-model.trim="newUser.nombre" required maxlength="200" placeholder="Ej: Juan Pérez Soto" /></label>
                <label>Correo electrónico (acceso)<input v-model.trim="newUser.email" type="email" required maxlength="254" placeholder="juan.perez@tocal.cl" /></label>
                <label>Contraseña inicial<input v-model="newUser.password" type="password" required minlength="12" placeholder="Mínimo 12 caracteres" /></label>
              </div>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">
                <label>Rol inicial (opcional)
                  <select v-model="newUser.rol_id">
                    <option value="">Sin rol inicial (asignar después)</option>
                    <option v-for="r in roles.filter(x => x.activo)" :key="r.id" :value="r.id">{{ r.nombre }}</option>
                  </select>
                </label>
                <label v-if="newUser.rol_id">Ámbito del rol
                  <select v-model="newUser.obra_id">
                    <option value="">Toda la empresa (Global)</option>
                    <option v-for="o in obraList" :key="o.id" :value="String(o.id)">Obra: {{ o.nombre }}</option>
                  </select>
                </label>
              </div>
              <div style="padding:12px;border:1px solid #cbd5e1;border-radius:8px;display:grid;gap:10px">
                <label class="authorization-admin__check" style="font-weight:600">
                  <input v-model="newUser.crear_trabajador" type="checkbox" style="width:auto" />
                  <span>Crear también ficha de trabajador vinculada (para asignarlo a obras, documentos y prevención)</span>
                </label>
                <label v-if="newUser.crear_trabajador" style="max-width:280px">RUT del trabajador (opcional)
                  <input v-model.trim="newUser.rut" maxlength="14" placeholder="12.345.678-9" @input="newUser.rut = formatRut(newUser.rut)" />
                  <small v-if="newUser.rut" :style="{ color: isValidRut(newUser.rut) ? '#166534' : '#b91c1c' }">
                    {{ isValidRut(newUser.rut) ? '✓ RUT válido' : '✕ Dígito verificador inválido' }}
                  </small>
                </label>
              </div>
              <div><button class="btn btn-primary" type="submit" :disabled="working">Crear usuario{{ newUser.rol_id ? ' + asignar rol' : '' }}{{ newUser.crear_trabajador ? ' + crear trabajador' : '' }}</button></div>
            </form>
          </details>
          <details class="create-drawer create-drawer--inline">
            <summary class="create-drawer__trigger">Vincular usuario existente por ID</summary>
            <form class="authorization-admin__form" style="max-width:420px;margin-top:4px" @submit.prevent="addMember">
              <label>ID de usuario existente<input v-model.trim="newMemberId" required placeholder="ID numérico de usuario" /></label>
              <button class="btn btn-ghost" type="submit" :disabled="working">Agregar miembro existente</button>
            </form>
          </details>
        </div>
        <div class="authorization-admin__scroll">
          <table class="authorization-admin__table">
            <thead><tr><th>Nombre</th><th>Correo / Cuenta</th><th>Ficha de trabajador</th><th>Permisos efectivos</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>
              <template v-for="m in members" :key="m.id">
                <tr>
                  <td><strong>{{ m.name && m.name !== m.username ? m.name : '—' }}</strong><br><small>ID usuario: <code>{{ m.usuario_id }}</code></small></td>
                  <td>{{ m.email || m.username }}<br><small v-if="m.email"><code>{{ m.username }}</code></small></td>
                  <td>
                    <RouterLink v-if="m.trabajador_id" class="btn btn-ghost btn-sm" :to="{ name: 'trabajador-detalle', params: { trabajadorId: m.trabajador_id } }">
                      Ver ficha ({{ m.trabajador_nombre }})
                    </RouterLink>
                    <small v-else style="color:#64748b">Solo cuenta web</small>
                  </td>
                  <td><button class="btn btn-ghost btn-sm" type="button" @click="expandedMemberId = expandedMemberId === m.id ? null : m.id">{{ (m.permisos_efectivos || []).length }} permisos</button></td>
                  <td>{{ m.activa ? 'Activo' : 'Inactivo' }}</td>
                  <td><button class="btn btn-ghost btn-sm" type="button" :disabled="working" @click="toggleMemberActive(m)">{{ m.activa ? 'Desactivar' : 'Activar' }}</button></td>
                </tr>
                <tr v-if="expandedMemberId === m.id">
                  <td colspan="6"><small><strong>Permisos efectivos:</strong> {{ (m.permisos_efectivos || []).join(', ') || 'Ninguno' }}</small></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
      <section v-if="activeTab === 'assignments' && canManage" class="card authorization-admin__pane">
        <h2>Asignaciones de rol</h2>
        <details class="create-drawer" style="margin-bottom:14px">
          <summary class="create-drawer__trigger">Asignar rol a miembro</summary>
          <form class="authorization-admin__form" style="margin-top:4px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));align-items:end" @submit.prevent="assign">
            <label>Miembro<select v-model="assignmentForm.usuario_id" required><option value="" disabled>Seleccionar miembro</option><option v-for="m in members.filter(x => x.activa)" :key="m.id" :value="m.usuario_id">{{ memberLabel(m) }}</option></select></label>
            <label>Rol<select v-model="assignmentForm.rol_id" required><option value="" disabled>Seleccionar rol</option><option v-for="r in roles.filter(x => x.activo)" :key="r.id" :value="r.id">{{ r.nombre }}</option></select></label>
            <label>Ámbito (Empresa u Obra)
              <select v-model="assignmentForm.obra_id">
                <option value="">Toda la empresa (Global)</option>
                <option v-for="o in obraList" :key="o.id" :value="String(o.id)">Obra: {{ o.nombre }}</option>
              </select>
            </label>
            <button class="btn btn-primary" :disabled="working" type="submit">Asignar rol</button>
          </form>
        </details>
        <div class="authorization-admin__scroll"><table class="authorization-admin__table"><thead><tr><th>Usuario</th><th>Rol</th><th>Alcance</th><th>Estado</th><th></th></tr></thead><tbody>
          <tr v-for="a in assignments" :key="a.id"><td>{{ usernames[String(a.usuario_id)] || a.usuario_id }}</td><td><strong>{{ a.rol_nombre || a.rol }}</strong><br><small><code>{{ a.rol }}</code></small></td><td>{{ a.obra_nombre || obraNames[String(a.obra_id)] || (a.obra_id ? `Obra #${a.obra_id}` : 'Toda la empresa') }}</td><td>{{ a.activa ? 'Activa' : 'Revocada' }}</td><td><button v-if="a.activa" class="btn btn-ghost" type="button" :disabled="working" @click="revoke(a)">Revocar</button></td></tr>
        </tbody></table></div>
      </section>
      <section v-if="activeTab === 'audit' && canViewAudit" class="card authorization-admin__pane">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:16px">
          <div>
            <h2 style="margin:0">Auditoría de seguridad y operaciones ({{ filteredAuditLogs.length }})</h2>
            <p style="margin:4px 0 0;color:var(--muted-fg,#6f6d68);font-size:0.88rem">
              Trazabilidad inmutable de aprobaciones documentales, alertas preventivas, roles RBAC y operaciones críticas.
            </p>
          </div>
          <button v-if="filteredAuditLogs.length" type="button" class="btn btn-primary btn-sm" @click="exportAuditCsv">
            Exportar bitácora de auditoría (CSV)
          </button>
        </div>

        <div class="stat-grid cols-4" style="margin-bottom:16px">
          <div class="audit-kpi">
            <small>Eventos listados</small>
            <strong>{{ auditStats.total }}</strong>
          </div>
          <div class="audit-kpi">
            <small>Documentos y Prevención</small>
            <strong>{{ auditStats.docsAndPrev }}</strong>
          </div>
          <div class="audit-kpi">
            <small>Alertas de Vencimiento</small>
            <strong>{{ auditStats.alertsCount }}</strong>
          </div>
          <div class="audit-kpi">
            <small>Accesos, Roles y RBAC</small>
            <strong>{{ auditStats.accessAndRoles }}</strong>
          </div>
        </div>

        <div class="form-row-grid" style="margin:14px 0;align-items:end">
          <label style="grid-column:span 2;min-width:220px">Buscar por acción, responsable, correo, ID o detalle
            <input v-model.trim="auditSearch" type="search" placeholder="Ej: aprobar, alerta, admin@tocal.cl, rol…" style="width:100%;padding:9px 12px;border:1px solid var(--border-strong,#cbd5e1);border-radius:8px" />
          </label>
          <label style="min-width:200px">Filtrar por tipo de entidad
            <select v-model="auditEntityFilter" style="width:100%;padding:9px 12px;border:1px solid var(--border-strong,#cbd5e1);border-radius:8px">
              <option value="">Todas las entidades ({{ auditEntities.length }})</option>
              <option v-for="ent in auditEntities" :key="ent" :value="ent">{{ entityLabel(ent) }}</option>
            </select>
          </label>
        </div>

        <p v-if="!filteredAuditLogs.length" class="muted" style="padding:18px 0">No hay eventos registrados para los filtros seleccionados.</p>
        <div v-else class="tbl-wrap authorization-admin__scroll">
          <table class="authorization-admin__table audit-table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Actor responsable</th>
                <th>Operación realizada</th>
                <th>Entidad afectada</th>
                <th>Referencia ID</th>
                <th>Detalle registrado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in filteredAuditLogs" :key="log.id">
                <td class="audit-cell-date">
                  <strong>{{ formatAuditDate(log.creado_en).date }}</strong>
                  <small>{{ formatAuditDate(log.creado_en).time }}</small>
                </td>
                <td class="audit-cell-actor">
                  <strong>{{ actorInfo(log).primary }}</strong>
                  <small v-if="actorInfo(log).secondary">{{ actorInfo(log).secondary }}</small>
                </td>
                <td class="audit-cell-action">
                  <span class="audit-badge" :class="`audit-badge--${actionMeta(log.accion).tone}`">
                    {{ actionMeta(log.accion).label }}
                  </span>
                  <code class="audit-code">{{ actionMeta(log.accion).code }}</code>
                </td>
                <td class="audit-cell-entity">
                  <strong>{{ entityLabel(log.entidad) }}</strong>
                  <small v-if="ENTITY_LABELS[log.entidad]">{{ log.entidad }}</small>
                </td>
                <td class="audit-cell-id">
                  <button
                    v-if="log.entidad_id"
                    type="button"
                    class="audit-id-pill"
                    :title="`ID completo: ${log.entidad_id} (clic para copiar)`"
                    @click="copyEntityId(log.entidad_id)"
                  >
                    {{ copiedAuditId === String(log.entidad_id) ? '✓ Copiado' : shortEntityId(log.entidad_id) }}
                  </button>
                  <span v-else class="muted">—</span>
                </td>
                <td class="audit-cell-detail" style="text-align:right">
                  <button
                    v-if="detailEntries(log.detalle).length"
                    type="button"
                    class="btn btn-sm"
                    :class="activeAuditLog?.id === log.id ? 'btn-primary' : 'btn-ghost'"
                    @click="activeAuditLog = activeAuditLog?.id === log.id ? null : log"
                  >
                    {{ activeAuditLog?.id === log.id ? 'Ocultar detalle' : `Ver detalle (${detailEntries(log.detalle).length})` }}
                  </button>
                  <span v-else class="muted" style="font-size:12px">Sin detalle</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- MINI VENTANA NUBE FLOTANTE DE DETALLE DE AUDITORÍA -->
        <div v-if="activeAuditLog" class="audit-cloud-backdrop" @click.self="activeAuditLog = null">
          <div class="audit-cloud-modal" role="dialog" aria-modal="true" aria-label="Detalle del registro de auditoría">
            <div class="audit-cloud-modal__header">
              <div>
                <span class="audit-badge" :class="`audit-badge--${actionMeta(activeAuditLog.accion).tone}`">
                  {{ actionMeta(activeAuditLog.accion).label }}
                </span>
                <code class="audit-code" style="margin-top:6px">{{ actionMeta(activeAuditLog.accion).code }}</code>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" @click="activeAuditLog = null">✕ Cerrar</button>
            </div>

            <div class="audit-cloud-modal__meta">
              <div>
                <small>Fecha y hora</small>
                <strong>{{ formatAuditDate(activeAuditLog.creado_en).date }} · {{ formatAuditDate(activeAuditLog.creado_en).time }}</strong>
              </div>
              <div>
                <small>Actor responsable</small>
                <strong>{{ actorInfo(activeAuditLog).primary }}</strong>
                <span v-if="actorInfo(activeAuditLog).secondary" class="muted" style="display:block;font-size:11.5px">{{ actorInfo(activeAuditLog).secondary }}</span>
              </div>
              <div>
                <small>Entidad afectada</small>
                <strong>{{ entityLabel(activeAuditLog.entidad) }}</strong>
              </div>
              <div v-if="activeAuditLog.entidad_id">
                <small>ID de referencia</small>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px">
                  <code style="font-size:11.5px;word-break:break-all">{{ activeAuditLog.entidad_id }}</code>
                  <button type="button" class="audit-id-pill" @click="copyEntityId(activeAuditLog.entidad_id)">
                    {{ copiedAuditId === String(activeAuditLog.entidad_id) ? '✓ Copiado' : 'Copiar ID' }}
                  </button>
                </div>
              </div>
            </div>

            <div class="audit-cloud-modal__body">
              <strong style="font-size:12.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-fg,#6f6d68)">
                Datos registrados en la operación ({{ detailEntries(activeAuditLog.detalle).length }})
              </strong>
              <div class="audit-cloud-grid">
                <div v-for="item in detailEntries(activeAuditLog.detalle)" :key="item.key" class="audit-cloud-item">
                  <small class="audit-cloud-item__k">{{ item.label }}</small>
                  <strong class="audit-cloud-item__v">{{ item.value }}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.authorization-admin{display:grid;gap:20px;width:100%}
.authorization-admin__header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.authorization-admin__header h1{margin:0 0 6px}
.authorization-admin__header p{margin:0;color:var(--muted-fg,#6f6d68)}
.authorization-admin__tabs{display:flex;gap:8px;flex-wrap:wrap}
.authorization-admin__grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(320px,2fr);gap:18px;align-items:start}
.authorization-admin__pane{padding:24px;min-width:0}
.authorization-admin__role{display:flex;flex-direction:column;gap:4px;width:100%;padding:13px 15px;margin:8px 0;text-align:left;border:1px solid var(--border,#e2ded5);border-radius:12px;background:var(--surface-subtle,#faf9f6);color:inherit;cursor:pointer;transition:all 150ms ease}
.authorization-admin__role:hover{border-color:var(--border-strong,#d4cfc3);background:#fff}
.authorization-admin__role--active{border-color:var(--naranjo,#f26b21);background:var(--naranjo-soft,#fde9dc);box-shadow:0 2px 8px rgba(242,107,33,.12)}
.authorization-admin__role small{color:var(--muted-fg,#6f6d68)}
.authorization-admin__form{display:grid;gap:14px;margin-top:20px;padding:18px;background:var(--surface-subtle,#faf9f6);border:1px solid var(--border,#e2ded5);border-radius:14px}
.authorization-admin__form h3{margin:0 0 4px}
.authorization-admin__form label{display:grid;gap:6px;font-weight:600}
.authorization-admin__permissions{border:1px solid var(--border,#e2ded5);border-radius:12px;margin:12px 0;padding:14px 16px;background:var(--surface-subtle,#faf9f6)}
.authorization-admin__permissions legend{padding:0 8px;font-weight:700;text-transform:capitalize;color:var(--naranjo-ink,#b14a0f)}
.authorization-admin__check{display:flex;align-items:center;gap:10px;padding:5px 0;cursor:pointer}
.authorization-admin__check small{color:var(--muted-fg,#6f6d68)}
.authorization-admin__error{color:var(--bad-ink,#a93030);background:var(--bad-soft,#fbe5e3);padding:12px 16px;border-radius:10px;border:1px solid var(--bad-border,#efc4c0)}
.authorization-admin__success{color:var(--ok-ink,#1f5f3b);background:var(--ok-soft,#e3f1e8);padding:12px 16px;border-radius:10px;border:1px solid var(--ok-border,#c4e0cd)}
.authorization-admin__scroll{overflow:auto;margin-top:16px}
.authorization-admin__table{width:100%;border-collapse:separate;border-spacing:0;text-align:left}
.authorization-admin__table th,.authorization-admin__table td{padding:12px 14px;vertical-align:middle}
.audit-kpi{background:var(--surface-subtle,#faf9f6);border:1px solid var(--border,#e2ded5);border-radius:12px;padding:12px 16px;display:flex;flex-direction:column;gap:4px}
.audit-kpi small{color:var(--muted-fg,#6f6d68);font-size:0.78rem;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.audit-kpi strong{font-size:1.45rem;font-weight:800;color:#171716}
.audit-table th{white-space:nowrap;font-size:0.76rem;letter-spacing:.04em;text-transform:uppercase}
.audit-cell-date{white-space:nowrap;min-width:110px}
.audit-cell-date strong{display:block;font-size:0.86rem;color:#171716}
.audit-cell-date small{display:block;font-size:0.78rem;color:var(--muted-fg,#6f6d68)}
.audit-cell-actor{min-width:180px}
.audit-cell-actor strong{display:block;font-size:0.88rem;color:#171716}
.audit-cell-actor small{display:block;font-size:0.78rem;color:var(--muted-fg,#6f6d68)}
.audit-cell-action{min-width:210px}
.audit-badge{display:inline-block;padding:3px 9px;border-radius:999px;font-size:0.78rem;font-weight:700;line-height:1.3;white-space:nowrap}
.audit-badge--ok{background:#dcfce7;color:#166534;border:1px solid #bbf7d0}
.audit-badge--warn{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
.audit-badge--bad{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
.audit-badge--neutral{background:#f1f5f9;color:#334155;border:1px solid #e2e8f0}
.audit-code{display:block;margin-top:4px;font-size:0.72rem;color:#64748b;background:transparent;padding:0;white-space:nowrap}
.audit-cell-entity{min-width:165px}
.audit-cell-entity strong{display:block;font-size:0.86rem;color:#171716}
.audit-cell-entity small{display:block;font-size:0.74rem;color:var(--muted-fg,#6f6d68)}
.audit-cell-id{white-space:nowrap;min-width:105px}
.audit-id-pill{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:0.76rem;padding:4px 8px;border-radius:6px;border:1px solid var(--border-strong,#d4cfc3);background:var(--surface-subtle,#faf9f6);color:#334155;cursor:pointer;white-space:nowrap;transition:all 120ms ease}
.audit-id-pill:hover{border-color:var(--naranjo,#f26b21);background:#fff;color:#171716}
.audit-cell-detail{white-space:nowrap;min-width:140px}
.audit-cloud-backdrop{position:fixed;inset:0;z-index:1200;background:rgba(23,23,22,0.38);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:20px;animation:auditFadeIn 150ms ease-out}
.audit-cloud-modal{width:min(580px,100%);max-height:85vh;overflow-y:auto;background:#ffffff;border:1px solid var(--border-strong,#d4cfc3);border-radius:18px;box-shadow:0 22px 50px rgba(23,23,22,0.22),0 4px 14px rgba(23,23,22,0.08);padding:22px;display:grid;gap:16px;animation:auditPopIn 160ms cubic-bezier(.16,1,.3,1)}
.audit-cloud-modal__header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border,#e2ded5)}
.audit-cloud-modal__meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;background:var(--surface-subtle,#faf9f6);border:1px solid var(--border,#e2ded5);border-radius:12px;padding:12px 14px}
.audit-cloud-modal__meta small{display:block;font-size:0.72rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted-fg,#6f6d68);margin-bottom:2px}
.audit-cloud-modal__meta strong{font-size:0.86rem;color:#171716}
.audit-cloud-modal__body{display:grid;gap:10px}
.audit-cloud-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}
.audit-cloud-item{background:#ffffff;border:1px solid var(--border,#e2ded5);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:3px;box-shadow:0 1px 3px rgba(0,0,0,0.03)}
.audit-cloud-item__k{font-size:0.74rem;color:var(--muted-fg,#6f6d68);text-transform:capitalize}
.audit-cloud-item__v{font-size:0.88rem;color:#171716;word-break:break-word}
@keyframes auditFadeIn{from{opacity:0}to{opacity:1}}
@keyframes auditPopIn{from{opacity:0;transform:translateY(8px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
@media(max-width:850px){.authorization-admin__grid{grid-template-columns:1fr}}
</style>

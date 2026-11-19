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
const auditSearch = ref(''), auditEntityFilter = ref('');
const filteredAuditLogs = computed(() => {
  const q = auditSearch.value.trim().toLowerCase();
  const ent = auditEntityFilter.value.trim().toLowerCase();
  return auditLogs.value.filter(log => {
    if (ent && String(log.entidad || '').toLowerCase() !== ent) return false;
    if (q) {
      const hay = `${log.accion || ''} ${log.entidad || ''} ${log.actor_username || ''} ${JSON.stringify(log.detalle || {})}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
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
  const lines = ['Fecha;Actor;Accion;Entidad;ID_Entidad;Detalle'];
  for (const log of filteredAuditLogs.value) {
    const fecha = String(log.creado_en || '').slice(0, 19).replace('T', ' ');
    const actor = String(log.actor_username || log.actor_id || 'Sistema').replace(/;/g, ',');
    const accion = String(log.accion || '').replace(/;/g, ',');
    const entidad = String(log.entidad || '').replace(/;/g, ',');
    const entId = String(log.entidad_id || '').replace(/;/g, ',');
    const det = log.detalle ? JSON.stringify(log.detalle).replace(/;/g, ',') : '';
    lines.push(`${fecha};${actor};${accion};${entidad};${entId};${det}`);
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
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <h2 style="margin:0">Auditoría de seguridad y operaciones ({{ filteredAuditLogs.length }})</h2>
          <button v-if="filteredAuditLogs.length" type="button" class="btn btn-primary btn-sm" @click="exportAuditCsv">
            Exportar bitácora de auditoría (CSV)
          </button>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0">
          <label style="flex:1;min-width:200px">Buscar acción, actor o detalle
            <input v-model.trim="auditSearch" type="search" placeholder="Ej: documentos.aprobar, rol, equipo…" style="width:100%;padding:8px;border:1px solid #94a3b8;border-radius:7px" />
          </label>
          <label style="min-width:180px">Entidad
            <select v-model="auditEntityFilter" style="width:100%;padding:8px;border:1px solid #94a3b8;border-radius:7px">
              <option value="">Todas</option>
              <option v-for="ent in auditEntities" :key="ent" :value="ent">{{ ent }}</option>
            </select>
          </label>
        </div>
        <p v-if="!filteredAuditLogs.length">No hay eventos registrados para los filtros seleccionados.</p>
        <div v-else class="authorization-admin__scroll">
          <table class="authorization-admin__table">
            <thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Entidad</th><th>ID</th><th>Detalle</th></tr></thead>
            <tbody>
              <tr v-for="log in filteredAuditLogs" :key="log.id">
                <td>{{ String(log.creado_en || '').slice(0, 19).replace('T', ' ') }}</td>
                <td>{{ log.actor_username || log.actor_id || 'Sistema' }}</td>
                <td><code>{{ log.accion }}</code></td>
                <td>{{ log.entidad }}</td>
                <td><code>{{ log.entidad_id }}</code></td>
                <td><small>{{ log.detalle && Object.keys(log.detalle).length ? JSON.stringify(log.detalle) : '—' }}</small></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.authorization-admin{display:grid;gap:20px;max-width:1200px}
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
.authorization-admin__table code{overflow-wrap:anywhere}
@media(max-width:850px){.authorization-admin__grid{grid-template-columns:1fr}}
</style>

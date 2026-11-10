<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { state, refreshSession } from '../../../lib/state';
import { authorizationApi as auth } from '../services/authorizationApi';

const companyId = computed(() => state.activeCompanyId);
const tabs = [['company','Empresa'], ['roles','Roles y permisos'], ['members','Miembros'], ['assignments','Asignaciones'], ['audit','Auditoría']];
const activeTab = ref('roles');
const loading = ref(false), working = ref(false), error = ref(''), message = ref('');
const allowed = ref(false), canManage = ref(false), canViewAudit = ref(false), canEditCompany = ref(false);
const companyInfo = ref(null);
const companyForm = ref({ nombre: '', rut: '', activa: true });
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
const newUser = ref({ nombre: '', email: '', password: '' });
const assignmentForm = ref({ usuario_id: '', rol_id: '', obra_id: '' });
const selectedRole = computed(() => roles.value.find(r => r.id === selectedRoleId.value));
const modules = computed(() => Object.entries(permissions.value.reduce((acc, p) => { (acc[p.modulo] ||= []).push(p); return acc; }, {})).sort(([a], [b]) => a.localeCompare(b)));
const usernames = computed(() => Object.fromEntries(members.value.map(m => [String(m.usuario_id), m.username])));
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
      companyInfo.value = compRes.empresa || null;
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
  await perform(() => auth.createUser(companyId.value, { ...newUser.value }), 'Usuario creado y agregado a la empresa.');
  if (!error.value) newUser.value = { nombre: '', email: '', password: '' };
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
      <section v-if="activeTab === 'company'" class="card authorization-admin__pane">
        <h2>Información empresarial</h2>
        <form v-if="companyInfo" class="authorization-admin__form" style="max-width:540px" @submit.prevent="saveCompany">
          <label>ID de empresa<input :value="companyInfo.id" disabled /></label>
          <label>Nombre / Razón social<input v-model.trim="companyForm.nombre" required maxlength="200" :disabled="!canEditCompany || working" /></label>
          <label>RUT empresarial<input v-model.trim="companyForm.rut" maxlength="20" :disabled="!canEditCompany || working" /></label>
          <label class="authorization-admin__check"><input v-model="companyForm.activa" type="checkbox" :disabled="!canEditCompany || working" /><span>Empresa activa</span></label>
          <button v-if="canEditCompany" class="btn btn-primary" type="submit" :disabled="working">Guardar cambios de empresa</button>
        </form>
        <p v-else>No fue posible cargar el detalle de la empresa activa.</p>
      </section>
      <section v-if="activeTab === 'roles'" class="authorization-admin__grid">
        <div class="card authorization-admin__pane">
          <h2>Roles de la empresa</h2>
          <button v-for="role in roles" :key="role.id" class="authorization-admin__role" :class="{'authorization-admin__role--active':selectedRoleId===role.id}" type="button" @click="selectRole(role.id)">
            <strong>{{ role.nombre }}</strong><small>{{ role.codigo }} · {{ (role.permisos || []).length }} permisos{{ role.protegido ? ' · protegido' : '' }}</small>
          </button>
          <p v-if="!roles.length">No hay roles configurados.</p>
          <form v-if="canManage" class="authorization-admin__form" @submit.prevent="createRole">
            <h3>Nuevo rol</h3>
            <label>Código<input v-model.trim="newRole.codigo" required maxlength="100" placeholder="prevencionista" /></label>
            <label>Nombre<input v-model.trim="newRole.nombre" required maxlength="150" placeholder="Prevencionista" /></label>
            <label>Descripción<textarea v-model.trim="newRole.descripcion" rows="2" /></label>
            <button class="btn btn-primary" :disabled="working" type="submit">Crear rol</button>
          </form>
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
        <h2>Miembros de la empresa</h2>
        <form class="authorization-admin__form" autocomplete="off" @submit.prevent="createUser">
          <h3>Crear usuario</h3>
          <label>Nombre<input v-model.trim="newUser.nombre" required maxlength="200" /></label>
          <label>Correo<input v-model.trim="newUser.email" type="email" required maxlength="254" /></label>
          <label>Contraseña inicial<input v-model="newUser.password" type="password" required minlength="12" /></label>
          <button class="btn btn-primary" type="submit" :disabled="working">Crear usuario y membresía</button>
        </form>
        <form class="authorization-admin__form" @submit.prevent="addMember">
          <label>ID de usuario existente<input v-model.trim="newMemberId" required placeholder="ID de usuario Django" /></label>
          <button class="btn btn-primary" type="submit" :disabled="working">Agregar miembro</button>
        </form>
        <div class="authorization-admin__scroll">
          <table class="authorization-admin__table">
            <thead><tr><th>Usuario</th><th>Nombre / Correo</th><th>Permisos efectivos</th><th>Estado</th><th>Acción</th></tr></thead>
            <tbody>
              <template v-for="m in members" :key="m.id">
                <tr>
                  <td><strong>{{ m.username }}</strong><br><small>ID: <code>{{ m.usuario_id }}</code></small></td>
                  <td>{{ m.name || '—' }}<br><small>{{ m.email || '' }}</small></td>
                  <td><button class="btn btn-ghost btn-sm" type="button" @click="expandedMemberId = expandedMemberId === m.id ? null : m.id">{{ (m.permisos_efectivos || []).length }} permisos</button></td>
                  <td>{{ m.activa ? 'Activo' : 'Inactivo' }}</td>
                  <td><button class="btn btn-ghost btn-sm" type="button" :disabled="working" @click="toggleMemberActive(m)">{{ m.activa ? 'Desactivar' : 'Activar' }}</button></td>
                </tr>
                <tr v-if="expandedMemberId === m.id">
                  <td colspan="5"><small><strong>Permisos efectivos:</strong> {{ (m.permisos_efectivos || []).join(', ') || 'Ninguno' }}</small></td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
      <section v-if="activeTab === 'assignments' && canManage" class="card authorization-admin__pane">
        <h2>Asignaciones</h2>
        <form class="authorization-admin__form" @submit.prevent="assign">
          <label>Miembro<select v-model="assignmentForm.usuario_id" required><option value="" disabled>Seleccionar miembro</option><option v-for="m in members.filter(x => x.activa)" :key="m.id" :value="m.usuario_id">{{ m.username }}</option></select></label>
          <label>Rol<select v-model="assignmentForm.rol_id" required><option value="" disabled>Seleccionar rol</option><option v-for="r in roles.filter(x => x.activo)" :key="r.id" :value="r.id">{{ r.nombre }}</option></select></label>
          <label>ID de obra (opcional)<input v-model.trim="assignmentForm.obra_id" placeholder="Vacío = toda la empresa" /></label>
          <button class="btn btn-primary" :disabled="working" type="submit">Asignar rol</button>
        </form>
        <div class="authorization-admin__scroll"><table class="authorization-admin__table"><thead><tr><th>Usuario</th><th>Rol</th><th>Alcance</th><th>Estado</th><th></th></tr></thead><tbody>
          <tr v-for="a in assignments" :key="a.id"><td>{{ usernames[String(a.usuario_id)] || a.usuario_id }}</td><td>{{ a.rol }}</td><td>{{ a.obra_id || 'Empresa completa' }}</td><td>{{ a.activa ? 'Activa' : 'Revocada' }}</td><td><button v-if="a.activa" class="btn btn-ghost" type="button" :disabled="working" @click="revoke(a)">Revocar</button></td></tr>
        </tbody></table></div>
      </section>
      <section v-if="activeTab === 'audit' && canViewAudit" class="card authorization-admin__pane">
        <h2>Auditoría de seguridad y operaciones</h2>
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
.authorization-admin{display:grid;gap:18px}.authorization-admin__header{display:flex;justify-content:space-between;align-items:center;gap:12px}.authorization-admin__header h1{margin:0 0 8px}.authorization-admin__header p{margin:0;color:var(--text-muted,#64748b)}.authorization-admin__tabs{display:flex;gap:8px;flex-wrap:wrap}.authorization-admin__grid{display:grid;grid-template-columns:minmax(240px,1fr) minmax(300px,2fr);gap:16px}.authorization-admin__pane{padding:20px;min-width:0}.authorization-admin__role{display:flex;flex-direction:column;gap:4px;width:100%;padding:12px;margin:8px 0;text-align:left;border:1px solid #cbd5e1;border-radius:8px;background:transparent;color:inherit;cursor:pointer}.authorization-admin__role--active{border-color:#2563eb;background:rgba(37,99,235,.06)}.authorization-admin__role small{color:#64748b}.authorization-admin__form{display:grid;gap:12px;margin-top:20px}.authorization-admin__form label{display:grid;gap:5px;font-weight:600}.authorization-admin__form input,.authorization-admin__form textarea,.authorization-admin__form select{width:100%;padding:10px;border:1px solid #94a3b8;border-radius:7px;background:var(--surface,#fff);color:inherit}.authorization-admin__permissions{border:1px solid #cbd5e1;border-radius:8px;margin:12px 0;padding:12px}.authorization-admin__permissions legend{padding:0 8px;font-weight:700;text-transform:capitalize}.authorization-admin__check{display:flex;align-items:flex-start;gap:8px;padding:4px 0}.authorization-admin__check small{color:#64748b}.authorization-admin__error{color:#b91c1c}.authorization-admin__success{color:#15803d}.authorization-admin__scroll{overflow:auto}.authorization-admin__table{width:100%;border-collapse:collapse;margin-top:12px;text-align:left}.authorization-admin__table th,.authorization-admin__table td{padding:10px 12px;border-bottom:1px solid #cbd5e1}.authorization-admin__table code{overflow-wrap:anywhere}@media(max-width:850px){.authorization-admin__grid{grid-template-columns:1fr}}
</style>

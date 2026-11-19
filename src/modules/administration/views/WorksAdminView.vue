<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { state, can, refreshSession } from '../../../lib/state';
import { formatRut, isValidRut } from '../../../lib/format';
import { worksApi } from '../services/worksApi';

const obras = ref([]);
const catalogos = ref({
  mandantes: [],
  servicios: [
    'Construcción y Obras Civiles',
    'Edificación Industrial y Galpones',
    'Montaje Estructural y Metálico',
    'Urbanización, Movimiento de Tierras y Pavimentación',
    'Habilitación Comercial e Institucional',
    'Obras Hidráulicas y Sanitarias',
    'Infraestructura Energética',
    'Remodelación y Mantención Mayor',
  ],
  responsables: [],
  mutualidades: [
    'ACHS (Asociación Chilena de Seguridad)',
    'Mutual de Seguridad CChC',
    'IST (Instituto de Seguridad del Trabajo)',
    'ISL (Instituto de Seguridad Laboral)',
  ],
});
const error = ref('');
const success = ref('');
const busy = ref(false);
const editingId = ref(null);
const selectedMandantePreset = ref('');
const customIdTouched = ref(false);

const canCreate = computed(() => can('obras.crear'));
const canEdit = computed(() => can('obras.editar'));

const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = () => ({
  id: '',
  nombre: '',
  razon_social: '',
  rut: '',
  direccion: '',
  mandante: '',
  servicio: 'Construcción y Obras Civiles',
  adm_contrato: '',
  asesor_pdr: '',
  asesor_mutual: 'Mutual de Seguridad CChC',
  inicio_contrato: todayStr(),
  termino_contrato: '',
  monto_contractual_uf: 0,
  anticipo_uf: 0,
  activa: true,
});

const form = ref(emptyForm());

function slugifyObraId(nombre) {
  const clean = String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  if (!clean) return '';
  const nextNum = String((obras.value?.length || 0) + 1).padStart(3, '0');
  return `OBRA-${clean}-${nextNum}`;
}

function onNombreInput() {
  if (!editingId.value && !customIdTouched.value) {
    form.value.id = slugifyObraId(form.value.nombre);
  }
}

function onSelectMandantePreset() {
  if (!selectedMandantePreset.value || selectedMandantePreset.value === '__manual__') return;
  const found = catalogos.value.mandantes.find(m => m.mandante === selectedMandantePreset.value);
  if (found) {
    form.value.mandante = found.mandante;
    if (found.razon_social) form.value.razon_social = found.razon_social;
    if (found.rut) form.value.rut = found.rut;
  }
}

async function load() {
  error.value = '';
  if (!state.activeCompanyId) {
    obras.value = [];
    return;
  }
  try {
    const res = await worksApi.list();
    obras.value = res.results || [];
    if (res.catalogos) {
      catalogos.value = {
        mandantes: res.catalogos.mandantes || [],
        servicios: res.catalogos.servicios?.length ? res.catalogos.servicios : catalogos.value.servicios,
        responsables: res.catalogos.responsables || [],
        mutualidades: res.catalogos.mutualidades?.length ? res.catalogos.mutualidades : catalogos.value.mutualidades,
      };
    }
  } catch (e) {
    error.value = e.message;
  }
}

function startEdit(o) {
  editingId.value = o.id;
  customIdTouched.value = true;
  selectedMandantePreset.value = '';
  form.value = {
    id: o.id,
    nombre: o.nombre || '',
    razon_social: o.razon_social || '',
    rut: o.rut || '',
    direccion: o.direccion || '',
    mandante: o.mandante || '',
    servicio: o.servicio || '',
    adm_contrato: o.adm_contrato || '',
    asesor_pdr: o.asesor_pdr || '',
    asesor_mutual: o.asesor_mutual || '',
    inicio_contrato: o.inicio_contrato || '',
    termino_contrato: o.termino_contrato || '',
    monto_contractual_uf: Number(o.monto_contractual_uf || 0),
    anticipo_uf: Number(o.anticipo_uf || 0),
    activa: Boolean(o.activa),
  };
}

function cancelEdit() {
  editingId.value = null;
  customIdTouched.value = false;
  selectedMandantePreset.value = '';
  form.value = emptyForm();
}

async function save() {
  busy.value = true;
  error.value = '';
  success.value = '';
  try {
    if (!editingId.value && !form.value.id.trim() && form.value.nombre.trim()) {
      form.value.id = slugifyObraId(form.value.nombre);
    }
    if (!form.value.razon_social.trim() && form.value.mandante.trim()) {
      form.value.razon_social = form.value.mandante.trim();
    }
    const payload = {
      ...form.value,
      monto_contractual_uf: Number(form.value.monto_contractual_uf || 0),
      anticipo_uf: Number(form.value.anticipo_uf || 0),
    };
    if (!payload.termino_contrato) payload.termino_contrato = null;
    if (editingId.value) {
      if (!canEdit.value) return;
      const { id, ...patchData } = payload;
      await worksApi.update(editingId.value, patchData);
      success.value = 'Obra actualizada correctamente.';
    } else {
      if (!canCreate.value) return;
      await worksApi.create(payload);
      success.value = 'Obra creada y vinculada a la empresa.';
    }
    cancelEdit();
    await Promise.all([load(), refreshSession()]);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function toggleActive(obra) {
  if (!canEdit.value) return;
  busy.value = true;
  error.value = '';
  success.value = '';
  try {
    await worksApi.update(obra.id, { activa: !obra.activa });
    success.value = `Obra ${obra.activa ? 'desactivada' : 'activada'}.`;
    await Promise.all([load(), refreshSession()]);
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}

onMounted(load);
watch(
  () => state.activeCompanyId,
  () => {
    obras.value = [];
    cancelEdit();
    if (state.activeCompanyId) load();
  }
);
</script>

<template>
  <section class="stack" style="max-width:1200px">
    <header>
      <h1>Administración de obras</h1>
      <p>Creación, edición, selección de mandantes/clientes, responsables y estado operacional de obras.</p>
    </header>

    <p v-if="error" role="alert" class="notice bad">{{ error }}</p>
    <p v-if="success" role="status" class="notice">{{ success }}</p>

    <details v-if="canCreate || (editingId && canEdit)" class="create-drawer" :open="Boolean(editingId) || undefined">
      <summary class="create-drawer__trigger">{{ editingId ? `Editar obra (${editingId})` : 'Registrar nueva obra' }}</summary>
      <form class="stack-sm" @submit.prevent="save">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
          <small class="muted">Selecciona un mandante existente para autocompletar su Razón Social y RUT, o escríbelo manualmente.</small>
        </div>

        <!-- Selector rápido de Mandante / Cliente registrado -->
        <div v-if="catalogos.mandantes.length" style="padding:14px 16px;background:var(--surface-subtle,#faf9f6);border:1px solid var(--border,#e2ded5);border-radius:12px">
          <label style="display:grid;gap:6px">
            <span>Seleccionar Mandante / Cliente existente (autocompleta Mandante, Razón Social y RUT)</span>
            <select v-model="selectedMandantePreset" @change="onSelectMandantePreset">
              <option value="">-- Elegir de la lista de clientes/mandantes registrados ({{ catalogos.mandantes.length }}) o escribir abajo --</option>
              <option v-for="m in catalogos.mandantes" :key="m.mandante" :value="m.mandante">
                {{ m.mandante }} {{ m.rut ? `(${m.rut})` : '' }}
              </option>
            </select>
          </label>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px">
          <label>
            Nombre de la obra
            <input v-model.trim="form.nombre" required placeholder="Ej: Bodega Logística Pudahuel" @input="onNombreInput" />
          </label>

          <label>
            ID de obra (autgenerado o editable)
            <input v-model.trim="form.id" required maxlength="64" :disabled="Boolean(editingId)" placeholder="Ej: OBRA-PUDAHUEL-002" @input="customIdTouched = true" />
          </label>

          <label>
            Mandante / Cliente (elige o escribe)
            <input v-model.trim="form.mandante" list="tocal-mandantes-list" placeholder="Selecciona o escribe el mandante" />
            <datalist id="tocal-mandantes-list">
              <option v-for="m in catalogos.mandantes" :key="m.mandante" :value="m.mandante">{{ m.rut }}</option>
            </datalist>
          </label>

          <label>
            Razón social
            <input v-model.trim="form.razon_social" required placeholder="Razón social del contrato" />
          </label>

          <label>
            RUT
            <input v-model.trim="form.rut" required maxlength="14" placeholder="Ej: 76.123.456-7" @input="form.rut = formatRut(form.rut)" />
            <small v-if="form.rut" :style="{ color: isValidRut(form.rut) ? '#166534' : '#b91c1c', display: 'block', marginTop: '2px' }">
              {{ isValidRut(form.rut) ? '✓ RUT válido (Módulo 11)' : '✕ Dígito verificador inválido' }}
            </small>
          </label>

          <label>
            Dirección / Ubicación de faena
            <input v-model.trim="form.direccion" placeholder="Comuna, calle o coordenadas" />
          </label>

          <label>
            Servicio / Especialidad
            <input v-model.trim="form.servicio" list="tocal-servicios-list" required placeholder="Selecciona o escribe el servicio" />
            <datalist id="tocal-servicios-list">
              <option v-for="s in catalogos.servicios" :key="s" :value="s" />
            </datalist>
          </label>

          <label>
            Administrador de contrato
            <input v-model.trim="form.adm_contrato" list="tocal-responsables-list" placeholder="Selecciona trabajador o escribe nombre" />
          </label>

          <label>
            Experto en Prevención (PDR)
            <input v-model.trim="form.asesor_pdr" list="tocal-responsables-list" placeholder="Selecciona prevencionista o escribe nombre" />
            <datalist id="tocal-responsables-list">
              <option v-for="r in catalogos.responsables" :key="r" :value="r" />
            </datalist>
          </label>

          <label>
            Organismo Administrador / Mutualidad
            <input v-model.trim="form.asesor_mutual" list="tocal-mutualidades-list" placeholder="ACHS, Mutual CChC, IST, ISL…" />
            <datalist id="tocal-mutualidades-list">
              <option v-for="mut in catalogos.mutualidades" :key="mut" :value="mut" />
            </datalist>
          </label>

          <label>
            Inicio de contrato
            <input v-model="form.inicio_contrato" type="date" required />
          </label>

          <label>
            Término de contrato (opcional)
            <input v-model="form.termino_contrato" type="date" />
          </label>

          <label>
            Monto contractual UF
            <input v-model.number="form.monto_contractual_uf" type="number" step="any" required />
          </label>

          <label>
            Anticipo UF
            <input v-model.number="form.anticipo_uf" type="number" step="any" required />
          </label>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
          <button class="btn btn-primary" type="submit" :disabled="busy">
            {{ busy ? 'Guardando…' : (editingId ? 'Guardar cambios' : 'Crear obra') }}
          </button>
          <button v-if="editingId" class="btn btn-ghost" type="button" @click="cancelEdit">Cancelar edición</button>
        </div>
      </form>
    </details>

    <div class="card stack-sm" style="padding:22px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h2 style="margin:0">Obras registradas ({{ obras.length }})</h2>
        <button class="btn btn-ghost btn-sm" type="button" @click="load">Actualizar</button>
      </div>
      <p v-if="!obras.length" class="muted">No hay obras vinculadas a esta empresa.</p>
      <div v-else style="overflow-x:auto">
        <table>
          <thead>
            <tr>
              <th>Obra</th>
              <th>Mandante / Servicio</th>
              <th>Responsables</th>
              <th>Contrato</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in obras" :key="o.id">
              <td>
                <RouterLink :to="{ name: 'obra', params: { obraId: o.id } }">
                  <strong>{{ o.nombre }}</strong>
                </RouterLink>
                <br />
                <small class="muted">ID: <code>{{ o.id }}</code> · RUT: {{ o.rut }}</small>
              </td>
              <td>
                <strong>{{ o.mandante || o.razon_social }}</strong>
                <br />
                <small class="muted">{{ o.servicio }}</small>
              </td>
              <td>
                <small>
                  Adm: <strong>{{ o.adm_contrato || '—' }}</strong><br />
                  PDR: <strong>{{ o.asesor_pdr || '—' }}</strong>
                </small>
              </td>
              <td>
                <small>
                  {{ o.inicio_contrato || '—' }} → {{ o.termino_contrato || 'En curso' }}<br />
                  <strong>{{ o.monto_contractual_uf }} UF</strong>
                </small>
              </td>
              <td>
                <span class="badge">{{ o.activa ? 'Activa' : 'Inactiva' }}</span>
              </td>
              <td style="display:flex;gap:6px;flex-wrap:wrap">
                <button v-if="canEdit" class="btn btn-ghost btn-sm" type="button" @click="startEdit(o)">Editar</button>
                <button v-if="canEdit" class="btn btn-ghost btn-sm" type="button" :disabled="busy" @click="toggleActive(o)">
                  {{ o.activa ? 'Desactivar' : 'Activar' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>


<script setup>
import {
  ref,
  computed,
  watch,
  onBeforeUnmount,
} from 'vue';

import {
  useRoute,
  RouterLink,
} from 'vue-router';

import {
  Users,
  UserRoundCheck,
  BriefcaseBusiness,
  CalendarDays,
  ArrowRight,
} from 'lucide-vue-next';

import { api } from '../lib/api';
import { state, can } from '../lib/state';
import { documentsApi } from '../modules/administration/services/documentsApi';

import {
  num,
  pct,
  date,
} from '../lib/format';

import StatTile from '../components/StatTile.vue';
import DataChart from '../components/DataChart.vue';
import PageCard from '../components/PageCard.vue';

const route = useRoute();

/* =========================================================
   ESTADO DEL RESUMEN
========================================================= */

const data = ref(null);
const error = ref('');
const loading = ref(false);
const selected = ref(0);

/* =========================================================
   ESTADO DE TRABAJADORES
========================================================= */

const assignments = ref([]);
const workers = ref([]);
const cargos = ref([]);

const workforceLoading = ref(false);
const workforceError = ref('');
const obraCompliance = ref(null);
const obraAlerts = ref([]);

const workerComplianceMap = computed(() => {
  const rows = obraCompliance.value?.trabajadores || [];
  return new Map(rows.map(r => [String(r.trabajador_id), r]));
});

let requestVersion = 0;

const empresaId = computed(() => state.activeCompanyId);
const obraId = computed(() => route.params.obraId);

/* =========================================================
   FUNCIONES AUXILIARES
========================================================= */

function getResults(response) {
  return Array.isArray(response?.results)
    ? response.results
    : [];
}

function getId(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function formatDate(value) {
  if (!value) return '—';

  const text = String(value).slice(0, 10);
  const parts = text.split('-');

  if (parts.length !== 3) return text;

  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function currentLocalDate() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function workerName(worker) {
  if (!worker) return 'Trabajador no disponible';

  const fullName = [
    worker.nombres,
    worker.apellido_paterno,
    worker.apellido_materno,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return worker.nombre || fullName || 'Trabajador';
}

function cargoName(cargo) {
  if (!cargo) return 'Sin cargo';

  return cargo.nombre || 'Sin cargo';
}

/* =========================================================
   RELACIONES DE TRABAJADORES Y CARGOS
========================================================= */

const workersMap = computed(() => {
  return new Map(
    workers.value.map(worker => [
      getId(worker.id),
      worker,
    ])
  );
});

const cargosMap = computed(() => {
  return new Map(
    cargos.value.map(cargo => [
      getId(cargo.id),
      cargo,
    ])
  );
});

/* =========================================================
   ASIGNACIONES ENRIQUECIDAS
========================================================= */

const detailedAssignments = computed(() => {
  return assignments.value.map(item => {
    const workerId = getId(
      item.trabajador_id ?? item.trabajador?.id
    );

    const cargoId = getId(
      item.cargo_id ?? item.cargo?.id
    );

    const worker =
      workersMap.value.get(workerId) ||
      item.trabajador ||
      null;

    const cargo =
      cargosMap.value.get(cargoId) ||
      item.cargo ||
      null;

    return {
      ...item,
      workerId,
      cargoId,
      worker,
      cargo,
      nombreTrabajador:
        item.trabajador_nombre ||
        workerName(worker),

      nombreCargo:
        item.cargo_nombre ||
        cargoName(cargo),

      fechaInicio:
        item.fecha_inicio,

      fechaFin:
        item.fecha_fin,
    };
  });
});

/* =========================================================
   ASIGNACIONES VIGENTES
========================================================= */

const activeAssignments = computed(() => {
  const today = currentLocalDate();

  return detailedAssignments.value.filter(item => {
    if (!item.fechaInicio) return false;

    const start = String(item.fechaInicio).slice(0, 10);

    const end = item.fechaFin
      ? String(item.fechaFin).slice(0, 10)
      : null;

    const workerInactive =
      item.worker?.activo === false;

    if (workerInactive) return false;

    return (
      start <= today &&
      (!end || end >= today)
    );
  });
});

const activeWorkers = computed(() => {
  const ids = new Set();

  return activeAssignments.value.filter(item => {
    if (!item.workerId) return true;

    if (ids.has(item.workerId)) return false;

    ids.add(item.workerId);
    return true;
  });
});

/* =========================================================
   DISTRIBUCIÓN POR CARGOS
========================================================= */

const cargoDistribution = computed(() => {
  const counts = new Map();

  for (const item of activeAssignments.value) {
    const name = item.nombreCargo || 'Sin cargo';

    counts.set(
      name,
      (counts.get(name) || 0) + 1
    );
  }

  return [...counts.entries()]
    .map(([nombre, cantidad]) => ({
      nombre,
      cantidad,
    }))
    .sort((a, b) => {
      return (
        b.cantidad - a.cantidad ||
        a.nombre.localeCompare(b.nombre, 'es')
      );
    });
});

const totalAssigned = computed(
  () => activeWorkers.value.length
);

const totalRoles = computed(
  () => cargoDistribution.value.length
);

const finishedAssignments = computed(() => {
  const today = currentLocalDate();

  return detailedAssignments.value.filter(item => {
    return (
      item.fechaFin &&
      String(item.fechaFin).slice(0, 10) < today
    );
  }).length;
});

/* =========================================================
   CARGA DEL RESUMEN EXISTENTE
========================================================= */

async function loadSummary(version, currentObra) {
  try {
    const response = await api.get(
      `/obras/${encodeURIComponent(currentObra)}/resumen`
    );

    if (version !== requestVersion) return;

    data.value = response;

  } catch (e) {
    if (version !== requestVersion) return;

    error.value =
      e.message || 'No fue posible cargar la obra';

  } finally {
    if (version === requestVersion) {
      loading.value = false;
    }
  }
}

/* =========================================================
   CARGA DE PERSONAL
========================================================= */

async function loadWorkforce(
  version,
  currentEmpresa,
  currentObra
) {
  if (!currentEmpresa || !currentObra) {
    workforceLoading.value = false;
    return;
  }

  workforceLoading.value = true;
  workforceError.value = '';

  try {
    const base = `/empresas/${encodeURIComponent(currentEmpresa)}`;

    const [
      assignmentResponse,
      workerResponse,
      cargoResponse,
    ] = await Promise.all([
      api.get(
        `${base}/obras/${encodeURIComponent(currentObra)}/trabajadores/asignaciones`
      ),

      api.get(`${base}/trabajadores`),

      api.get(`${base}/cargos`),
    ]);

    if (version !== requestVersion) return;

    assignments.value = getResults(
      assignmentResponse
    );

    workers.value = getResults(
      workerResponse
    );

    cargos.value = getResults(
      cargoResponse
    );

  } catch (e) {
    if (version !== requestVersion) return;

    assignments.value = [];
    workers.value = [];
    cargos.value = [];

    workforceError.value =
      e.message ||
      'No fue posible consultar el personal asignado';

  } finally {
    if (version === requestVersion) {
      workforceLoading.value = false;
    }
  }
}

/* =========================================================
   CARGA GENERAL
========================================================= */

async function load() {
  const version = ++requestVersion;

  const currentEmpresa = empresaId.value;
  const currentObra = obraId.value;

  data.value = null;
  assignments.value = [];
  workers.value = [];
  cargos.value = [];
  obraCompliance.value = null;
  obraAlerts.value = [];

  error.value = '';
  workforceError.value = '';

  selected.value = 0;
  loading.value = true;
  workforceLoading.value = Boolean(
    currentEmpresa && currentObra
  );

  if (!currentObra) {
    loading.value = false;
    workforceLoading.value = false;
    return;
  }

  async function loadObraCompliance() {
    if (!currentEmpresa || !currentObra || !(can('documentos.ver') || can('obras.ver') || can('informes.ver'))) {
      return;
    }
    try {
      const [comp, alResp] = await Promise.all([
        documentsApi.complianceDashboard(currentEmpresa, { obra_id: currentObra }),
        documentsApi.alerts(currentEmpresa, { obra_id: currentObra, leida: false }).catch(() => ({ results: [] })),
      ]);
      if (version !== requestVersion) return;
      obraCompliance.value = comp;
      obraAlerts.value = alResp.results || [];
    } catch {
      if (version === requestVersion) {
        obraCompliance.value = null;
        obraAlerts.value = [];
      }
    }
  }

  // Se cargan independientemente para conservar el
  // resumen aunque el módulo laboral no esté autorizado.
  await Promise.all([
    loadSummary(version, currentObra),
    loadWorkforce(
      version,
      currentEmpresa,
      currentObra
    ),
    loadObraCompliance(),
  ]);
}

/* =========================================================
   CAMBIOS DE OBRA Y EMPRESA
========================================================= */

watch(
  () => [
    route.params.obraId,
    state.activeCompanyId,
  ],
  load,
  { immediate: true }
);

onBeforeUnmount(() => {
  requestVersion++;
});
</script>

<template>
  <!-- ERRORES DEL RESUMEN -->
  <p
    v-if="error"
    class="notice bad"
  >
    {{ error }}
  </p>

  <p v-else-if="loading">
    Cargando obra…
  </p>

  <template v-else-if="data">

    <!-- =====================================================
         CURVA S Y RESUMEN
    ====================================================== -->

    <div class="grid-aside obra-overview">

      <PageCard
        title="Curva S"
        description="Programado, real y reprogramado"
        focal
      >
        <div class="pills curve-tabs">
          <button
            v-for="(curve, index) in data.overview?.curve_tabs"
            :key="curve.id"
            class="pill"
            :aria-selected="selected === index"
            @click="selected = index"
          >
            {{ curve.name }}
          </button>
        </div>

        <DataChart
          v-if="data.overview?.curve_tabs?.[selected]"
          :data="data.overview.curve_tabs[selected].chart"
        />

        <p v-else>
          Sin curvas registradas.
        </p>
      </PageCard>

      <div class="obra-overview__side">

        <StatTile
          label="Desvío frente al programa"
          :value="data.overview?.delay"
          :hint="data.overview?.delay_hint"
          :tone="data.overview?.delay_tone"
        />

        <StatTile
          label="Cumplimiento en prevención"
          :value="data.overview?.pdr_text"
          :hint="data.overview?.pdr_hint"
        />

        <StatTile
          label="Facturado del contrato"
          :value="pct(data.summary?.payments?.pct)"
          :hint="data.overview?.billing_hint"
        />

      </div>
    </div>

    <!-- =====================================================
         INDICADORES ORIGINALES
    ====================================================== -->

    <div class="stat-grid cols-4">

      <StatTile
        label="Personas en obra"
        :value="num(data.summary?.total_people)"
        :hint="data.overview?.people_hint"
      />

      <StatTile
        label="Consultas sin responder"
        :value="num(data.summary?.pending)"
        :tone="data.summary?.pending ? 'warn' : 'ok'"
      />

      <StatTile
        label="Accidentes acumulados"
        :value="num(data.overview?.accidents)"
      />

      <StatTile
        label="Último informe"
        :value="date(data.summary?.latest_report?.fecha_corte)"
      />

    </div>

    <!-- =====================================================
         NUEVO: PERSONAL ASIGNADO
    ====================================================== -->

    <div
      style="
        margin-top:24px;
        margin-bottom:24px;
      "
    >
      <PageCard
        title="Personal asignado a la obra"
        description="Trabajadores y cargos con asignación laboral vigente"
      >

        <p
          v-if="workforceLoading"
          class="muted"
        >
          Consultando asignaciones laborales…
        </p>

        <p
          v-else-if="workforceError"
          class="notice bad"
        >
          {{ workforceError }}
        </p>

        <template v-else>

          <!-- CONTADORES -->
          <div
            class="stat-grid cols-3"
            style="margin-bottom:20px"
          >

            <div class="card" style="padding:18px">
              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  margin-bottom:12px;
                "
              >
                <UserRoundCheck :size="18" />

                <span>
                  Trabajadores vigentes
                </span>
              </div>

              <strong
                style="
                  font-size:28px;
                  display:block;
                "
              >
                {{ num(totalAssigned) }}
              </strong>
            </div>

            <div class="card" style="padding:18px">
              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  margin-bottom:12px;
                "
              >
                <BriefcaseBusiness :size="18" />

                <span>
                  Cargos representados
                </span>
              </div>

              <strong
                style="
                  font-size:28px;
                  display:block;
                "
              >
                {{ num(totalRoles) }}
              </strong>
            </div>

            <div class="card" style="padding:18px">
              <div
                style="
                  display:flex;
                  align-items:center;
                  gap:8px;
                  margin-bottom:12px;
                "
              >
                <CalendarDays :size="18" />

                <span>
                  Asignaciones finalizadas
                </span>
              </div>

              <strong
                style="
                  font-size:28px;
                  display:block;
                "
              >
                {{ num(finishedAssignments) }}
              </strong>
            </div>
          </div>

          <!-- DISTRIBUCIÓN POR CARGO -->
          <div
            v-if="cargoDistribution.length"
            style="margin-bottom:24px"
          >
            <h3 style="margin-bottom:12px">
              Distribución por cargo
            </h3>

            <div
              v-for="item in cargoDistribution"
              :key="item.nombre"
              style="
                display:flex;
                justify-content:space-between;
                gap:16px;
                padding:10px 0;
                border-bottom:1px solid var(--border, #ddd);
              "
            >
              <span>{{ item.nombre }}</span>

              <strong>{{ item.cantidad }}</strong>
            </div>
          </div>

          <!-- LISTADO -->
          <h3 style="margin-bottom:12px">
            Trabajadores vigentes
          </h3>

          <p
            v-if="!activeWorkers.length"
            class="muted"
          >
            No hay trabajadores con asignación vigente
            para esta obra.
          </p>

          <div
            v-else
            style="overflow-x:auto"
          >
            <table
              style="
                width:100%;
                border-collapse:collapse;
                text-align:left;
              "
            >
              <thead>
                <tr>
                  <th style="padding:10px">
                    Trabajador
                  </th>

                  <th style="padding:10px">
                    Cargo
                  </th>

                  <th style="padding:10px">
                    Fecha de ingreso
                  </th>

                  <th style="padding:10px">
                    Fecha de término
                  </th>

                  <th style="padding:10px">
                    Estado
                  </th>

                  <th style="padding:10px">
                    Cumplimiento / Prevención
                  </th>
                </tr>
              </thead>

              <tbody>
                <tr
                  v-for="item in activeWorkers"
                  :key="item.id"
                >
                  <td style="padding:10px">
                    <RouterLink
                      v-if="item.workerId"
                      :to="`/administracion/trabajadores/${item.workerId}`"
                    >
                      <strong>{{ item.nombreTrabajador }}</strong>
                    </RouterLink>
                    <span v-else>{{ item.nombreTrabajador }}</span>
                  </td>

                  <td style="padding:10px">
                    {{ item.nombreCargo }}
                  </td>

                  <td style="padding:10px">
                    {{ formatDate(item.fechaInicio) }}
                  </td>

                  <td style="padding:10px">
                    {{ formatDate(item.fechaFin) }}
                  </td>

                  <td style="padding:10px">
                    Vigente
                  </td>

                  <td style="padding:10px">
                    <template v-if="workerComplianceMap.get(String(item.workerId))">
                      <strong>{{ workerComplianceMap.get(String(item.workerId)).porcentaje_cumplimiento }}%</strong>
                      · {{ workerComplianceMap.get(String(item.workerId)).estado_preventivo_label }}
                    </template>
                    <span v-else class="muted">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- ADMINISTRACIÓN -->
          <div
            style="
              display:flex;
              justify-content:flex-end;
              margin-top:20px;
            "
          >
            <RouterLink
              to="/administracion/trabajadores"
              class="btn btn-ghost"
            >
              <Users :size="16" />

              Gestionar trabajadores

              <ArrowRight :size="16" />
            </RouterLink>
          </div>

        </template>
      </PageCard>
    </div>

    <!-- =====================================================
         T10.3: DASHBOARD DE CUMPLIMIENTO POR OBRA
    ====================================================== -->

    <div
      v-if="obraCompliance"
      style="margin-bottom:24px"
    >
      <PageCard
        title="Cumplimiento documental, prevención y equipos en la obra"
        description="Estado operativo de documentos obligatorios, capacitaciones, maquinaria asignada y alertas de vencimiento"
      >
        <div
          class="stat-grid cols-4"
          style="margin-bottom:18px"
        >
          <StatTile
            label="Cumplimiento trabajadores"
            :value="`${obraCompliance.kpis?.porcentaje_cumplimiento_trabajadores ?? 0}%`"
            :hint="`${obraCompliance.kpis?.trabajadores_habilitados_doc ?? 0} de ${obraCompliance.kpis?.trabajadores_evaluados ?? 0} al día`"
            :tone="(obraCompliance.kpis?.porcentaje_cumplimiento_trabajadores ?? 0) >= 85 ? 'ok' : 'warn'"
          />
          <StatTile
            label="Requisitos faltantes / vencidos"
            :value="`${(obraCompliance.kpis?.documentos_faltantes ?? 0) + (obraCompliance.kpis?.documentos_vencidos ?? 0)}`"
            :hint="`${obraCompliance.kpis?.documentos_faltantes ?? 0} faltantes · ${obraCompliance.kpis?.documentos_vencidos ?? 0} vencidos`"
            :tone="((obraCompliance.kpis?.documentos_faltantes ?? 0) + (obraCompliance.kpis?.documentos_vencidos ?? 0)) > 0 ? 'warn' : 'ok'"
          />
          <StatTile
            label="Capacitaciones pendientes"
            :value="`${obraCompliance.kpis?.capacitaciones_pendientes ?? 0}`"
            :hint="`${obraCompliance.kpis?.trabajadores_habilitados_prev ?? 0} habilitados preventivamente`"
            :tone="(obraCompliance.kpis?.capacitaciones_pendientes ?? 0) > 0 ? 'warn' : 'ok'"
          />
          <StatTile
            label="Equipos con doc. vencida"
            :value="`${obraCompliance.kpis?.equipos_con_vencidos ?? 0}`"
            :hint="`${obraCompliance.kpis?.equipos_habilitados ?? 0} de ${obraCompliance.kpis?.equipos_activos ?? 0} equipos habilitados`"
            :tone="(obraCompliance.kpis?.equipos_con_vencidos ?? 0) > 0 ? 'warn' : 'ok'"
          />
        </div>

        <div
          v-if="obraAlerts.length"
          style="margin-top:12px"
        >
          <h3 style="margin-bottom:8px">Alertas documentales activas en la obra ({{ obraAlerts.length }})</h3>
          <ul class="alert-list">
            <li
              v-for="al in obraAlerts.slice(0, 6)"
              :key="al.id"
              class="alert-item"
            >
              <div>
                <strong>{{ al.nivel === 'vencido' ? 'Vencido' : 'Próximo a vencer' }} · {{ al.entidad_tipo }}</strong>
                <p>{{ al.mensaje }} (Vence: {{ formatDate(al.fecha_vencimiento) }})</p>
              </div>
            </li>
          </ul>
        </div>
      </PageCard>
    </div>

    <!-- =====================================================
         INDICADORES EXISTENTES
    ====================================================== -->

    <div class="grid-aside">

      <PageCard
        title="Dotación y horas por semana"
        description="Personal Tocal y subcontratos"
      >
        <DataChart
          type="staff"
          :data="data.overview?.staffing_chart"
          :height="330"
        />
      </PageCard>

      <PageCard title="Requiere atención">
        <ul
          v-if="data.overview?.alerts?.length"
          class="alert-list"
        >
          <li
            v-for="(alert, index) in data.overview.alerts"
            :key="index"
            class="alert-item"
          >
            <div>
              <strong>{{ alert.title }}</strong>

              <p>{{ alert.text }}</p>
            </div>
          </li>
        </ul>

        <p v-else>
          Todo en orden. No hay alertas.
        </p>
      </PageCard>

    </div>

    <!-- =====================================================
         DATOS DEL CONTRATO
    ====================================================== -->

    <PageCard title="Datos del contrato">
      <div class="facts-columns">
        <dl class="facts">
          <div
            v-for="(value, key) in data.obra"
            :key="key"
            v-show="
              !['id', 'created_at'].includes(key)
            "
          >
            <dt>
              {{ key.replaceAll('_', ' ') }}
            </dt>

            <dd>
              {{
                value === null
                  ? '—'
                  : typeof value === 'boolean'
                    ? (value ? 'Sí' : 'No')
                    : value
              }}
            </dd>
          </div>
        </dl>
      </div>
    </PageCard>

  </template>
</template>

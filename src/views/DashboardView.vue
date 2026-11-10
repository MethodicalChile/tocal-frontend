<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { api } from '../lib/api';
import { state, can } from '../lib/state';
import { num, pct, obraPath } from '../lib/format';
import { documentsApi } from '../modules/administration/services/documentsApi';
import { workforceApi } from '../modules/administration/services/workforceApi';
import StatTile from '../components/StatTile.vue';
import PageCard from '../components/PageCard.vue';

const data = ref(null);
const loading = ref(true);
const error = ref('');

// Etapa 10: Panel de cumplimiento documental, preventivo y exportación
const compliance = ref(null);
const complianceLoading = ref(false);
const cargos = ref([]);
const filterObra = ref('');
const filterCargo = ref('');
const filterEstado = ref('');
const exporting = ref(false);

const companyId = computed(() => state.activeCompanyId);
const canViewCompliance = computed(() => can('documentos.ver') || can('informes.ver') || can('obras.ver'));

async function loadCompliance() {
  const id = companyId.value;
  if (!id || !canViewCompliance.value) {
    compliance.value = null;
    return;
  }
  complianceLoading.value = true;
  try {
    const [compResp, cargosResp] = await Promise.all([
      documentsApi.complianceDashboard(id, {
        obra_id: filterObra.value || undefined,
        cargo_id: filterCargo.value || undefined,
        estado: filterEstado.value || undefined,
      }),
      workforceApi.cargos(id).catch(() => ({ results: [] })),
    ]);
    compliance.value = compResp;
    cargos.value = cargosResp.results || [];
  } catch (_) {
    // Non-fatal if user does not have document permissions
  } finally {
    complianceLoading.value = false;
  }
}

async function handleExportCsv() {
  if (!companyId.value || exporting.value) return;
  exporting.value = true;
  try {
    await documentsApi.exportComplianceCsv(companyId.value, {
      obra_id: filterObra.value || undefined,
      cargo_id: filterCargo.value || undefined,
      estado: filterEstado.value || undefined,
    });
  } catch (e) {
    error.value = e.message || 'No fue posible exportar el reporte.';
  } finally {
    exporting.value = false;
  }
}

async function loadDashboard() {
  loading.value = true;
  error.value = '';
  try {
    data.value = await api.get('/dashboard');
    await loadCompliance();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

watch(companyId, loadDashboard);
watch([filterObra, filterCargo, filterEstado], loadCompliance);
onMounted(loadDashboard);
</script>

<template>
  <div class="page-heading">
    <div class="page-heading__titles">
      <div class="eyebrow">Panel general</div>
      <h1 class="page-title display">Hola, {{ state.user?.name?.split(' ')[0] }}</h1>
      <p class="page-description">Control operacional de obras, cumplimiento documental y prevención de riesgos</p>
    </div>
  </div>

  <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
  <p v-else-if="loading">Cargando resumen…</p>

  <template v-else-if="data">
    <div class="stat-grid cols-4 dashboard-stats">
      <StatTile label="Avance medio de obras" :value="pct(data.average_progress)" hint="Real, curva principal de cada obra" focal />
      <StatTile label="Personas en obra" :value="num(data.staff)" hint="Tocal y subcontratos, última semana" />
      <StatTile label="Consultas sin responder" :value="num(data.pending)" hint="RDI pendientes del mandante" :tone="data.pending > 5 ? 'warn' : 'ok'" />
      <StatTile label="Accidentes acumulados" :value="num(data.accidents)" hint="Suma de todas tus obras" :tone="data.accidents ? 'bad' : 'ok'" />
    </div>

    <!-- ETAPA 10: PANEL EJECUTIVO DE CUMPLIMIENTO DOCUMENTAL Y PREVENTIVO -->
    <PageCard
      v-if="compliance"
      title="Cumplimiento documental y preventivo"
      description="Indicadores de empresa, trabajadores, equipos y alertas de vencimiento"
      style="margin-top:20px;margin-bottom:20px"
    >
      <template #actions>
        <button type="button" class="btn btn-sm" :disabled="exporting" @click="handleExportCsv">
          {{ exporting ? 'Exportando…' : 'Exportar CSV / Excel' }}
        </button>
      </template>

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px">
          Obra
          <select v-model="filterObra" style="padding:6px;border-radius:6px">
            <option value="">Todas las obras</option>
            <option v-for="o in state.obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px">
          Cargo
          <select v-model="filterCargo" style="padding:6px;border-radius:6px">
            <option value="">Todos los cargos</option>
            <option v-for="c in cargos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px">
          Estado
          <select v-model="filterEstado" style="padding:6px;border-radius:6px">
            <option value="">Todos</option>
            <option value="al_dia">Al día</option>
            <option value="por_vencer">Por vencer</option>
            <option value="incumplimiento">Con incumplimiento</option>
          </select>
        </label>
      </div>

      <div class="stat-grid cols-4" style="margin-bottom:16px">
        <StatTile
          label="Cumplimiento trabajadores"
          :value="`${compliance.trabajadores?.porcentaje_promedio ?? 100}%`"
          :hint="`${compliance.trabajadores?.al_dia ?? 0} al día · ${compliance.trabajadores?.incumplimiento ?? 0} con brechas`"
          :tone="(compliance.trabajadores?.incumplimiento || 0) > 0 ? 'warn' : 'ok'"
        />
        <StatTile
          label="Cumplimiento empresa"
          :value="`${compliance.empresa?.porcentaje_cumplimiento ?? 100}%`"
          :hint="`Estado: ${compliance.empresa?.estado_global || 'al_dia'}`"
        />
        <StatTile
          label="Equipos habilitados"
          :value="`${compliance.equipos?.porcentaje_promedio ?? 100}%`"
          :hint="`${compliance.equipos?.al_dia ?? 0} de ${compliance.equipos?.total ?? 0} equipos al día`"
        />
        <StatTile
          label="Alertas activas"
          :value="num((compliance.alertas?.vencidos || 0) + (compliance.alertas?.por_vencer || 0))"
          :hint="`${compliance.alertas?.vencidos ?? 0} vencidos · ${compliance.alertas?.por_vencer ?? 0} por vencer`"
          :tone="(compliance.alertas?.vencidos || 0) > 0 ? 'bad' : 'ok'"
        />
      </div>

      <div v-if="compliance.obras?.length" style="overflow-x:auto">
        <h3 style="margin-bottom:8px;font-size:15px">Cumplimiento por obra</h3>
        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:13px">
          <thead>
            <tr>
              <th style="padding:8px">Obra</th>
              <th style="padding:8px">Trabajadores vigentes</th>
              <th style="padding:8px">Al día</th>
              <th style="padding:8px">Incumplimiento</th>
              <th style="padding:8px">% Cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ob in compliance.obras" :key="ob.obra_id">
              <td style="padding:8px">{{ ob.obra_nombre }}</td>
              <td style="padding:8px">{{ ob.trabajadores_total }}</td>
              <td style="padding:8px">{{ ob.trabajadores_al_dia }}</td>
              <td style="padding:8px">{{ ob.trabajadores_incumplimiento }}</td>
              <td style="padding:8px"><strong>{{ ob.porcentaje_cumplimiento }}%</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </PageCard>

    <PageCard v-if="data.sales" :title="`Ventas ${data.year}`" description="Facturación neta del año">
      <template #actions><RouterLink to="/ventas" class="btn btn-sm">Ver ventas →</RouterLink></template>
      <div class="sales-strip">
        <div class="sales-strip__figure">
          <div class="sales-strip__value display">UF {{ num(data.sales?.total?.uf) }}</div>
          <p class="sales-strip__meta">{{ num(data.sales?.total?.clp) }} CLP · {{ data.sales?.documents }} documentos</p>
        </div>
      </div>
    </PageCard>

    <div class="section-head">
      <h2 class="section-head__title">Mis obras</h2>
      <span class="section-head__count">{{ data.cards?.length || 0 }} obras</span>
    </div>
    <div class="obra-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">
      <RouterLink
        v-for="c in data.cards"
        :key="c.obra.id"
        :to="obraPath(c.obra.id)"
        class="card obra-card"
        style="padding:22px;text-decoration:none"
      >
        <div class="card__head">
          <p class="eyebrow">{{ c.obra.activa ? 'En ejecución' : 'Finalizada' }}</p>
          <h3 class="card__title">{{ c.obra.nombre }}</h3>
        </div>
        <p class="muted">{{ c.obra.servicio }}</p>
        <div class="stat-grid cols-2">
          <StatTile label="Avance real" :value="pct(c.state?.real)" />
          <StatTile label="Variación" :value="pct(c.state?.variacion)" :tone="c.progress_tone" />
        </div>
        <div class="muted" style="margin-top:15px">PDR: {{ num(c.pdr, 1) }} % · RDI pendientes: {{ c.pending }}</div>
        <p class="btn btn-sm" style="margin-top:12px">Abrir obra →</p>
      </RouterLink>
    </div>
    <p v-if="!data.cards?.length" class="notice">No tienes obras asignadas todavía.</p>
  </template>
</template>

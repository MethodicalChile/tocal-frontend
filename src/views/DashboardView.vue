<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { RouterLink } from 'vue-router';
import { HardHat, ClipboardCheck, ShieldCheck, Users, Download } from 'lucide-vue-next';
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
const upcomingAlerts = ref([]);
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
    const [compResp, cargosResp, alertsResp] = await Promise.all([
      documentsApi.complianceDashboard(id, {
        obra_id: filterObra.value || undefined,
        cargo_id: filterCargo.value || undefined,
        estado: filterEstado.value || undefined,
      }),
      workforceApi.cargos(id).catch(() => []),
      documentsApi.alerts(id, { leida: false }).catch(() => ({ results: [] })),
    ]);
    compliance.value = compResp;
    cargos.value = Array.isArray(cargosResp) ? cargosResp : (cargosResp?.results || []);
    upcomingAlerts.value = (alertsResp?.results || []).slice(0, 6);
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
      <div class="eyebrow">Panel ejecutivo</div>
      <h1 class="page-title display">Hola, {{ state.user?.name?.split(' ')[0] || 'Usuario' }}</h1>
      <p class="page-description">Control operacional de obras, cumplimiento documental, prevención DS 44 y fiscalización</p>
    </div>
  </div>

  <p v-if="error" class="notice bad" role="alert">{{ error }}</p>
  <p v-else-if="loading">Cargando resumen operacional…</p>

  <template v-else-if="data">
    <div class="stat-grid cols-4 dashboard-stats">
      <StatTile label="Avance medio de obras" :value="pct(data.average_progress)" hint="Real, curva principal de cada obra" focal />
      <StatTile label="Personas en obra" :value="num(data.staff)" hint="Tocal y subcontratos, última semana" />
      <StatTile label="Consultas sin responder" :value="num(data.pending)" hint="RDI pendientes del mandante" :tone="data.pending > 5 ? 'warn' : 'ok'" />
      <StatTile label="Accidentes acumulados" :value="num(data.accidents)" hint="Suma de todas tus obras" :tone="data.accidents ? 'bad' : 'ok'" />
    </div>

    <!-- ACCESOS RÁPIDOS DE TERRENO Y FISCALIZACIÓN (RF-12, RF-15, RF-16) -->
    <div v-if="canViewCompliance" class="quick-actions-grid">
      <RouterLink to="/administracion/consulta-terreno" class="quick-action-card">
        <span class="quick-action-card__icon"><HardHat :size="20" /></span>
        <div>
          <h3 class="quick-action-card__title">Consulta rápida en terreno</h3>
          <p class="quick-action-card__desc">Semáforo de habilitación por RUT, nombre o cargo (RF-15)</p>
        </div>
      </RouterLink>
      <RouterLink to="/administracion/empresa-equipos?tab=checklists" class="quick-action-card">
        <span class="quick-action-card__icon"><ClipboardCheck :size="20" /></span>
        <div>
          <h3 class="quick-action-card__title">Checklists digitales</h3>
          <p class="quick-action-card__desc">Inspecciones pre-operacionales de maquinaria y terreno (RF-12)</p>
        </div>
      </RouterLink>
      <RouterLink to="/administracion/dossier-fiscalizacion" class="quick-action-card">
        <span class="quick-action-card__icon"><ShieldCheck :size="20" /></span>
        <div>
          <h3 class="quick-action-card__title">Dossier FUF / DS 44</h3>
          <p class="quick-action-card__desc">Expediente normativo listo para fiscalización DT / SEREMI (RF-16)</p>
        </div>
      </RouterLink>
      <RouterLink to="/administracion/trabajadores" class="quick-action-card">
        <span class="quick-action-card__icon"><Users :size="20" /></span>
        <div>
          <h3 class="quick-action-card__title">Trabajadores y «Hombre Nuevo»</h3>
          <p class="quick-action-card__desc">Fichas laborales, cargos Tocal, inducciones y entrega de EPP (RF-06)</p>
        </div>
      </RouterLink>
    </div>

    <!-- ETAPA 10: PANEL EJECUTIVO DE CUMPLIMIENTO DOCUMENTAL Y PREVENTIVO -->
    <PageCard
      v-if="compliance"
      title="Cumplimiento documental y preventivo (DS 44)"
      description="Indicadores consolidados de empresa, trabajadores, maquinaria y alertas de vencimiento"
      style="margin-top:20px;margin-bottom:20px"
    >
      <template #actions>
        <button type="button" class="btn btn-primary btn-sm" :disabled="exporting" @click="handleExportCsv">
          <Download :size="15" />
          {{ exporting ? 'Exportando…' : 'Exportar planilla CSV / Excel' }}
        </button>
      </template>

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;padding:12px 14px;background:var(--surface-subtle,#faf9f6);border-radius:12px;border:1px solid var(--border,#e2ded5)">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;flex:1;min-width:190px">
          <span>Obra</span>
          <select v-model="filterObra" style="flex:1">
            <option value="">Todas las obras</option>
            <option v-for="o in state.obras" :key="o.id" :value="o.id">{{ o.nombre }}</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;flex:1;min-width:190px">
          <span>Cargo</span>
          <select v-model="filterCargo" style="flex:1">
            <option value="">Todos los cargos</option>
            <option v-for="c in cargos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;flex:1;min-width:170px">
          <span>Estado</span>
          <select v-model="filterEstado" style="flex:1">
            <option value="">Todos</option>
            <option value="habilitado">Habilitados al día</option>
            <option value="con_observaciones">Con observaciones</option>
            <option value="no_habilitado">No habilitados / Con brechas</option>
          </select>
        </label>
      </div>

      <div class="stat-grid cols-4" style="margin-bottom:18px">
        <StatTile
          label="Cumplimiento trabajadores"
          :value="`${compliance.kpis?.porcentaje_cumplimiento_trabajadores ?? compliance.trabajadores?.porcentaje_promedio ?? 100}%`"
          :hint="`${compliance.kpis?.trabajadores_habilitados_prev ?? 0} de ${compliance.kpis?.trabajadores_evaluados ?? 0} habilitados integralmente`"
          :tone="(compliance.kpis?.documentos_vencidos || 0) > 0 ? 'warn' : 'ok'"
        />
        <StatTile
          label="Cumplimiento empresa"
          :value="`${compliance.kpis?.porcentaje_cumplimiento_empresa ?? compliance.cumplimiento_empresa?.porcentaje_cumplimiento ?? 100}%`"
          :hint="`${compliance.cumplimiento_empresa?.aprobados ?? 0} de ${compliance.cumplimiento_empresa?.total_obligatorios ?? 0} docs corporativos al día`"
        />
        <StatTile
          label="Equipos habilitados"
          :value="`${compliance.kpis?.equipos_habilitados ?? 0} / ${compliance.kpis?.equipos_activos ?? 0}`"
          :hint="`${compliance.kpis?.equipos_con_vencidos ?? 0} equipos con documentos vencidos`"
        />
        <StatTile
          label="Alertas activas"
          :value="num(compliance.kpis?.alertas_no_leidas ?? 0)"
          :hint="`${compliance.kpis?.documentos_vencidos ?? 0} vencidos · ${compliance.kpis?.capacitaciones_pendientes ?? 0} cursos pendientes`"
          :tone="(compliance.kpis?.alertas_no_leidas || 0) > 0 ? 'bad' : 'ok'"
        />
      </div>

      <div v-if="compliance.por_obra?.length" style="overflow-x:auto">
        <h3 style="margin-bottom:10px;font-size:15px">Dotación, equipos y alertas por obra</h3>
        <table>
          <thead>
            <tr>
              <th>Obra</th>
              <th>Estado</th>
              <th>Trabajadores asignados</th>
              <th>Equipos en obra</th>
              <th>Alertas activas</th>
              <th>Último informe PDR</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ob in compliance.por_obra" :key="ob.obra_id">
              <td>
                <RouterLink :to="obraPath(ob.obra_id)" style="font-weight:700;text-decoration:none;color:var(--naranjo-ink,#b14a0f)">
                  {{ ob.obra_nombre }}
                </RouterLink>
              </td>
              <td><span class="badge">{{ ob.activa ? 'En ejecución' : 'Finalizada' }}</span></td>
              <td><strong>{{ ob.trabajadores_asignados }}</strong></td>
              <td>{{ ob.equipos_asignados }}</td>
              <td>
                <span class="badge" :style="{ background: ob.alertas_activas > 0 ? '#fee2e2' : '#dcfce7', color: '#111827' }">
                  {{ ob.alertas_activas }} alertas
                </span>
              </td>
              <td>
                <span v-if="ob.ultimo_informe_pdr">Sem. {{ ob.ultimo_informe_pdr.semana_numero }} ({{ ob.ultimo_informe_pdr.fecha }})</span>
                <small v-else class="muted">Sin informe aún</small>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- RF-13: CUENTA REGRESIVA DE VENCIMIENTOS CRÍTICOS -->
      <div v-if="upcomingAlerts.length" style="margin-top:18px;border-top:1px solid var(--border,#e2ded5);padding-top:14px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
          <h3 style="margin:0;font-size:15px">Semáforo de Vencimientos Próximos y Documentos Vencidos (RF-13)</h3>
          <RouterLink to="/administracion/ajustes?tab=alertas" class="btn btn-ghost btn-sm">Ver todas las alertas →</RouterLink>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px">
          <div
            v-for="al in upcomingAlerts"
            :key="al.id"
            class="card"
            style="padding:12px;border-left:4px solid"
            :style="{ borderLeftColor: al.dias_restantes < 0 ? '#dc2626' : '#d97706' }"
          >
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
              <strong style="font-size:12.5px">{{ al.titulo }}</strong>
              <span class="badge" style="white-space:nowrap;font-weight:700" :style="{ background: al.dias_restantes < 0 ? '#fee2e2' : '#fef3c7', color: '#111827' }">
                {{ al.dias_restantes < 0 ? `Vencido hace ${Math.abs(al.dias_restantes)} días` : al.dias_restantes === 0 ? 'Vence hoy' : `Vence en ${al.dias_restantes} días` }}
              </span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:12px;color:#475569">
              <span>Fecha límite: <strong>{{ al.fecha_vencimiento }}</strong></span>
              <RouterLink v-if="al.trabajador_id" :to="{ name: 'trabajador-detalle', params: { trabajadorId: al.trabajador_id } }" class="btn btn-ghost btn-sm">
                Ir a ficha
              </RouterLink>
            </div>
          </div>
        </div>
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
    <div class="obra-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:18px">
      <RouterLink
        v-for="c in data.cards"
        :key="c.obra.id"
        :to="obraPath(c.obra.id)"
        class="card obra-card"
        style="padding:24px;text-decoration:none"
      >
        <div class="card__head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <p class="eyebrow">{{ c.obra.activa ? 'En ejecución' : 'Finalizada' }}</p>
            <h3 class="card__title" style="font-size:1.15rem;margin-top:4px">{{ c.obra.nombre }}</h3>
          </div>
          <span class="badge">{{ pct(c.state?.real) }}</span>
        </div>
        <p class="muted" style="margin:6px 0 12px">{{ c.obra.servicio }}</p>
        <div class="progress-track" style="margin-bottom:14px">
          <div class="progress-fill" :style="{ width: `${Math.min(100, Math.max(0, (c.state?.real || 0) * 100))}%` }"></div>
        </div>
        <div class="stat-grid cols-2">
          <StatTile label="Avance real" :value="pct(c.state?.real)" />
          <StatTile label="Variación" :value="pct(c.state?.variacion)" :tone="c.progress_tone" />
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--border,#e2ded5)">
          <span class="muted" style="font-size:0.8rem">PDR: <strong>{{ num(c.pdr, 1) }}%</strong> · RDI: <strong>{{ c.pending }}</strong></span>
          <span class="btn btn-primary btn-sm">Abrir obra →</span>
        </div>
      </RouterLink>
    </div>
    <p v-if="!data.cards?.length" class="notice">No tienes obras asignadas todavía.</p>
  </template>
</template>

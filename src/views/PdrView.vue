<script setup>
import { ref,watch,computed } from 'vue';import {useRoute} from 'vue-router';import {api} from '../lib/api';import {notice} from '../lib/state';import {num,pct,date} from '../lib/format';import StatTile from '../components/StatTile.vue';import DataChart from '../components/DataChart.vue';import EditorForm from '../components/EditorForm.vue';import PageCard from '../components/PageCard.vue';
const route=useRoute(),data=ref(null),error=ref(''),week=ref(''),tab=ref('dotacion'),evaluador=ref(''),answers=ref([]),saving=ref(false),onlyFailures=ref(false);
const base=computed(()=>`/obras/${route.params.obraId}/pdr`);
const latestStats = computed(() => data.value?.series?.at(-1) || {});
const indiceFrecuencia = computed(() => {
  const hh = Number(latestStats.value.hh_totales || 0);
  const acc = Number(latestStats.value.accidentes || 0);
  if (!hh) return '0,0';
  return num((acc * 1000000) / hh, 1);
});
const tasaAccidentabilidad = computed(() => {
  const pers = Number(latestStats.value.total_personal || 0);
  const acc = Number(latestStats.value.accidentes || 0);
  if (!pers) return '0,0 %';
  return `${num((acc / pers) * 100, 1)} %`;
});
function markAllChecklist(estado = 'cumple') {
  answers.value.forEach(r => { r.estado = estado; });
}
async function load(){try{data.value=await api.get(base.value+(week.value?'?semana='+week.value:''));week.value=data.value?.week?.id||'';answers.value=(data.value.checklist?.rows||[]).map(r=>({id:r.item.id,estado:r.estado,observacion:r.observacion||'',item:r.item}));evaluador.value=data.value.checklist?.evaluado_por||'';}catch(e){error.value=e.message}}
watch(()=>route.params.obraId,()=>{week.value='';load()},{immediate:true});
async function addWeek(){try{const r=await api.post(base.value+'/semanas',{});week.value=r.week.id;await load();notice('Semana creada')}catch(e){error.value=e.message}}
async function saveStaff(values){saving.value=true;try{await api.put(base.value+'/semanas/'+week.value+'/dotacion',values);await load();notice('Dotación guardada')}catch(e){error.value=e.message}finally{saving.value=false}}
async function saveChecklist(){saving.value=true;try{await api.put(base.value+'/semanas/'+week.value+'/checklist',{evaluado_por:evaluador.value,rows:answers.value.map(({id,estado,observacion})=>({id,estado,observacion}))});await load();notice('Checklist guardado')}catch(e){error.value=e.message}finally{saving.value=false}}
</script>
<template><div class="page-heading page-heading--module"><div class="page-heading__titles"><h2 class="page-title display">Prevención</h2><p class="page-description">Dotación semanal, índices de siniestralidad (DS 67) y checklist DS 76 y DS 44</p></div><div class="page-actions"><select v-if="data?.weeks?.length" v-model="week" @change="load"><option v-for="w in data.weeks" :key="w.id" :value="w.id">Semana {{w.numero}} · {{date(w.fecha_inicio)}}</option></select><button v-if="data?.editable" class="btn btn-primary" @click="addWeek">+ Nueva semana</button></div></div>
<p v-if="error" class="notice bad">{{error}}</p><template v-if="data?.week"><div class="stat-grid cols-4"><StatTile label="Cumplimiento checklist" :value="num(data.checklist?.total,1)+' %'" focal/><StatTile label="Personas en obra" :value="num(latestStats.total_personal)" :hint="`HH semana: ${num(latestStats.hh_totales)}`"/><StatTile label="Índice Frecuencia (IF)" :value="indiceFrecuencia" hint="Accidentes × 1.000.000 / HH (DS 67)" :tone="Number(latestStats.accidentes) > 0 ? 'warn' : 'ok'"/><StatTile label="Tasa Accidentabilidad" :value="tasaAccidentabilidad" :hint="`${num(latestStats.accidentes)} accidente(s) en la semana`" :tone="Number(latestStats.accidentes) > 0 ? 'bad' : 'ok'"/></div>
<div class="pills tabs" role="tablist"><button v-for="[k,label] in [['dotacion','Dotación de la semana'],['checklist','Lista de chequeo'],['historico','Histórico']]" :key="k" class="pill" :aria-selected="tab===k" @click="tab=k">{{label}}</button></div>
<PageCard v-if="tab==='dotacion'" :title="`Semana ${data.week.numero}, del ${date(data.week.fecha_inicio)} al ${date(data.week.fecha_fin)}`" description="Control estadístico del personal"><EditorForm :schema="data.staffing" :disabled="!data.editable" :saving="saving" @submit="saveStaff"/></PageCard>
<div v-else-if="tab==='checklist'" class="checklist-layout"><PageCard title="Cumplimiento"><div class="display" style="font-size:36px">{{num(data.checklist?.total,1)}} %</div><p v-for="s in data.sections" :key="s.key">{{s.name}} · {{s.pct_text}}</p></PageCard><section class="card checklist-card"><header class="checklist-toolbar"><h2 class="card__title">Lista de chequeo</h2><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><label class="check"><input type="checkbox" v-model="onlyFailures"/> Solo incumplimientos</label><button v-if="data.editable" type="button" class="btn btn-ghost btn-sm" @click="markAllChecklist('cumple')">Marcar todos «Cumple»</button></div><div class="field"><label>Evaluado por</label><input v-model="evaluador" maxlength="120" :disabled="!data.editable"/></div></header><div class="checklist-body"><div v-for="r in answers.filter(x=>!onlyFailures||x.estado==='no_cumple')" :key="r.id" class="checklist-item"><span class="checklist-item__code">{{r.item.codigo}}</span><p class="checklist-item__text">{{r.item.descripcion}}</p><div class="state-toggle"><label v-for="[k,t] in [['cumple','Cumple'],['no_cumple','No cumple'],['no_aplica','No aplica']]" :key="k" class="state-toggle__item" :class="'is-'+k.replaceAll('_','-')"><input type="radio" v-model="r.estado" :name="'estado_'+r.id" :value="k" :disabled="!data.editable"/><span>{{t}}</span></label></div><input v-model="r.observacion" class="checklist-item__obs" maxlength="500" placeholder="Observación" :disabled="!data.editable"/></div></div><div class="card__footer"><button v-if="data.editable" class="btn btn-primary" :disabled="saving" @click="saveChecklist">Guardar checklist</button></div></section></div>
<div v-else class="grid-aside"><PageCard title="Dotación semanal"><DataChart type="staff" :data="data.staffing_chart"/></PageCard><PageCard title="Accidentabilidad"><DataChart type="accidents" :data="data.accidents_chart"/></PageCard></div></template><p v-else-if="data" class="notice">Esta obra no tiene semanas registradas. Crea la primera semana para comenzar.</p></template>

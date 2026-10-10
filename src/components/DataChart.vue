<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
const p = defineProps({ data: Object, type: { type: String, default: 'curve' }, height: { type: Number, default: 300 } });
const el = ref(null); let instance;
function config() {
  const d = p.data || {};
  if (p.type === 'curve') {
    const pts = d.points || [];
    return { tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { left: 45, right: 20, top: 20, bottom: 60 },
      xAxis: { type: 'category', data: pts.map(x => `S${x.semana}`) },
      yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
      series: [['Programado', 'programado'], ['Real', 'real'], ['Reprogramado', 'reprogramado']]
        .map(([name, key]) => ({ name, type: 'line', smooth: true, connectNulls: false, symbolSize: 5, data: pts.map(x => x[key]) })) };
  }
  if (p.type === 'staff') return { tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { left: 45, right: 20, top: 15, bottom: 55 },
    xAxis: { type: 'category', data: (d.weeks || []).map(x => `S${x.numero}`) }, yAxis: { type: 'value' },
    series: [['Personal Tocal', 'tocal'], ['Subcontratos', 'subcontrato']].map(([name, key]) =>
      ({ name, type: 'bar', data: (d.weeks || []).map(x => x[key]) })) };
  if (p.type === 'monthly') return { tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { left: 58, right: 20, top: 15, bottom: 60 },
    xAxis: { type: 'category', data: d.months || [] }, yAxis: { type: 'value' },
    series: (d.series || []).map(x => ({ name: String(x.year), type: 'bar', data: x.uf || [] })) };
  if (p.type === 'accidents') return { tooltip: { trigger: 'axis' }, grid: { left: 40, right: 15, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: (d.months || []).map(x => x.label) }, yAxis: { type: 'value' },
    series: [{ type: 'bar', name: 'Accidentes', data: (d.months || []).map(x => x.accidentes) }] };
  return { title: { text: 'Sin datos' } };
}
async function draw() {
  await nextTick();
  if (!el.value || !window.echarts) return;
  instance ||= window.echarts.init(el.value);
  instance.setOption(config(), true); instance.resize();
}
function resize() { instance?.resize(); }
onMounted(() => { draw(); window.addEventListener('resize', resize); });
onBeforeUnmount(() => { window.removeEventListener('resize', resize); instance?.dispose(); });
watch(() => [p.data, p.type], draw, { deep: true });
</script>
<template><div :style="{height:height+'px',width:'100%'}" ref="el" role="img" :aria-label="data?.summary || 'Gráfico Tocal'"></div></template>

<script setup>
import {ref,computed,watch,onBeforeUnmount} from 'vue';import {useRoute} from 'vue-router';import {api} from '../lib/api';import {notice} from '../lib/state';import {date} from '../lib/format';import EditorForm from '../components/EditorForm.vue';import PageCard from '../components/PageCard.vue';
const route=useRoute(),data=ref(null),error=ref(''),saving=ref(false),upload=ref({etiqueta:'avance',sector:'',fecha:''}),files=ref([]),previews=ref([]),selected=ref(null),lightboxPhoto=ref(null),filter=ref('');
const base=computed(()=>`/obras/${route.params.obraId}`);
function clearPreviews(){previews.value.forEach(u=>URL.revokeObjectURL(u));previews.value=[];}
function onSelectFiles(e){clearPreviews();files.value=Array.from(e.target?.files||[]);previews.value=files.value.slice(0,12).map(f=>URL.createObjectURL(f));}
async function load(){try{data.value=await api.get(base.value+'/fotos'+(filter.value?'?etiqueta='+filter.value:''));}catch(e){error.value=e.message}}
watch(()=>[route.params.obraId,filter.value],load,{immediate:true});
async function send(){saving.value=true;error.value='';try{const form=new FormData();Object.entries(upload.value).forEach(([k,v])=>form.append(k,v||''));for(const file of files.value)form.append('fotos',file);const res=await api.post(base.value+'/fotos/subir',form);notice(`${res.created} fotografías subidas`);files.value=[];clearPreviews();await load()}catch(e){error.value=e.message}finally{saving.value=false}}
async function edit(photo){try{selected.value=await api.get(base.value+'/registros/fotos/'+photo.id)}catch(e){error.value=e.message}}
async function save(values){saving.value=true;try{await api.put(base.value+'/registros/fotos/'+selected.value.record.id,values);selected.value=null;notice('Fotografía actualizada');await load()}catch(e){error.value=e.message}finally{saving.value=false}}
async function remove(){if(!confirm('¿Eliminar esta fotografía del registro?'))return;try{await api.del(base.value+'/registros/fotos/'+selected.value.record.id);selected.value=null;notice('Fotografía eliminada');await load()}catch(e){error.value=e.message}}
onBeforeUnmount(clearPreviews);
</script>
<template><div class="page-heading page-heading--module"><div class="page-heading__titles"><h2 class="page-title display">Fotografías</h2><p class="page-description">Registro visual de obras para informes semanales</p></div></div><p v-if="error" role="alert" class="notice bad">{{error}}</p>
<details v-if="data?.editable" class="create-drawer" style="margin-bottom:16px">
  <summary class="create-drawer__trigger">Cargar fotografías de obra (JPG, PNG, HEIC — hasta 30 por carga)</summary>
  <form class="stack-sm" @submit.prevent="send">
    <div class="form-grid">
      <div class="field"><label>Imágenes</label><input type="file" accept="image/*,.heic,.heif" multiple required @change="onSelectFiles"/></div>
      <div class="field"><label>Etiqueta</label><select v-model="upload.etiqueta"><option v-for="[key,label] in data.choices" :key="key" :value="key">{{label}}</option></select></div>
      <div class="field"><label>Sector</label><input v-model="upload.sector" maxlength="80" placeholder="Ej: Sector Norte / Losa Piso 2"/></div>
      <div class="field"><label>Fecha (opcional)</label><input type="date" v-model="upload.fecha"/></div>
    </div>
    <div v-if="previews.length" style="display:flex;gap:8px;flex-wrap:wrap;padding:6px 0">
      <img v-for="(src, idx) in previews" :key="idx" :src="src" alt="Previsualización" style="width:72px;height:54px;object-fit:cover;border-radius:8px;border:1px solid #cbd5e1" />
    </div>
    <div class="form-actions"><button :disabled="saving || !files.length" class="btn btn-primary">{{saving?'Subiendo…':`Subir ${files.length} fotografía(s)`}}</button></div>
  </form>
</details>
<div class="pills record-filters"><button class="pill" :aria-current="filter===''?'page':undefined" @click="filter=''">Todas</button><button class="pill" v-for="[key,label] in data?.choices||[]" :key="key" :aria-current="filter===key?'page':undefined" @click="filter=key">{{label}}</button></div>
<PageCard v-if="selected" title="Editar fotografía" style="margin-bottom:16px"><EditorForm :schema="selected.schema" :disabled="!selected.editable" :saving="saving" allow-delete @submit="save" @delete="remove"/><button class="btn" @click="selected=null">Cerrar</button></PageCard>
<div class="photo-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:18px"><article v-for="photo in data?.photos||[]" :key="photo.id" class="card" style="overflow:hidden"><img :src="api.file(photo.storage_path)" :alt="photo.caption||'Fotografía de obra'" style="width:100%;aspect-ratio:4/3;object-fit:cover;cursor:zoom-in" loading="lazy" @click="lightboxPhoto=photo"/><div style="padding:16px"><h3 class="card__title">{{photo.sector||photo.etiqueta}}</h3><p class="muted">{{date(photo.fecha)}} · {{photo.etiqueta}}</p><p>{{photo.caption}}</p><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" type="button" @click="lightboxPhoto=photo">Ver grande</button><button v-if="data?.editable" class="btn btn-sm" type="button" @click="edit(photo)">Editar</button></div></div></article></div>
<p v-if="data&&!data.photos?.length" class="notice">Aún no hay fotografías en esta categoría.</p>
<div v-if="lightboxPhoto" class="command-backdrop" style="display:flex;align-items:center;justify-content:center;padding:24px" @click.self="lightboxPhoto=null">
  <div class="card stack-sm" style="max-width:920px;width:100%;padding:20px;background:#fff">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
      <div>
        <h3 style="margin:0">{{ lightboxPhoto.sector || lightboxPhoto.etiqueta }}</h3>
        <small class="muted">{{ date(lightboxPhoto.fecha) }} · Categoría: {{ lightboxPhoto.etiqueta }} {{ lightboxPhoto.caption ? `— ${lightboxPhoto.caption}` : '' }}</small>
      </div>
      <div style="display:flex;gap:8px">
        <a :href="api.file(lightboxPhoto.storage_path)" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Abrir original</a>
        <button type="button" class="btn btn-primary btn-sm" @click="lightboxPhoto=null">Cerrar</button>
      </div>
    </div>
    <img :src="api.file(lightboxPhoto.storage_path)" :alt="lightboxPhoto.caption||'Fotografía de obra'" style="width:100%;max-height:72vh;object-fit:contain;border-radius:10px;background:#111827" />
  </div>
</div>
</template>

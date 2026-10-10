<script setup>
import {ref,watch,computed} from 'vue';import {useRoute,useRouter,RouterLink} from 'vue-router';import {api} from '../lib/api';import {notice} from '../lib/state';import EditorForm from '../components/EditorForm.vue';import PageCard from '../components/PageCard.vue';
const route=useRoute(),router=useRouter(),detail=ref(null),error=ref(''),saving=ref(false);
const base=computed(()=>'/ventas/documentos/'+(route.params.pk||'nuevo'));
async function load(){try{detail.value=await api.get(base.value)}catch(e){error.value=e.message}}
watch(()=>route.fullPath,load,{immediate:true});
async function save(values){saving.value=true;try{await (route.params.pk?api.put(base.value,values):api.post(base.value,values));notice('Documento guardado');router.push('/ventas/documentos')}catch(e){error.value=e.message;if(e.details?.form)detail.value={...detail.value,schema:e.details.form}}finally{saving.value=false}}
async function remove(){if(!confirm('¿Eliminar documento de ventas?'))return;try{await api.del(base.value);notice('Documento eliminado');router.push('/ventas/documentos')}catch(e){error.value=e.message}}
</script>
<template><div class="page-heading"><div class="page-heading__titles"><h1 class="page-title display">{{route.params.pk?'Editar documento':'Registrar documento'}}</h1><p class="page-description">Libro de ventas Tocal</p></div><RouterLink to="/ventas/documentos" class="btn">← Volver</RouterLink></div><p v-if="error" class="notice bad">{{error}}</p><PageCard v-if="detail" title="Datos del documento"><EditorForm :schema="detail.schema" :saving="saving" :allow-delete="!!route.params.pk" @submit="save" @delete="remove"/></PageCard></template>

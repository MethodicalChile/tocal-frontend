<script setup>
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { LayoutDashboard, TrendingUp, Building2, PanelLeft, Menu, Search, Calendar, LogOut, ChevronRight, X, Shield } from 'lucide-vue-next';
import { state, notice } from '../lib/state';
import { api } from '../lib/api';
import { obraPath } from '../lib/format';
const route = useRoute(), router = useRouter();
const collapsed = ref(localStorage.getItem('tocal.sidebar') === 'collapsed');
const mobile = ref(false), search = ref(''), searchOpen = ref(false);
const title = computed(() => route.meta.title || 'Panel general');
const obra = computed(() => state.obras.find(x => x.id === route.params.obraId));
const matches = computed(() => {
  const q = search.value.toLowerCase(); const xs = [{name:'Panel general', url:'/'}, ...(state.user?.role === 'gerencia' ? [{name:'Ventas',url:'/ventas'},{name:'Libro de ventas',url:'/ventas/documentos'}] : [])];
  state.obras.forEach(o => { xs.push({name:o.nombre,url:obraPath(o.id)}); state.modules.forEach(([slug,name]) => xs.push({name:`${o.nombre} · ${name}`,url:obraPath(o.id,slug)})); });
  return xs.filter(x=>x.name.toLowerCase().includes(q)).slice(0,18);
});
function toggle() { collapsed.value = !collapsed.value; localStorage.setItem('tocal.sidebar', collapsed.value ? 'collapsed' : 'expanded'); document.documentElement.dataset.sidebar = collapsed.value ? 'collapsed' : 'expanded'; }
function keydown(e) { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchOpen.value = true; } if (e.key === 'Escape') searchOpen.value = false; }
async function signOut(){ try { await api.post('/auth/logout',{}); state.user=null; router.push('/login'); }catch(e){notice(e.message)} }
onMounted(()=>{ document.documentElement.dataset.sidebar=collapsed.value?'collapsed':'expanded'; window.addEventListener('keydown',keydown); });
onBeforeUnmount(()=>window.removeEventListener('keydown',keydown));
</script>
<template>
<div class="shell" :class="{'is-mobile-open':mobile}"><aside class="sidebar" id="sidebar" aria-label="Menú lateral">
  <div class="sidebar__head"><RouterLink class="brand" to="/"><span class="brand__mark"><img src="/logo-marca.png" alt="" width="20" height="20"/></span><span class="brand__text"><strong>Tocal</strong><small>Control de obras</small></span></RouterLink><button class="btn btn-ghost btn-icon btn-sm sidebar__close" @click="mobile=false"><X :size="18"/></button></div>
  <div class="side-navs"><nav class="side-nav" aria-label="Navegación principal"><div class="side-nav__label">General</div>
    <RouterLink to="/" class="side-link" :class="{'is-active':route.path==='/'}"><LayoutDashboard :size="18"/><span class="side-link__text">Panel general</span></RouterLink>
    <RouterLink v-if="state.user?.role==='gerencia'" to="/ventas" class="side-link" :class="{'is-active':route.path.startsWith('/ventas')}"><TrendingUp :size="18"/><span class="side-link__text">Ventas</span></RouterLink>
  </nav><nav class="side-nav" aria-label="Obras"><div class="side-nav__label">Obras</div>
    <RouterLink v-for="o in state.obras" :key="o.id" :to="obraPath(o.id)" class="side-link" :class="{'is-active':route.params.obraId===o.id,'is-inactive':!o.activa}"><Building2 :size="18"/><span class="side-link__text">{{o.nombre}}</span></RouterLink>
    <p v-if="!state.obras.length" class="side-nav__empty">Sin obras asignadas.</p></nav><nav class="side-nav"><div class="side-nav__label">Cuenta</div><RouterLink to="/privacidad" class="side-link" :class="{'is-active':route.path==='/privacidad'}"><Shield :size="18"/><span class="side-link__text">Privacidad</span></RouterLink></nav></div>
  <div class="side-user"><span class="avatar">{{state.user?.name?.slice(0,2)?.toUpperCase()}}</span><div class="side-user__meta"><strong>{{state.user?.name}}</strong><small>{{state.user?.role?.replaceAll('_',' ')}}</small></div><button class="btn btn-ghost btn-icon btn-sm" aria-label="Cerrar sesión" @click="signOut"><LogOut :size="18"/></button></div>
</aside>
<div class="scrim" v-if="mobile" @click="mobile=false"></div>
<div class="workspace"><header class="topbar"><button class="btn btn-ghost btn-icon btn-sm topbar__collapse" @click="toggle"><PanelLeft :size="18"/></button><button class="btn btn-ghost btn-icon btn-sm topbar__menu" @click="mobile=true"><Menu :size="18"/></button><span class="topbar__divider"></span>
  <nav class="crumbs" aria-label="Ruta"><span class="crumbs__root">Tocal</span><ChevronRight :size="14"/><span v-if="obra" class="crumbs__step">Obras <ChevronRight :size="14" style="display:inline"/></span><span class="crumbs__current">{{title}}</span></nav>
  <div class="topbar__end"><button class="search-trigger" @click="searchOpen=true"><Search :size="16"/><span class="search-trigger__text">Buscar obra o módulo</span><kbd class="kbd">Ctrl K</kbd></button><span class="topbar__date"><Calendar :size="15"/> {{new Date().toLocaleDateString('es-CL')}}</span><button class="btn btn-ghost btn-icon btn-sm topbar__logout" @click="signOut" title="Cerrar sesión"><LogOut :size="18"/></button></div>
</header><main id="main" class="page" tabindex="-1"><template v-if="obra"><header class="obra-header"><nav class="obra-header__crumbs"><RouterLink to="/">Obras</RouterLink> / {{obra.nombre}}</nav><h1 class="obra-header__title display">{{obra.nombre}}</h1><p class="obra-header__meta">{{obra.servicio}} · {{obra.mandante}}</p></header><nav class="pills module-nav" aria-label="Módulos de obra"><RouterLink v-for="[slug,label] in state.modules" :key="slug" class="pill" :to="obraPath(obra.id,slug)" :aria-current="(route.params.module||'resumen')===slug?'page':undefined">{{label}}</RouterLink></nav></template>
<slot/></main><footer class="page-footer"><span>Constructora Tocal · Control de obras</span><span class="page-footer__hint">Ctrl K para buscar</span></footer></div></div>
<div v-if="state.alert" class="toast-stack"><div class="toast" role="status">{{state.alert}}<button class="btn btn-ghost btn-sm" @click="state.alert=''">Cerrar</button></div></div>
<div v-if="searchOpen" class="command-backdrop" @click.self="searchOpen=false"><div class="card" style="max-width:610px;margin:12vh auto;padding:20px" role="dialog" aria-modal="true"><input autofocus v-model="search" placeholder="Buscar obra o módulo" style="width:100%;padding:12px"/><div class="stack-sm" style="max-height:400px;overflow:auto"><RouterLink v-for="x in matches" :key="x.url" :to="x.url" class="side-link" @click="searchOpen=false;search=''"><Search :size="16"/>{{x.name}}</RouterLink></div><button class="btn btn-ghost" @click="searchOpen=false">Cerrar</button></div></div>
</template>

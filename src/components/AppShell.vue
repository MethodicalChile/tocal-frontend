
<script setup>
import {
  computed,
  ref,
  watch,
  onMounted,
  onBeforeUnmount,
} from 'vue';

import {
  useRoute,
  useRouter,
  RouterLink,
} from 'vue-router';

import {
  LayoutDashboard,
  TrendingUp,
  Building2,
  PanelLeft,
  Menu,
  Search,
  Calendar,
  LogOut,
  ChevronRight,
  X,
  Shield,
  ShieldCheck,
  Users,
  Settings,
  Bell,
} from 'lucide-vue-next';

import {
  state,
  notice,
  selectCompany,
  clearCompanyContext,
  can,
  canAccessSales,
} from '../lib/state';

import { api } from '../lib/api';
import { documentsApi } from '../modules/administration/services/documentsApi';


import { obraPath } from '../lib/format';

const route = useRoute();
const router = useRouter();

/* =========================================================
   ESTADO DEL COMPONENTE
========================================================= */

const collapsed = ref(
  localStorage.getItem('tocal.sidebar') === 'collapsed'
);

const mobile = ref(false);
const search = ref('');
const searchOpen = ref(false);
const unreadAlertsCount = ref(0);

async function refreshAlertsBadge() {
  const empId = state.activeCompanyId;
  if (!empId || !state.user || !(can('alertas.ver') || can('documentos.ver'))) {
    unreadAlertsCount.value = 0;
    return;
  }
  try {
    const res = await documentsApi.alerts(empId, { leida: false });
    unreadAlertsCount.value = Number(res?.resumen?.no_leidas ?? (res?.results || []).length ?? 0);
  } catch {
    unreadAlertsCount.value = 0;
  }
}

watch(() => [state.activeCompanyId, state.user, route.path], () => {
  refreshAlertsBadge();
}, { immediate: true });

const title = computed(
  () => route.meta.title || 'Panel general'
);

/* =========================================================
   EMPRESA ACTIVA
========================================================= */

const activeCompany = computed(() =>
  state.companies.find(
    company => company.id === state.activeCompanyId
  ) || null
);

const activeCompanyName = computed(
  () => activeCompany.value?.nombre || 'Sin empresa'
);

/* =========================================================
   PERMISOS RBAC
========================================================= */

const canViewAccess = computed(() => can('roles.ver'));
const canViewWorks = computed(() => can('obras.ver'));
const canViewWorkers = computed(() => can('empleados.ver'));
const canViewSettings = computed(() => can('documentos.ver'));
const canViewSales = computed(() => canAccessSales());

/* =========================================================
   CAMBIAR EMPRESA
========================================================= */

function changeCompany(event) {
  const empresaId = event.target.value;

  if (!empresaId) {
    return;
  }

  if (empresaId === state.activeCompanyId) {
    return;
  }

  const companyExists = state.companies.some(
    company => company.id === empresaId
  );

  if (!companyExists) {
    notice('La empresa seleccionada no está disponible.');
    return;
  }

  selectCompany(empresaId);

  // Evita conservar rutas de obras pertenecientes
  // a la empresa seleccionada anteriormente.
  router.push('/');

  mobile.value = false;
  searchOpen.value = false;
  search.value = '';
}

/* =========================================================
   OBRA ACTUAL
========================================================= */

const obra = computed(() =>
  state.obras.find(
    item => String(item.id) === String(route.params.obraId)
  )
);

/* =========================================================
   BUSCADOR GLOBAL
========================================================= */

const matches = computed(() => {
  const query = search.value.trim().toLowerCase();

  const items = [
    {
      name: 'Panel general',
      url: '/',
    },
  ];

  if (canViewSales.value) {
    items.push(
      {
        name: 'Ventas',
        url: '/ventas',
      },
      {
        name: 'Libro de ventas',
        url: '/ventas/documentos',
      }
    );
  }

  if (canViewAccess.value) {
    items.push({
      name: 'Roles y permisos',
      url: '/administracion/accesos',
    });
  }

  if (canViewWorks.value) {
    items.push({
      name: 'Administrar obras',
      url: '/administracion/obras',
    });
  }

  if (canViewSettings.value) {
    items.push({ name: 'Empresa y equipos', url: '/administracion/empresa-equipos' });
    items.push({ name: 'Ajustes y mantenedores', url: '/administracion/ajustes' });
  }

  if (canViewWorkers.value) {
    items.push({
      name: 'Trabajadores y cargos',
      url: '/administracion/trabajadores',
    });
  }

  state.obras.forEach(item => {
    items.push({
      name: item.nombre,
      url: obraPath(item.id),
    });

    state.modules.forEach(([slug, name]) => {
      items.push({
        name: `${item.nombre} · ${name}`,
        url: obraPath(item.id, slug),
      });
    });
  });

  return items
    .filter(item =>
      item.name.toLowerCase().includes(query)
    )
    .slice(0, 18);
});

/* =========================================================
   SIDEBAR
========================================================= */

function toggle() {
  collapsed.value = !collapsed.value;

  const mode = collapsed.value
    ? 'collapsed'
    : 'expanded';

  localStorage.setItem('tocal.sidebar', mode);

  document.documentElement.dataset.sidebar = mode;
}

/* =========================================================
   ATAJOS DE TECLADO
========================================================= */

function keydown(event) {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'k'
  ) {
    event.preventDefault();
    searchOpen.value = true;
  }

  if (event.key === 'Escape') {
    searchOpen.value = false;
  }
}

/* =========================================================
   CERRAR SESIÓN
========================================================= */

async function signOut() {
  try {
    await api.post('/auth/logout', {});

    state.user = null;

    clearCompanyContext();

    mobile.value = false;
    searchOpen.value = false;

    await router.push('/login');

  } catch (error) {
    notice(
      error.message || 'No fue posible cerrar sesión.'
    );
  }
}

/* =========================================================
   CICLO DE VIDA
========================================================= */

onMounted(() => {
  document.documentElement.dataset.sidebar =
    collapsed.value ? 'collapsed' : 'expanded';

  window.addEventListener('keydown', keydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', keydown);
});
</script>

<template>
  <div
    class="shell"
    :class="{ 'is-mobile-open': mobile }"
  >
    <!-- SIDEBAR -->
    <aside
      id="sidebar"
      class="sidebar"
      aria-label="Menú lateral"
    >
      <div class="sidebar__head">
        <RouterLink class="brand" to="/">
          <span class="brand__mark">
            <img
              src="/logo-marca.png"
              alt=""
              width="20"
              height="20"
            />
          </span>

          <span class="brand__text">
            <strong>Tocal</strong>
            <small>Control de obras</small>
          </span>
        </RouterLink>

        <button
          class="btn btn-ghost btn-icon btn-sm sidebar__close"
          aria-label="Cerrar menú"
          @click="mobile = false"
        >
          <X :size="18" />
        </button>
      </div>

      <div class="side-navs">

        <!-- GENERAL -->
        <nav
          class="side-nav"
          aria-label="Navegación principal"
        >
          <div class="side-nav__label">
            General
          </div>

          <RouterLink
            to="/"
            class="side-link"
            :class="{ 'is-active': route.path === '/' }"
          >
            <LayoutDashboard :size="18" />
            <span class="side-link__text">
              Panel general
            </span>
          </RouterLink>

          <RouterLink
            v-if="canViewSales"
            to="/ventas"
            class="side-link"
            :class="{
              'is-active': route.path.startsWith('/ventas')
            }"
          >
            <TrendingUp :size="18" />
            <span class="side-link__text">
              Ventas
            </span>
          </RouterLink>
        </nav>

        <!-- OBRAS -->
        <nav
          class="side-nav"
          aria-label="Obras"
        >
          <div class="side-nav__label">
            Obras
          </div>

          <RouterLink
            v-for="item in state.obras"
            :key="item.id"
            :to="obraPath(item.id)"
            class="side-link"
            :class="{
              'is-active': route.params.obraId === item.id,
              'is-inactive': !item.activa
            }"
          >
            <Building2 :size="18" />
            <span class="side-link__text">
              {{ item.nombre }}
            </span>
          </RouterLink>

          <p
            v-if="!state.obras.length"
            class="side-nav__empty"
          >
            Sin obras asignadas.
          </p>
        </nav>

        <!-- ADMINISTRACIÓN -->
        <nav
          v-if="
            canViewAccess ||
            canViewWorks ||
            canViewWorkers ||
            canViewSettings
          "
          class="side-nav"
          aria-label="Administración"
        >
          <div class="side-nav__label">
            Administración
          </div>

          <RouterLink
            v-if="canViewAccess"
            to="/administracion/accesos"
            class="side-link"
            :class="{
              'is-active':
                route.path === '/administracion/accesos'
            }"
          >
            <ShieldCheck :size="18" />
            <span class="side-link__text">
              Roles y permisos
            </span>
          </RouterLink>

          <RouterLink
            v-if="canViewWorks"
            to="/administracion/obras"
            class="side-link"
            :class="{
              'is-active':
                route.path === '/administracion/obras'
            }"
          >
            <Building2 :size="18" />
            <span class="side-link__text">
              Administrar obras
            </span>
          </RouterLink>

          <RouterLink
            v-if="canViewWorkers"
            to="/administracion/trabajadores"
            class="side-link"
            :class="{
              'is-active':
                route.path === '/administracion/trabajadores'
            }"
          >
            <Users :size="18" />
            <span class="side-link__text">
              Trabajadores y cargos
            </span>
          </RouterLink>
          <RouterLink
            v-if="canViewSettings"
            to="/administracion/empresa-equipos"
            class="side-link"
            :class="{ 'is-active': route.path === '/administracion/empresa-equipos' }"
          >
            <Building2 :size="18" />
            <span class="side-link__text">Empresa y equipos</span>
          </RouterLink>
          <RouterLink
            v-if="canViewSettings"
            to="/administracion/ajustes"
            class="side-link"
            :class="{ 'is-active': route.path === '/administracion/ajustes' }"
          >
            <Settings :size="18" />
            <span class="side-link__text">Ajustes y mantenedores</span>
          </RouterLink>
        </nav>

        <!-- CUENTA -->
        <nav
          class="side-nav"
          aria-label="Cuenta"
        >
          <div class="side-nav__label">
            Cuenta
          </div>

          <RouterLink
            to="/privacidad"
            class="side-link"
            :class="{
              'is-active': route.path === '/privacidad'
            }"
          >
            <Shield :size="18" />
            <span class="side-link__text">
              Privacidad
            </span>
          </RouterLink>
        </nav>
      </div>

      <!-- USUARIO -->
      <div class="side-user">
        <span class="avatar">
          {{ state.user?.name?.slice(0, 2)?.toUpperCase() }}
        </span>

        <div class="side-user__meta">
          <strong>{{ state.user?.name }}</strong>

          <small>
            {{ state.user?.role?.replaceAll('_', ' ') }}
          </small>
        </div>

        <button
          class="btn btn-ghost btn-icon btn-sm"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          @click="signOut"
        >
          <LogOut :size="18" />
        </button>
      </div>
    </aside>

    <!-- OVERLAY MÓVIL -->
    <div
      v-if="mobile"
      class="scrim"
      @click="mobile = false"
    />

    <!-- CONTENIDO -->
    <div class="workspace">

      <!-- BARRA SUPERIOR -->
      <header class="topbar">
        <button
          class="btn btn-ghost btn-icon btn-sm topbar__collapse"
          aria-label="Contraer menú"
          @click="toggle"
        >
          <PanelLeft :size="18" />
        </button>

        <button
          class="btn btn-ghost btn-icon btn-sm topbar__menu"
          aria-label="Abrir menú"
          @click="mobile = true"
        >
          <Menu :size="18" />
        </button>

        <span class="topbar__divider"></span>

        <!-- BREADCRUMBS -->
        <nav class="crumbs" aria-label="Ruta">
          <span class="crumbs__root">
            Tocal
          </span>

          <ChevronRight :size="14" />

          <span
            v-if="obra"
            class="crumbs__step"
          >
            Obras
            <ChevronRight
              :size="14"
              style="display:inline"
            />
          </span>

          <span class="crumbs__current">
            {{ title }}
          </span>
        </nav>

        <div class="topbar__end">

          <!-- SELECTOR MULTIEMPRESA -->
          <label
            class="company-picker"
            style="
              display:flex;
              align-items:center;
              gap:6px;
              font-size:12px;
            "
          >
            Empresa

            <select
              :value="state.activeCompanyId || ''"
              :disabled="
                state.companyLoading ||
                !state.companies.length
              "
              aria-label="Empresa activa"
              style="
                max-width:180px;
                padding:5px;
                border-radius:8px;
              "
              @change="changeCompany"
            >
              <option
                v-if="!state.companies.length"
                value=""
              >
                Sin empresas asignadas
              </option>

              <option
                v-for="company in state.companies"
                :key="company.id"
                :value="company.id"
              >
                {{ company.nombre }}
              </option>
            </select>
          </label>

          <!-- BUSCADOR -->
          <button
            class="search-trigger"
            @click="searchOpen = true"
          >
            <Search :size="16" />

            <span class="search-trigger__text">
              Buscar obra o módulo
            </span>

            <kbd class="kbd">
              Ctrl K
            </kbd>
          </button>

          <!-- ALERTAS DE VENCIMIENTO -->
          <RouterLink
            v-if="canViewSettings"
            to="/administracion/ajustes?tab=alertas"
            class="btn btn-ghost btn-sm"
            style="position:relative;display:inline-flex;align-items:center;gap:6px"
            title="Alertas de vencimiento documental"
            aria-label="Alertas de vencimiento documental"
          >
            <Bell :size="16" />
            <span
              v-if="unreadAlertsCount > 0"
              style="background:#dc2626;color:#fff;font-size:11px;font-weight:700;padding:1px 6px;border-radius:999px"
            >
              {{ unreadAlertsCount }}
            </span>
          </RouterLink>

          <!-- FECHA -->
          <span class="topbar__date">
            <Calendar :size="15" />
            {{ new Date().toLocaleDateString('es-CL') }}
          </span>

          <!-- CERRAR SESIÓN -->
          <button
            class="btn btn-ghost btn-icon btn-sm topbar__logout"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
            @click="signOut"
          >
            <LogOut :size="18" />
          </button>
        </div>
      </header>

      <!-- PÁGINA -->
      <main
        id="main"
        class="page"
        tabindex="-1"
      >
        <!-- CABECERA DE OBRA -->
        <template v-if="obra">
          <header class="obra-header">
            <nav class="obra-header__crumbs">
              <RouterLink to="/">
                Obras
              </RouterLink>
              /
              {{ obra.nombre }}
            </nav>

            <h1 class="obra-header__title display">
              {{ obra.nombre }}
            </h1>

            <p class="obra-header__meta">
              {{ obra.servicio }} · {{ obra.mandante }}
            </p>
          </header>

          <!-- MÓDULOS DE OBRA -->
          <nav
            class="pills module-nav"
            aria-label="Módulos de obra"
          >
            <RouterLink
              v-for="[slug, label] in state.modules"
              :key="slug"
              class="pill"
              :to="obraPath(obra.id, slug)"
              :aria-current="
                (route.params.module || 'resumen') === slug
                  ? 'page'
                  : undefined
              "
            >
              {{ label }}
            </RouterLink>
          </nav>
        </template>

        <slot />
      </main>

      <!-- FOOTER -->
      <footer class="page-footer">
        <span>
          {{ activeCompanyName }} · Control de obras
        </span>

        <span class="page-footer__hint">
          Ctrl K para buscar
        </span>
      </footer>
    </div>
  </div>

  <!-- ALERTAS -->
  <div
    v-if="state.alert"
    class="toast-stack"
  >
    <div
      class="toast"
      role="status"
    >
      {{ state.alert }}

      <button
        class="btn btn-ghost btn-sm"
        @click="state.alert = ''"
      >
        Cerrar
      </button>
    </div>
  </div>

  <!-- BUSCADOR GLOBAL -->
  <div
    v-if="searchOpen"
    class="command-backdrop"
    @click.self="searchOpen = false"
  >
    <div
      class="card"
      style="
        max-width:610px;
        margin:12vh auto;
        padding:20px;
      "
      role="dialog"
      aria-modal="true"
      aria-label="Buscar obra o módulo"
    >
      <input
        v-model="search"
        autofocus
        placeholder="Buscar obra o módulo"
        style="width:100%;padding:12px"
      />

      <div
        class="stack-sm"
        style="max-height:400px;overflow:auto"
      >
        <RouterLink
          v-for="item in matches"
          :key="item.url"
          :to="item.url"
          class="side-link"
          @click="
            searchOpen = false;
            search = ''
          "
        >
          <Search :size="16" />
          {{ item.name }}
        </RouterLink>
      </div>

      <button
        class="btn btn-ghost"
        @click="searchOpen = false"
      >
        Cerrar
      </button>
    </div>
  </div>
</template>

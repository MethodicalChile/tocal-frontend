<script setup>
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ShieldCheck, Building2, FileCheck2, HardHat } from 'lucide-vue-next';
import { api, token } from '../lib/api';
import { refreshSession } from '../lib/state';

const route = useRoute();
const router = useRouter();
const email = ref('');
const password = ref('');
const busy = ref(false);
const error = ref('');
const closedByInactivity = computed(() => route.query.reason === 'inactivity');

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    await token();
    await api.post('/auth/login', { email: email.value, password: password.value });
    await refreshSession();
    router.replace('/');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="login-page" style="min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 15% 20%, #f5efe4 0%, #ecebe6 55%, #e2dfd7 100%);padding:24px">
    <div style="width:min(960px,100%);display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 24px 60px -15px rgba(26,26,26,0.14);border:1px solid rgba(212,207,195,0.85)">
      <!-- Panel Institucional Izquierdo -->
      <aside style="background:linear-gradient(155deg,#1f1f1d 0%,#2c2b28 60%,#3b2618 100%);color:#fff;padding:42px 36px;display:flex;flex-direction:column;justify-content:space-between;gap:28px">
        <div>
          <div style="display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,0.08);padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;color:#fbd3b7;margin-bottom:22px">
            <ShieldCheck :size="15" /> Plataforma Corporativa TOCAL
          </div>
          <h2 style="font-size:1.75rem;font-weight:750;letter-spacing:-0.025em;line-height:1.2;margin:0 0 12px;color:#fff">
            Control de Obras, Gestión Documental y Prevención DS 44
          </h2>
          <p style="color:#c7c4bc;font-size:0.92rem;line-height:1.55;margin:0">
            Centralización de avance físico, carpetas laborales («Hombre Nuevo»), procedimientos de trabajo seguro (PTS), equipos y fiscalización FUF en tiempo real.
          </p>
        </div>

        <div style="display:grid;gap:12px;font-size:0.84rem;color:#e5e2dc">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:rgba(242,107,33,0.2);color:#f58a4b"><Building2 :size="16" /></span>
            <span>Trazabilidad multiempresa por obra, trabajador y maquinaria</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:rgba(242,107,33,0.2);color:#f58a4b"><HardHat :size="16" /></span>
            <span>Inducción Hombre Nuevo, entrega de EPP, capacitaciones y checklists</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span style="display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:rgba(242,107,33,0.2);color:#f58a4b"><FileCheck2 :size="16" /></span>
            <span>Dossier de fiscalización FUF / DS 44 y alertas de vencimiento</span>
          </div>
        </div>

        <div style="font-size:0.76rem;color:#9a978f;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px">
          Constructora Tocal Limitada · Sistema de Gestión Integrado
        </div>
      </aside>

      <!-- Formulario de Acceso -->
      <main style="padding:42px 38px;display:flex;flex-direction:column;justify-content:center">
        <div class="brand" style="margin-bottom:24px">
          <img src="/logo-tocal.png" alt="Tocal" width="145" />
        </div>
        <h1 class="page-title display" style="font-size:1.6rem;margin-bottom:4px">Bienvenido</h1>
        <p class="muted" style="margin-bottom:20px">Ingresa con tu cuenta corporativa autorizada</p>

        <p
          v-if="closedByInactivity && !error"
          class="notice"
          role="status"
          style="margin-bottom:16px;background:#fef3c7;border-color:#f59e0b;color:#92400e;font-weight:600"
        >
          Por tu seguridad, tu sesión se cerró automáticamente por inactividad. Ingresa nuevamente para continuar.
        </p>

        <p v-if="error" class="notice bad" role="alert" style="margin-bottom:16px">{{ error }}</p>

        <form class="stack-md" @submit.prevent="submit">
          <div class="field">
            <label for="email">Correo electrónico</label>
            <input id="email" v-model="email" type="email" autocomplete="username" placeholder="nombre@tocal.cl" required autofocus />
          </div>
          <div class="field">
            <label for="password">Contraseña</label>
            <input id="password" v-model="password" type="password" autocomplete="current-password" placeholder="••••••••••••" required />
          </div>
          <button class="btn btn-primary btn-lg" style="width:100%;margin-top:8px;min-height:44px" :disabled="busy">
            {{ busy ? 'Verificando credenciales…' : 'Ingresar a la plataforma' }}
          </button>
        </form>

        <details style="margin-top:20px;border-top:1px solid #e2ded5;padding-top:12px;font-size:12px;color:#4f4d48">
          <summary style="cursor:pointer;font-weight:600;color:#2b2b29">
            Cláusula de Privacidad y Tratamiento de Datos Personales (Ley N° 21.719 / DS 44)
          </summary>
          <div style="margin-top:8px;line-height:1.5;display:grid;gap:6px;background:#faf9f6;padding:12px;border-radius:10px;border:1px solid #e2ded5">
            <p style="margin:0">
              <strong>Finalidad y Base Legal:</strong> Constructora Tocal Limitada trata los datos personales, laborales y de prevención de riesgos de sus trabajadores y colaboradores exclusivamente para el cumplimiento del Código del Trabajo (Art. 184), Ley N° 16.744, Decreto Supremo N° 44 y fiscalizaciones de la Dirección del Trabajo, SEREMI de Salud y Mutualidades.
            </p>
            <p style="margin:0">
              <strong>Resguardo y Derechos ARCO+:</strong> Los datos sensibles (RUT, exámenes ocupacionales, inducciones y firmas de recepción) están protegidos mediante control de acceso RBAC (`empleados.ver_sensibles`), enlaces efímeros de descarga y bitácora de auditoría. Una vez dentro de la plataforma, puedes ejercer tus derechos de <em>Acceso, Rectificación, Supresión, Oposición, Portabilidad y Bloqueo</em> en la sección <strong>Privacidad</strong>.
            </p>
          </div>
        </details>
      </main>
    </div>
  </div>
</template>

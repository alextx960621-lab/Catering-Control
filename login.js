/* La configuración de la empresa vive en config.js (un solo archivo
   para toda la app: marca + credenciales de Supabase).
   Este archivo se carga con <script src="./login.js" defer>, así que el
   navegador garantiza que corre DESPUÉS de que config.js, el SDK de
   Supabase y supabase-client.js (también defer) ya se hayan cargado y
   ejecutado — sin necesidad de envolver nada en DOMContentLoaded. */
const APP_CONFIG = window.APP_CONFIG;
document.getElementById('brand-title').textContent = APP_CONFIG.companyName;
document.title = `${APP_CONFIG.companyName} · Iniciar sesión`;
// Antes acá se pintaba de una el logo de config.js (el "por defecto" del
// proyecto) y, más abajo, una vez llegaba la respuesta de Supabase, se
// reemplazaba por el logo real guardado en Configuración — si eran
// distintos, se veía un parpadeo del logo viejo antes del correcto. Ahora
// no se pinta ningún logo hasta tener el definitivo: mientras se espera la
// respuesta se deja el ícono neutro, y recién ahí se decide cuál mostrar.
document.getElementById('brand-mark').textContent = '🍽';
const waBtn = document.getElementById('whatsapp-support-btn');
function updateWhatsappButton(number) {
  const num = String(number || '').replace(/\D/g, '');
  if (num) {
    waBtn.href = `https://wa.me/${num}?text=${encodeURIComponent('Hola, necesito ayuda para ingresar a Catering Control.')}`;
    waBtn.classList.remove('d-none');
  } else {
    waBtn.classList.add('d-none');
  }
}
updateWhatsappButton(APP_CONFIG.whatsappNumber);
(async () => {
  let settings = null;
  try {
    // Antes esto pedía dbGet('personal') completo, que además del nombre y
    // el logo de la empresa trae staffUsers (con el hash de la contraseña
    // de cada usuario del equipo), drivers y routes — y como esta página se
    // ve ANTES de iniciar sesión, cualquiera que la abriera descargaba todo
    // eso. get_branding() (ver supabase-public-branding-migration.sql)
    // devuelve solo el bloque "settings" (público), nunca staffUsers.
    settings = await window.SupabaseDB?.rpc('get_branding', {});
  } catch (_) {}
  const name = settings?.companyName?.trim();
  // Se usa el logo guardado en Configuración; si Supabase no devolvió nada
  // (sin conexión, empresa recién creada, etc.) recién ahí se cae al logo
  // por defecto de config.js — nunca se muestran los dos, uno tras otro.
  const logo = settings?.logoUrl || APP_CONFIG.logoUrl;
  if (name) { document.getElementById('brand-title').textContent = name; document.title = `${name} · Iniciar sesión`; }
  document.getElementById('brand-mark').innerHTML = logo
    ? `<img src="${logo}" alt="${name || APP_CONFIG.companyName}" onerror="this.parentElement.textContent='🍽'">`
    : '🍽';
  if (settings?.whatsappNumber) updateWhatsappButton(settings.whatsappNumber);
})();
/* ========================================================================== */

const STAFF_SESSION_KEY = `${APP_CONFIG.storagePrefix}-staff-session-v1`;
const STAFF_APP_URL = './index.html';
// Los usuarios con rol "driver" ya no entran a index.html: tienen su propia
// página, más liviana y con solo lo que un driver usa (Día de trabajo,
// Clientes, Sueldos, Configuración). driver.html carga el mismo index.js sin
// tocarlo, así que un driver ve exactamente las mismas funciones que tenía
// antes dentro de index.html.
const DRIVER_APP_URL = './driver.html';
function staffDestination(role) { return role === 'driver' ? DRIVER_APP_URL : STAFF_APP_URL; }
const CLIENT_PORTAL_URL = './cliente.html';
const CLIENT_SESSION_KEY = `${APP_CONFIG.storagePrefix}-client-session-v1`;
// Tema de la pantalla de login (por navegador, todavía no hay nadie
// logueado). Al entrar, index.html y cliente.html usan este valor solo como
// punto de partida la primera vez que cada usuario/cliente inicia sesión;
// de ahí en adelante cada uno tiene su propio tema, independiente del resto.
const UI_THEME_KEY = `${APP_CONFIG.storagePrefix}-ui-theme-v1`;
const themeSelect = document.getElementById('theme-select');
const savedTheme = localStorage.getItem(UI_THEME_KEY) || 'light';
document.documentElement.dataset.theme = savedTheme;
themeSelect.value = savedTheme;
themeSelect.addEventListener('change', e => {
  document.documentElement.dataset.theme = e.target.value;
  localStorage.setItem(UI_THEME_KEY, e.target.value);
});
const tabClient=document.getElementById('tab-client'), tabStaff=document.getElementById('tab-staff'), formClient=document.getElementById('form-client'), formStaff=document.getElementById('form-staff'), errorEl=document.getElementById('error-msg');
const toggleStaffPass=document.getElementById('toggle-staff-pass'), staffPassInput=document.getElementById('staff-pass');
toggleStaffPass.addEventListener('click',()=>{
  const showing=staffPassInput.type==='text';
  staffPassInput.type=showing?'password':'text';
  toggleStaffPass.textContent=showing?'👁':'🙈';
  toggleStaffPass.setAttribute('aria-label',showing?'Mostrar contraseña':'Ocultar contraseña');
});
function showError(msg){errorEl.textContent=msg;errorEl.classList.remove('d-none');}
function clearError(){errorEl.classList.add('d-none');}
function switchAccess(type){const client=type==='client';tabClient.classList.toggle('active',client);tabStaff.classList.toggle('active',!client);formClient.classList.toggle('active',client);formStaff.classList.toggle('active',!client);clearError();}
tabClient.addEventListener('click',()=>switchAccess('client')); tabStaff.addEventListener('click',()=>switchAccess('staff'));
/* El carnet/teléfono y el correo/contraseña ya NO se verifican descargando toda
   la tabla de clientes o de staff al navegador: se validan en el servidor con
   las funciones login_cliente/login_staff (ver supabase-security-update.sql).
   El navegador solo recibe el id/nombre/rol de la persona que coincidió. */
formClient.addEventListener('submit',async e=>{
  e.preventDefault();clearError();
  const carnet=document.getElementById('client-carnet').value.trim(),phone=document.getElementById('client-phone').value.replace(/\D/g,'');
  const rows=await window.SupabaseDB?.rpc('login_cliente',{p_carnet:carnet,p_phone:phone});
  const client=Array.isArray(rows)?rows[0]:null;
  if(!client){showError('Carnet o teléfono no coinciden con un cliente registrado.');return;}
  sessionStorage.setItem(CLIENT_SESSION_KEY,JSON.stringify({id:client.id,name:client.name}));
  window.location.href=CLIENT_PORTAL_URL;
});
formStaff.addEventListener('submit',async e=>{
  e.preventDefault();clearError();
  const email=document.getElementById('staff-email').value.trim(),password=document.getElementById('staff-pass').value;
  const rows=await window.SupabaseDB?.rpc('login_staff',{p_email:email,p_password:password});
  const person=Array.isArray(rows)?rows[0]:null;
  if(!person){showError('Correo o contraseña incorrectos.');return;}
  sessionStorage.setItem(STAFF_SESSION_KEY,JSON.stringify({id:person.id,name:person.name,role:person.role,routeId:person.routeId||'',driverId:person.driverId||''}));
  window.location.href=staffDestination(person.role);
});
(() => {
  try {
    const existing = JSON.parse(sessionStorage.getItem(STAFF_SESSION_KEY));
    if (existing) window.location.href = staffDestination(existing.role);
  } catch (_) {}
})();
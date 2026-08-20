/* La configuración de la empresa vive en config.js (un solo archivo
   para toda la app: marca + credenciales de Supabase).
   Este archivo se carga con <script src="./login.js" defer>, así que el
   navegador garantiza que corre DESPUÉS de que config.js, el SDK de
   Supabase y supabase-client.js (también defer) ya se hayan cargado y
   ejecutado — sin necesidad de envolver nada en DOMContentLoaded. */
const APP_CONFIG = window.APP_CONFIG;
document.getElementById('brand-title').textContent = APP_CONFIG.companyName;
document.title = `${APP_CONFIG.companyName} · Iniciar sesión`;
document.getElementById('brand-mark').innerHTML = APP_CONFIG.logoUrl
  ? `<img src="${APP_CONFIG.logoUrl}" alt="${APP_CONFIG.companyName}" onerror="this.parentElement.textContent='🍽'">`
  : '🍽';
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
  try {
    const personal = await window.SupabaseDB?.dbGet('personal');
    const name = personal?.settings?.companyName?.trim();
    const logo = personal?.settings?.logoUrl;
    if (name) { document.getElementById('brand-title').textContent = name; document.title = `${name} · Iniciar sesión`; }
    // Antes solo se actualizaba el logo cuando 'logo' tenía un valor: si en
    // Configuración se quitó el logo (settings.logoUrl quedó en ''), esta
    // condición era falsa y no hacía nada — dejando en pantalla el logo
    // anterior (el de APP_CONFIG.logoUrl con el que arrancó la página, o el
    // último que se había dibujado). Ahora, igual que en index.html, se
    // vuelve al ícono 🍽 por defecto cuando no hay logo configurado.
    document.getElementById('brand-mark').innerHTML = logo
      ? `<img src="${logo}" alt="${name || APP_CONFIG.companyName}" onerror="this.parentElement.textContent='🍽'">`
      : '🍽';
    if (personal?.settings?.whatsappNumber) updateWhatsappButton(personal.settings.whatsappNumber);
  } catch (_) {}
})();
/* ========================================================================== */

const STAFF_SESSION_KEY = `${APP_CONFIG.storagePrefix}-staff-session-v1`;
const STAFF_APP_URL = './index.html';
const CLIENT_PORTAL_URL = './cliente.html';
const CLIENT_SESSION_KEY = `${APP_CONFIG.storagePrefix}-client-session-v1`;
// Preferencia de tema personal (por navegador), compartida con el panel de
// staff (index.html) para que la elección de acá se mantenga al entrar.
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
  window.location.href=STAFF_APP_URL;
});
if(sessionStorage.getItem(STAFF_SESSION_KEY)) window.location.href=STAFF_APP_URL;
const APP_CONFIG = window.APP_CONFIG;
document.getElementById('brand-title').textContent = APP_CONFIG.companyName;
document.title = `${APP_CONFIG.companyName} · Iniciar sesión`;
const BRANDING_CACHE_KEY = `${APP_CONFIG.storagePrefix}-branding-cache-v1`;
function applyBranding(name, logo) {
  const finalName = name || APP_CONFIG.companyName;
  document.getElementById('brand-title').textContent = finalName;
  document.title = `${finalName} · Iniciar sesión`;
  document.getElementById('brand-mark').innerHTML = logo
    ? `<img src="${logo}" alt="${finalName}" onerror="this.parentElement.textContent='🍽'">`
    : '🍽';
}
let cachedBranding = null;
try { cachedBranding = JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY)); } catch (_) {}
if (cachedBranding && (cachedBranding.name || cachedBranding.logo)) {
  applyBranding(cachedBranding.name, cachedBranding.logo);
} else {
  document.getElementById('brand-mark').textContent = '🍽';
}
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
updateWhatsappButton(cachedBranding?.whatsappNumber || APP_CONFIG.whatsappNumber);
(async () => {
  let settings = null;
  try {
    settings = await window.SupabaseDB?.rpc('get_branding', {});
  } catch (_) {}
  const name = settings?.companyName?.trim();
  const logo = settings?.logoUrl || APP_CONFIG.logoUrl;
  applyBranding(name, logo);
  const whatsapp = settings?.whatsappNumber || '';
  if (whatsapp) updateWhatsappButton(whatsapp);
  if (settings) {
    try {
      localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({
        name: name || '',
        logo: settings.logoUrl || '',
        whatsappNumber: whatsapp
      }));
    } catch (_) {}
  }
})();

const STAFF_SESSION_KEY = `${APP_CONFIG.storagePrefix}-staff-session-v1`;
const STAFF_APP_URL = './index.html';
const DRIVER_APP_URL = './driver.html';
function staffDestination(role) { return role === 'driver' ? DRIVER_APP_URL : STAFF_APP_URL; }
const CLIENT_PORTAL_URL = './cliente.html';
const CLIENT_SESSION_KEY = `${APP_CONFIG.storagePrefix}-client-session-v1`;
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
  toggleStaffPass.textContent=showing?'😃':'😆';
  toggleStaffPass.setAttribute('aria-label',showing?'Mostrar contraseña':'Ocultar contraseña');
});
function showError(msg){errorEl.textContent=msg;errorEl.classList.remove('d-none');}
function clearError(){errorEl.classList.add('d-none');}
function switchAccess(type){const client=type==='client';tabClient.classList.toggle('active',client);tabStaff.classList.toggle('active',!client);formClient.classList.toggle('active',client);formStaff.classList.toggle('active',!client);clearError();}
tabClient.addEventListener('click',()=>switchAccess('client')); tabStaff.addEventListener('click',()=>switchAccess('staff'));
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
import { useState, useEffect, useRef } from 'react';
import BrandMark from './components/BrandMark.jsx';
import ThemeSelect from './components/ThemeSelect.jsx';
import ClientForm from './components/ClientForm.jsx';
import StaffForm, { STAFF_APP_URL } from './components/StaffForm.jsx';

const APP_CONFIG = window.APP_CONFIG;
const BRANDING_CACHE_KEY = `${APP_CONFIG.storagePrefix}-branding-cache-v1`;
const STAFF_SESSION_KEY = `${APP_CONFIG.storagePrefix}-staff-session-v1`;
const CLIENT_SESSION_KEY = `${APP_CONFIG.storagePrefix}-client-session-v1`;
const UI_THEME_KEY = `${APP_CONFIG.storagePrefix}-ui-theme-v1`;

function readCachedBranding() {
  try { return JSON.parse(localStorage.getItem(BRANDING_CACHE_KEY)) || null; }
  catch (_) { return null; }
}

export default function App() {
  const cached = readCachedBranding();
  const [theme, setTheme] = useState(() => localStorage.getItem(UI_THEME_KEY) || 'light');
  const [accessType, setAccessType] = useState('client');
  const [errorMsg, setErrorMsg] = useState('');
  const [brandName, setBrandName] = useState(cached?.name || APP_CONFIG.companyName);
  const [brandLogo, setBrandLogo] = useState(cached?.logo || APP_CONFIG.logoUrl || '');
  const [whatsappNumber, setWhatsappNumber] = useState(cached?.whatsappNumber || APP_CONFIG.whatsappNumber || '');
  const redirected = useRef(false);

  // Tema: se refleja como atributo data-theme en <html> — el CSS ya está
  // escrito para leerlo así.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(UI_THEME_KEY, theme);
  }, [theme]);

  // Título de la pestaña.
  useEffect(() => {
    document.title = `${brandName} · Iniciar sesión`;
  }, [brandName]);

  // Si ya hay una sesión de staff activa, saltar directo al panel — se
  // revisa una sola vez al montar.
  useEffect(() => {
    if (redirected.current) return;
    try {
      const existing = JSON.parse(sessionStorage.getItem(STAFF_SESSION_KEY));
      if (existing) { redirected.current = true; window.location.href = STAFF_APP_URL; }
    } catch (_) {}
  }, []);

  // Trae el branding real desde Supabase (nombre, logo, WhatsApp) y
  // actualiza la caché local para que la próxima carga sea instantánea.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let settings = null;
      try { settings = await window.SupabaseDB?.rpc('get_branding', {}); } catch (_) {}
      if (cancelled || !settings) return;
      const name = settings.companyName?.trim() || APP_CONFIG.companyName;
      const logo = settings.logoUrl || APP_CONFIG.logoUrl || '';
      const whatsapp = settings.whatsappNumber || '';
      setBrandName(name);
      setBrandLogo(logo);
      if (whatsapp) setWhatsappNumber(whatsapp);
      try {
        localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify({ name, logo, whatsappNumber: whatsapp }));
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, []);

  const cleanWhatsapp = String(whatsappNumber || '').replace(/\D/g, '');

  return (
    <section className="card shadow-lg border-0 rounded-4">
      <div className="card-body p-4 p-md-5">
        <div className="brand-row mb-4">
          <div className="brand-mark d-inline-flex align-items-center justify-content-center fs-2" id="brand-mark">
            <BrandMark logo={brandLogo} name={brandName} />
          </div>
          <div className="brand-info">
            <h1 className="h5 mb-1" id="brand-title">{brandName}</h1>
            <ThemeSelect theme={theme} onChange={setTheme} />
          </div>
        </div>

        <nav className="nav nav-pills nav-fill bg-body-tertiary rounded-pill p-1 mb-4" aria-label="Tipo de acceso">
          <button type="button" className={`nav-link${accessType === 'client' ? ' active' : ''}`}
            onClick={() => { setAccessType('client'); setErrorMsg(''); }}>Soy cliente</button>
          <button type="button" className={`nav-link${accessType === 'staff' ? ' active' : ''}`}
            onClick={() => { setAccessType('staff'); setErrorMsg(''); }}>Soy del equipo</button>
        </nav>

        <ClientForm active={accessType === 'client'} sessionKey={CLIENT_SESSION_KEY} onError={setErrorMsg} onClearError={() => setErrorMsg('')} />
        <StaffForm active={accessType === 'staff'} sessionKey={STAFF_SESSION_KEY} onError={setErrorMsg} onClearError={() => setErrorMsg('')} />

        {errorMsg && <div className="alert alert-danger mt-3 mb-0" role="alert">{errorMsg}</div>}

        {cleanWhatsapp && (
          <a className="btn w-100 mt-3 d-flex align-items-center justify-content-center gap-2"
            id="whatsapp-support-btn"
            href={`https://wa.me/${cleanWhatsapp}?text=${encodeURIComponent('Hola, necesito ayuda para ingresar a Catering Control.')}`}
            target="_blank" rel="noopener"
            style={{ background: '#25D366', color: '#fff', fontWeight: 650 }}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.386.702 4.607 1.912 6.47L4 29l7.72-1.877A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3zm0 21.75c-1.98 0-3.83-.55-5.41-1.5l-.388-.23-4.58 1.114 1.14-4.46-.253-.4A9.71 9.71 0 0 1 5.25 15c0-5.93 4.82-10.75 10.754-10.75S26.75 9.07 26.75 15 21.938 24.75 16.004 24.75zm5.98-8.06c-.328-.164-1.94-.957-2.24-1.066-.3-.11-.518-.164-.737.164-.218.328-.845 1.066-1.037 1.285-.19.218-.382.246-.71.082-.328-.164-1.385-.51-2.637-1.628-.975-.87-1.633-1.944-1.824-2.272-.19-.328-.02-.505.144-.668.148-.147.328-.383.492-.574.164-.19.218-.328.328-.546.11-.218.055-.41-.027-.574-.082-.164-.737-1.776-1.01-2.432-.266-.64-.537-.553-.737-.563l-.628-.012c-.218 0-.573.082-.873.41-.3.328-1.146 1.12-1.146 2.73 0 1.61 1.174 3.166 1.337 3.384.164.218 2.31 3.53 5.6 4.95.783.338 1.393.54 1.87.69.786.25 1.5.215 2.065.13.63-.094 1.94-.793 2.213-1.56.273-.766.273-1.423.19-1.56-.08-.14-.298-.22-.626-.383z"/>
            </svg>
            <span>¿Necesitas ayuda? Contactanos</span>
          </a>
        )}
      </div>
    </section>
  );
}

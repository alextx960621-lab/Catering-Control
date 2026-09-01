(()=>{
      'use strict';

      const APP_CONFIG = window.APP_CONFIG;

      const OPERATIONS_KEY=`${APP_CONFIG.storagePrefix}-operaciones-v3`,CLIENT_ROW_KEY=`${APP_CONFIG.storagePrefix}-client-row-v1`,CLIENT_SESSION_KEY=`${APP_CONFIG.storagePrefix}-client-session-v1`,THEME_KEY=`${APP_CONFIG.storagePrefix}-client-theme-v1`;
      const LOGOUT_ICON='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>';
      const CLIENT_THEME_STORE_KEY=`${APP_CONFIG.storagePrefix}-client-theme-store-v1`;
      function readClientThemeStore(){ try{ return JSON.parse(localStorage.getItem(CLIENT_THEME_STORE_KEY))||{}; }catch(_){ return {}; } }
      function clientTheme(){
        const store=readClientThemeStore(), key=session?.id||'default';
        if(!store[key]){
          store[key]=localStorage.getItem(THEME_KEY)||'light';
          localStorage.setItem(CLIENT_THEME_STORE_KEY,JSON.stringify(store));
        }
        return store[key];
      }
      function saveClientTheme(theme){
        const store=readClientThemeStore(), key=session?.id||'default';
        store[key]=theme;
        localStorage.setItem(CLIENT_THEME_STORE_KEY,JSON.stringify(store));
      }
      const $=s=>document.querySelector(s),n=v=>Number(v)||0;
      const DEFAULT_ITEMS=[['shots','Shots'],['proteins','Proteínas'],['juices','Jugos'],['breakfast','Desayuno'],['snack1','Merienda 1'],['lunch','Almuerzo'],['snack2','Merienda 2'],['dinner','Cena']];
      function menuItemsList(){ return branding.menuItems && branding.menuItems.length ? branding.menuItems : DEFAULT_ITEMS; }
      const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));let data,session,client;
      let branding={};try{branding=JSON.parse(localStorage.getItem(`${APP_CONFIG.storagePrefix}-client-branding-v1`))||{};}catch(_){branding={};}
      async function syncBranding(){try{const settings=await window.SupabaseDB?.rpc('get_branding',{});if(settings){branding={companyName:settings.companyName,logoUrl:settings.logoUrl,itemIcons:settings.itemIcons||{},whatsappNumber:settings.whatsappNumber,instagramUrl:settings.instagramUrl,instagramHandle:settings.instagramHandle,adImageUrl:settings.adImageUrl,renewalWarningDays:settings.renewalWarningDays,menuItems:(settings.menuItems||[]).map(m=>[m.key,m.label])};localStorage.setItem(`${APP_CONFIG.storagePrefix}-client-branding-v1`,JSON.stringify(branding));}}catch(_){}}
      // Antes esto solo miraba el plan (Básico/Premium) para bloquear el
      // portal. Ahora también respeta el candado individual "Portal web de
      // clientes" que el superadmin prende/apaga en Configuración > Planes.
      // Si get_plan_status() ya devuelve ese candado (clientPortalLocked, o
      // premiumLockedPages.clientPortal) lo usamos; si tu función SQL
      // todavía no lo manda, por seguridad se asume bloqueado igual que
      // antes (mismo comportamiento previo, no se rompe nada).
      async function fetchIsPremium(){
        try{
          const info=await window.SupabaseDB?.rpc('get_plan_status',{});
          const isPremiumPlan=info?.plan==='premium';
          if(!info) return false;
          const locked='clientPortalLocked' in info
            ? !!info.clientPortalLocked
            : (info.premiumLockedPages && 'clientPortal' in info.premiumLockedPages
                ? !!info.premiumLockedPages.clientPortal
                : true);
          return isPremiumPlan || !locked;
        }catch(_){return false;}
      }
      function renderLocked(){
        document.documentElement.dataset.bsTheme='light';document.documentElement.dataset.theme='light';
        const wa=whatsappNumber()?`https://wa.me/${whatsappNumber()}?text=${encodeURIComponent('Hola, quiero activar el plan Premium para acceder al portal de clientes.')}`:'';
        // Mismo bloque "función Premium" (ícono, texto y botón) que usa el
        // panel de operaciones en Notas/Sueldos/etc. — clases .premium-lock
        // y .btn-premium definidas en cliente.css.
        $('#portal').innerHTML=`<button class="client-logout-btn" id="logout" title="Cerrar sesión">${LOGOUT_ICON}<span>Salir</span></button><header class="navbar bg-body rounded-4 shadow-sm px-3 mb-3"><a class="navbar-brand d-flex align-items-center gap-2 m-0" href="#"><img loading="lazy" decoding="async" class="brand-image rounded-3" src="${esc(branding.logoUrl||APP_CONFIG.logoUrl)}" alt="${esc(branding.companyName||APP_CONFIG.companyName)}" onerror="this.style.display='none'"><span><b class="d-block fs-6">${esc(branding.companyName||APP_CONFIG.companyName)}</b><small class="text-secondary">Mi portal de cliente</small></span></a></header>
        <div class="premium-lock"><div class="premium-lock-icon">🔒</div><h2>Portal de clientes es una función Premium</h2><p>Esta cuenta está en el plan Básico. Contacta a tu proveedor para activar el plan Premium y desbloquear esta función.</p>${wa?`<a class="btn-premium" href="${wa}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div>`;
        $('#logout').onclick=()=>{sessionStorage.removeItem(CLIENT_SESSION_KEY);location.href='./login.html';};
      }
      async function syncFromServer(){
        try{
          const [remoteMeta,remoteClient]=await Promise.all([
            window.SupabaseDB?.dbGet('clientes'),
            window.SupabaseDB?.dbGetClientRow(session.id)
          ]);
          if(remoteMeta){
            data.plans=remoteMeta.plans??data.plans;
            data.days=remoteMeta.days??data.days;
            data.currentDate=remoteMeta.currentDate??data.currentDate;
            localStorage.setItem(OPERATIONS_KEY,JSON.stringify(data));
          }
          if(remoteClient){
            client=remoteClient;
            localStorage.setItem(CLIENT_ROW_KEY,JSON.stringify(client));
          }
        }catch(_){}
      }
      async function save(){
        localStorage.setItem(CLIENT_ROW_KEY,JSON.stringify(client));
        try{
          return await window.SupabaseDB.dbUpsertClientRows([client]);
        }catch(_){return false;}
      }function workDate(){return data.currentDate||new Date().toISOString().slice(0,10)}function day(date){return data.days[date]||{laborable:true}}function addDays(date,count){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+count);return d.toISOString().slice(0,10)}function nextWorkDay(date){let result=addDays(date,1),guard=0;while(!day(result).laborable&&guard++<370)result=addDays(result,1);return result}function plan(){return data.plans?.find(p=>p.id===client.planId)}
      function stateFor(date){if(!day(date).laborable)return 'No laborable';if(client.returnDate&&date>=client.returnDate)return 'Activo';if(client.pauseStart&&date>=client.pauseStart&&(!client.returnDate||date<client.returnDate))return 'Pausado';if(client.pauseDates?.includes(date))return 'Pausado';if(client.startDate&&client.startDate>date)return 'Programado';if(n(client.paidDays)&&n(client.consumedDays)>=n(client.paidDays))return 'Retorno pendiente';return client.status||'Activo'}function statusClass(state){return state==='Activo'?'success':state==='Pausado'?'warning text-dark':'secondary'}function whatsappNumber(){return branding.whatsappNumber||APP_CONFIG.whatsappNumber}function wa(text){const num=whatsappNumber();return num?`https://wa.me/${num}?text=${encodeURIComponent(text)}`:'#'}function renewalWarningDays(){return Number.isFinite(branding.renewalWarningDays)?branding.renewalWarningDays:3}
      function render(message='',error=false,showSupport=false){const date=workDate(),next=nextWorkDay(date),st=stateFor(date),p=plan(),remaining=Math.max(0,n(client.paidDays)-n(client.consumedDays)),included=client.items&&Object.keys(client.items).length?client.items:p?.items||{},theme=clientTheme();document.documentElement.dataset.bsTheme=theme==='night'?'dark':'light';document.documentElement.dataset.theme=theme;
        $('#portal').innerHTML=`<button class="client-logout-btn" id="logout" title="Cerrar sesión">${LOGOUT_ICON}<span>Salir</span></button><header class="navbar bg-body rounded-4 shadow-sm px-3 mb-3"><a class="navbar-brand d-flex align-items-center gap-2 m-0" href="#"><img loading="lazy" decoding="async" class="brand-image rounded-3" src="${esc(branding.logoUrl||APP_CONFIG.logoUrl)}" alt="${esc(branding.companyName||APP_CONFIG.companyName)}" onerror="this.style.display='none'"><span><b class="d-block fs-6">${esc(branding.companyName||APP_CONFIG.companyName)}</b><small class="text-secondary">Mi portal de cliente</small></span></a><div class="d-flex align-items-center gap-2"><label class="form-label small text-secondary mb-0" for="theme">Tema</label><select class="form-select form-select-sm" id="theme" aria-label="Tema"><option value="light">Claro</option><option value="night">Nocturno</option><option value="forest">Bosque</option></select></div></header>
        <section class="hero rounded-4 shadow-sm p-4 mb-3 d-flex align-items-center justify-content-between gap-3"><div><h1 class="h3 mb-1">Hola, ${esc(client.name)}</h1><p class="mb-0 opacity-75">Consulta tu plan y gestiona tus entregas.</p></div><div class="client-avatar rounded-circle d-grid place-items-center fw-bold fs-5 d-flex align-items-center justify-content-center">${esc((client.name||'?').slice(0,1).toUpperCase())}</div></section>
        ${branding.adImageUrl?`<section class="ad-banner rounded-4 shadow-sm overflow-hidden mb-3"><img loading="lazy" decoding="async" src="${esc(branding.adImageUrl)}" alt="Publicidad" class="d-block"></section>`:''}
        ${p&&n(client.paidDays)>0&&remaining<=renewalWarningDays()&&!['Pausado','Programado','No laborable'].includes(st)?`<section class="renewal-banner rounded-4 shadow-sm p-4 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-3"><div class="d-flex align-items-center gap-3"><span class="bounce fs-1">🥤</span><div><span class="ribbon mb-2 d-inline-flex">${remaining<=0?'¡Ya venció!':remaining===1?'¡Último día!':`¡Solo ${remaining} días!`}</span><h2 class="h5 mb-1 mt-2">${remaining<=0?'Tu plan ya terminó':'Tu plan está por terminar'}</h2><p class="mb-0 opacity-90">${remaining<=0?'Renueva ahora para no perder tus entregas.':'Renueva ahora y no te quedes sin tus entregas.'} ¡Es rapidísimo! 🎉</p></div></div>${whatsappNumber()?`<a class="btn btn-light rounded-pill px-4" href="${wa(`Hola, soy ${client.name}. ${remaining<=0?'Mi plan ya terminó y':`Me quedan ${remaining} día(s) y`} quiero renovarlo.`)}" target="_blank" rel="noopener">Quiero renovar</a>`:''}</section>`:''}
        <section class="row g-3"><div class="col-lg-8"><article class="card shadow-sm border-0 h-100 text-center"><div class="card-body p-4">${p?.photoUrl?`<img loading="lazy" decoding="async" src="${p.photoUrl}" alt="${esc(p.name)}" style="width:84px;height:84px;object-fit:cover;border-radius:16px;margin:0 auto 12px">`:''}<h2 class="h5">Tu plan actual</h2><p class="h3 mb-1">${esc(p?.name||'Plan sin asignar')}</p><span class="badge text-bg-${statusClass(st)} rounded-pill mb-4">${esc(st)}</span><div class="row g-2 justify-content-center"><div class="col-4"><div class="metric p-3"><small class="text-secondary d-block">Días pagados</small><strong class="fs-4">${n(client.paidDays)}</strong></div></div><div class="col-4"><div class="metric p-3"><small class="text-secondary d-block">Consumidos</small><strong class="fs-4">${n(client.consumedDays)}</strong></div></div><div class="col-4"><div class="metric p-3"><small class="text-secondary d-block">Restantes</small><strong class="fs-4">${remaining}</strong></div></div></div><div class="d-flex justify-content-center flex-wrap gap-2 mt-4">${menuItemsList().filter(([key])=>n(included[key])>0).map(([key,label])=>{const icon=branding.itemIcons?.[key];return `<span class="badge rounded-pill text-bg-light border">${icon?`<img loading="lazy" decoding="async" src="${icon}" alt="" style="width:18px;height:18px;object-fit:cover;border-radius:50%;vertical-align:-4px;margin-right:4px">`:''}${n(included[key])} ${label}</span>`;}).join('')||'<span class="text-secondary">Sin artículos registrados.</span>'}</div></div></article></div>
        <div class="col-lg-4"><article class="card shadow-sm border-0 h-100"><div class="card-body p-4 d-flex flex-column"><h2 class="h5">Atención al cliente</h2><p class="text-secondary">Para renovar o cambiar tu plan, escríbenos directamente.</p>${whatsappNumber()?`<a class="btn btn-success mt-auto" href="${wa(`Hola, soy ${client.name}. Quiero renovar o cambiar mi plan.`)}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:'<p class="text-secondary small mb-0">Contacta a tu proveedor para más información.</p>'}</div></article></div>
        <div class="col-12">${st==='Pausado'?(client.returnDate&&client.returnDate>date?`<article class="card shadow-sm border-0"><div class="card-body p-4"><h2 class="h5 mb-1">✅ Reactivación programada</h2><p class="text-secondary">Tu servicio se reactivará automáticamente el <b>${client.returnDate.split('-').reverse().join('/')}</b>. No necesitas hacer nada más.</p><p class="text-secondary small mb-3">¿Necesitas que sea antes? Puedes adelantarla al siguiente día laborable.</p><button class="btn btn-outline-primary btn-sm" id="resume">Adelantar reactivación al ${next.split('-').reverse().join('/')}</button><div class="alert alert-${error?'danger':'warning'} mt-3 mb-0 ${message?'':'d-none'}" id="message">${esc(message)}${showSupport&&whatsappNumber()?` <a class="alert-link" href="${wa(`Hola, soy ${client.name}. Necesito reactivar mi servicio.`)}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div></div></article>`:`<article class="card shadow-sm border-0"><div class="card-body p-4"><h2 class="h5 mb-1">Reactivar servicio</h2><p class="text-secondary">Elige cuándo quieres que se reactive. Puedes confirmarlo hasta las <b>22:00</b>.</p>
        <div class="row g-2 mb-3">
          <div class="col-sm-6"><input class="btn-check" type="radio" name="resume-mode" id="resume-mode-next" value="next" checked><label class="pause-mode-card border d-block h-100 p-3" for="resume-mode-next"><span class="d-block fw-semibold">▶ Mañana mismo</span><span class="d-block small text-secondary mt-1">Se reactiva el siguiente día laborable: ${next.split('-').reverse().join('/')}.</span></label></div>
          <div class="col-sm-6"><input class="btn-check" type="radio" name="resume-mode" id="resume-mode-date" value="date"><label class="pause-mode-card border d-block h-100 p-3" for="resume-mode-date"><span class="d-block fw-semibold">📅 Elegir fecha</span><span class="d-block small text-secondary mt-1">Por ejemplo, si vuelves recién en un par de días.</span></label></div>
        </div>
        <div id="resume-date-wrap" class="mb-3" hidden><label class="form-label" for="resume-date">¿Qué día quieres reactivarla?</label><input class="form-control" type="date" id="resume-date" min="${next}" value="" disabled></div>
        <button class="btn btn-primary" id="resume">Confirmar reactivación</button><div class="alert alert-${error?'danger':'warning'} mt-3 mb-0 ${message?'':'d-none'}" id="message">${esc(message)}${showSupport&&whatsappNumber()?` <a class="alert-link" href="${wa(`Hola, soy ${client.name}. Necesito reactivar mi servicio.`)}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div></div></article>`):`<article class="card shadow-sm border-0"><div class="card-body p-4"><h2 class="h5 mb-1">Pausar servicio</h2><p class="text-secondary">Elige cómo quieres pausar. Se aplica desde el siguiente día laborable: <b>${next.split('-').reverse().join('/')}</b>, y puedes confirmarlo hasta las <b>22:00</b>.</p>
        <div class="row g-2 mb-3">
          <div class="col-sm-4"><input class="btn-check" type="radio" name="pause-mode" id="pause-mode-open" value="open" checked><label class="pause-mode-card border d-block h-100 p-3" for="pause-mode-open"><span class="d-block fw-semibold">⏸ Pausa sin fecha</span><span class="d-block small text-secondary mt-1">Reactivas cuando quieras, avisándonos por acá o por WhatsApp.</span></label></div>
          <div class="col-sm-4"><input class="btn-check" type="radio" name="pause-mode" id="pause-mode-tomorrow" value="tomorrow"><label class="pause-mode-card border d-block h-100 p-3" for="pause-mode-tomorrow"><span class="d-block fw-semibold">1️⃣ Solo mañana</span><span class="d-block small text-secondary mt-1">Se pausa un solo día (${next.split('-').reverse().join('/')}) y se reactiva sola al siguiente.</span></label></div>
          <div class="col-sm-4"><input class="btn-check" type="radio" name="pause-mode" id="pause-mode-scheduled" value="scheduled"><label class="pause-mode-card border d-block h-100 p-3" for="pause-mode-scheduled"><span class="d-block fw-semibold">📅 Con fecha de retorno</span><span class="d-block small text-secondary mt-1">Se reactiva sola el día que elijas, sin que tengas que avisar.</span></label></div>
        </div>
        <div id="return-date-wrap" class="mb-3" hidden><label class="form-label" for="return-date">¿Qué día quieres reactivarla?</label><input class="form-control" type="date" id="return-date" min="${next}" value="" disabled></div>
        <button class="btn btn-primary" id="pause">Confirmar pausa</button><div class="alert alert-${error?'danger':'warning'} mt-3 mb-0 ${message?'':'d-none'}" id="message">${esc(message)}${showSupport&&whatsappNumber()?` <a class="alert-link" href="${wa(`Hola, soy ${client.name}. Necesito solicitar una pausa de mi servicio.`)}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div></div></article>`}</div>
        ${(client.addresses||[]).length>=2?`<div class="col-12"><article class="card shadow-sm border-0"><div class="card-body p-4"><h2 class="h5 mb-1">📍 Dirección de mañana</h2><p class="text-secondary">Elige a qué dirección quieres que te llegue el pedido de mañana (${next.split('-').reverse().join('/')}). Puedes confirmarlo hasta las <b>22:00</b> de hoy.</p><div class="row g-2 align-items-end"><div class="col-sm-8"><label class="form-label" for="tomorrow-address">Dirección para mañana</label><select class="form-select" id="tomorrow-address">${(client.addresses||[]).map(a=>`<option value="${esc(a.id)}" ${(currentAddressOverrideId(next)||client.activeAddressId)===a.id?'selected':''}>${esc(a.address||'Sin nombre')}</option>`).join('')}</select></div><div class="col-sm-4"><button class="btn btn-primary w-100" id="save-tomorrow-address">Guardar para mañana</button></div></div>${currentAddressOverrideId(next)?`<p class="text-secondary small mt-2 mb-0">Ya elegiste una dirección distinta para mañana. Si no cambias nada, se usará esa.</p>`:''}<div class="alert mt-3 mb-0 d-none" id="address-feedback"></div></div></article></div>`:''}
        <div class="col-12"><article class="card shadow-sm border-0"><div class="card-body p-4"><h2 class="h5">Déjanos un mensaje</h2><p class="text-secondary">¿Prefieres no escribir por WhatsApp? Cuéntanos qué necesitas (ej.: "Llámenme mañana para cambiar de plan") y el equipo te contacta.</p><textarea class="form-control mb-3" id="client-note-text" rows="2" placeholder="Escribe tu mensaje…"></textarea><button class="btn btn-primary" id="send-note">Enviar mensaje</button><div class="alert mt-3 mb-0 d-none" id="note-feedback"></div></div></article></div>
        ${(branding.instagramUrl||APP_CONFIG.instagramUrl)?`<div class="col-12"><a class="instagram d-flex align-items-center gap-3 rounded-4 p-3 shadow-sm" href="${esc(branding.instagramUrl||APP_CONFIG.instagramUrl)}" target="_blank" rel="noopener"><span class="fs-3">◎</span><span><b class="d-block">Seguinos en Instagram</b><small>${esc(branding.instagramHandle||APP_CONFIG.instagramHandle)} · novedades, menús y bienestar</small></span></a></div>`:''}</section>`;
        $('#theme').value=theme;$('#theme').onchange=e=>{saveClientTheme(e.target.value);render();};$('#logout').onclick=()=>{sessionStorage.removeItem(CLIENT_SESSION_KEY);location.href='./login.html';};
        document.querySelectorAll('input[name="pause-mode"]').forEach(radio=>radio.addEventListener('change',()=>{
          const scheduled=$('#pause-mode-scheduled').checked,input=$('#return-date');
          $('#return-date-wrap').hidden=!scheduled;input.disabled=!scheduled;if(!scheduled)input.value='';
        }));
        document.querySelectorAll('input[name="resume-mode"]').forEach(radio=>radio.addEventListener('change',()=>{
          const byDate=$('#resume-mode-date')?.checked,input=$('#resume-date');
          $('#resume-date-wrap').hidden=!byDate;if(input){input.disabled=!byDate;if(!byDate)input.value='';}
        }));
        $('#pause')?.addEventListener('click',requestPause);
        $('#resume')?.addEventListener('click',requestResume);
        $('#send-note')?.addEventListener('click',sendClientNote);
        $('#save-tomorrow-address')?.addEventListener('click',requestAddressOverride);
      }
      // Dirección elegida por el cliente para una fecha puntual (si la hay),
      // guardada en client.addressOverrides=[{date,addressId}] por la RPC
      // set_client_address_override. No pisa client.activeAddressId (la
      // dirección "de siempre" que administra el panel de operaciones) ni el
      // horario semanal fijo que arma el admin — es solo un cambio puntual.
      function currentAddressOverrideId(date){
        return (client.addressOverrides||[]).find(o=>o.date===date)?.addressId||'';
      }
      async function requestAddressOverride(){
        const fb=$('#address-feedback'),btn=$('#save-tomorrow-address'),sel=$('#tomorrow-address');
        if(!sel||!sel.value){return;}
        const now=new Date();
        if(now.getHours()>=22){render('Ya pasó el horario para cambiar la dirección de mañana. Ponte en contacto con Atención al Cliente.',true,true);return;}
        const next=nextWorkDay(workDate());
        btn.disabled=true;
        const result=await window.SupabaseDB?.rpc('set_client_address_override',{p_client_id:client.id,p_address_id:sel.value,p_date:next});
        btn.disabled=false;
        if(!result){fb.className='alert alert-danger mt-3 mb-0';fb.classList.remove('d-none');fb.textContent='No se pudo guardar. Intenta nuevamente o contáctanos por WhatsApp.';return;}
        client.addressOverrides=Array.isArray(result)?result:(client.addressOverrides||[]).filter(o=>o.date!==next).concat([{date:next,addressId:sel.value}]);
        localStorage.setItem(CLIENT_ROW_KEY,JSON.stringify(client));
        window.SupabaseDB?.dbInsertAudit({actor_id:client.id,actor_name:client.name,actor_role:'cliente',action:'Cliente cambió su dirección de entrega (autoservicio)',entity_type:'client',entity_label:client.name,entity_id:client.id,details:{fecha:next,addressId:sel.value}});
        render(); // el aviso "Ya elegiste una dirección distinta para mañana" confirma el cambio
      }
      async function sendClientNote(){
        const textEl=$('#client-note-text'),fb=$('#note-feedback'),btn=$('#send-note'),text=textEl.value.trim();
        if(!text){fb.className='alert alert-danger mt-3 mb-0';fb.textContent='Escribe un mensaje antes de enviarlo.';return;}
        btn.disabled=true;
        const result=await window.SupabaseDB?.rpc('crear_nota_cliente',{p_client_id:client.id,p_texto:text});
        btn.disabled=false;
        if(!result){fb.className='alert alert-danger mt-3 mb-0';fb.textContent='No se pudo enviar. Intenta nuevamente o contáctanos por WhatsApp.';return;}
        textEl.value='';fb.className='alert alert-success mt-3 mb-0';fb.textContent='¡Mensaje enviado! El equipo se pondrá en contacto contigo.';
      }
      async function requestPause(){const now=new Date();if(now.getHours()>=22){render('Ya pasó el horario de pausa automática. Ponte en contacto con Atención al Cliente.',true,true);return;}
        const next=nextWorkDay(workDate()),mode=document.querySelector('input[name="pause-mode"]:checked')?.value||'open';
        if(mode==='scheduled'&&!$('#return-date').value){render('Selecciona una fecha de retorno para esta opción.',true);return;}
        const returnDate=mode==='tomorrow'?nextWorkDay(next):mode==='scheduled'?$('#return-date').value:'';
        if(returnDate&&returnDate<=next){render('La fecha de retorno debe ser posterior al día pausado.',true);return;}
        client.pauseStart=next;client.returnDate=returnDate;client.status=returnDate?'Programado':'Pausado';client.pauseDates=(client.pauseDates||[]).filter(d=>d!==next);const saved=await save();if(!saved){render('No se pudo guardar la pausa en la base de datos. Intenta nuevamente.',true);return;}
        window.SupabaseDB?.dbInsertAudit({actor_id:client.id,actor_name:client.name,actor_role:'cliente',action:'Cliente pausó su servicio (autoservicio)',entity_type:'client',entity_label:client.name,entity_id:client.id,details:{desde:next,retorno:returnDate||'sin definir',modo:mode}});
        render(mode==='tomorrow'?`Pausa de un solo día (${next.split('-').reverse().join('/')}). Se reactiva sola el ${returnDate.split('-').reverse().join('/')}.`:returnDate?`Pausa programada desde el ${next.split('-').reverse().join('/')} hasta el ${returnDate.split('-').reverse().join('/')}.`:`Pausa abierta desde el ${next.split('-').reverse().join('/')} sin fecha de retorno.`);}
      async function requestResume(){
        const now=new Date();
        if(now.getHours()>=22){render('Ya pasó el horario de reactivación automática. Ponte en contacto con Atención al Cliente.',true,true);return;}
        const next=nextWorkDay(workDate());
        const byDate=$('#resume-mode-date')?.checked,target=byDate?$('#resume-date')?.value:next;
        if(byDate&&!target){render('Selecciona una fecha de reactivación.',true);return;}
        if(target<next){render('La fecha de reactivación debe ser el siguiente día laborable o una posterior.',true);return;}
        client.returnDate=target;client.status='Programado';
        const saved=await save();
        if(!saved){render('No se pudo guardar la reactivación en la base de datos. Intenta nuevamente.',true);return;}
        window.SupabaseDB?.dbInsertAudit({actor_id:client.id,actor_name:client.name,actor_role:'cliente',action:'Cliente reactivó su servicio (autoservicio)',entity_type:'client',entity_label:client.name,entity_id:client.id,details:{reactivaDesde:target}});
        render(`Reactivación programada para el ${target.split('-').reverse().join('/')}.`);
      }
      async function boot(){
        try{
          data=JSON.parse(localStorage.getItem(OPERATIONS_KEY))||{};
          session=JSON.parse(sessionStorage.getItem(CLIENT_SESSION_KEY));
        }catch(_){data={};session=null;}
        if(!session){location.replace('./login.html');return;}
        data.days||={};
        try{client=JSON.parse(localStorage.getItem(CLIENT_ROW_KEY));}catch(_){client=null;}
        if(!client||client.id!==session.id){
          client=await window.SupabaseDB?.dbGetClientRow(session.id);
          if(!client){location.replace('./login.html');return;}
          localStorage.setItem(CLIENT_ROW_KEY,JSON.stringify(client));
        }
        await syncBranding();
        if(!(await fetchIsPremium())){ renderLocked(); return; }
        render();
        window.SupabaseDB?.joinPresence({id:client.id, role:'cliente', name:client.name});
        Promise.all([syncFromServer(),syncBranding()]).then(async()=>{ if(!(await fetchIsPremium())){ renderLocked(); return; } render(); });
      }
      boot();
    })();
(()=>{
      'use strict';

      /* La configuración de la empresa vive en config.js (un solo archivo
         para toda la app: marca + credenciales de Supabase). */
      const APP_CONFIG = window.APP_CONFIG;

      const OPERATIONS_KEY=`${APP_CONFIG.storagePrefix}-operaciones-v3`,CLIENT_ROW_KEY=`${APP_CONFIG.storagePrefix}-client-row-v1`,CLIENT_SESSION_KEY=`${APP_CONFIG.storagePrefix}-client-session-v1`,THEME_KEY=`${APP_CONFIG.storagePrefix}-client-theme-v1`;
      const $=s=>document.querySelector(s),n=v=>Number(v)||0;
      // Antes esta lista era fija (los mismos 8 artículos hardcodeados en
      // index.js). Ahora el menú real vive en Configuración/Planes (panel de
      // operaciones) y llega acá vía syncBranding() como branding.menuItems.
      // DEFAULT_ITEMS solo se usa como respaldo si todavía no sincronizó.
      const DEFAULT_ITEMS=[['shots','Shots'],['proteins','Proteínas'],['juices','Jugos'],['breakfast','Desayuno'],['snack1','Merienda 1'],['lunch','Almuerzo'],['snack2','Merienda 2'],['dinner','Cena']];
      function menuItemsList(){ return branding.menuItems && branding.menuItems.length ? branding.menuItems : DEFAULT_ITEMS; }
      const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));let data,session,client;
      let branding={};try{branding=JSON.parse(localStorage.getItem(`${APP_CONFIG.storagePrefix}-client-branding-v1`))||{};}catch(_){branding={};}
      // Antes esto pedía dbGet('personal') completo: además del nombre/logo
      // de la empresa trae staffUsers (con el hash de la contraseña de cada
      // usuario del equipo), drivers y routes — y el portal de cliente los
      // descargaba igual, sin necesitarlos. get_branding() (ver
      // supabase-public-branding-migration.sql) devuelve solo el bloque
      // "settings" (público), nunca staffUsers/drivers/routes.
      async function syncBranding(){try{const settings=await window.SupabaseDB?.rpc('get_branding',{});if(settings){branding={companyName:settings.companyName,logoUrl:settings.logoUrl,itemIcons:settings.itemIcons||{},whatsappNumber:settings.whatsappNumber,instagramUrl:settings.instagramUrl,instagramHandle:settings.instagramHandle,adImageUrl:settings.adImageUrl,renewalWarningDays:settings.renewalWarningDays,menuItems:(settings.menuItems||[]).map(m=>[m.key,m.label])};localStorage.setItem(`${APP_CONFIG.storagePrefix}-client-branding-v1`,JSON.stringify(branding));}}catch(_){}}
      // El Portal de clientes completo es una función Premium. get_plan_status()
      // (ver supabase-premium-plan-migration.sql) es un RPC público de solo
      // lectura: nunca expone staffUsers ni datos sensibles, solo {plan:'...'}.
      async function fetchIsPremium(){try{const info=await window.SupabaseDB?.rpc('get_plan_status',{});return info?.plan==='premium';}catch(_){return false;}}
      function renderLocked(){
        document.documentElement.dataset.bsTheme='light';document.documentElement.dataset.theme='light';
        const wa=whatsappNumber()?`https://wa.me/${whatsappNumber()}?text=${encodeURIComponent('Hola, quiero activar el plan Premium para acceder al portal de clientes.')}`:'';
        $('#portal').innerHTML=`<header class="navbar bg-body rounded-3 shadow-sm px-3 mb-3"><a class="navbar-brand d-flex align-items-center gap-2 m-0" href="#"><img loading="lazy" decoding="async" class="brand-image rounded-3" src="${esc(branding.logoUrl||APP_CONFIG.logoUrl)}" alt="${esc(branding.companyName||APP_CONFIG.companyName)}" onerror="this.style.display='none'"><span><b class="d-block fs-6">${esc(branding.companyName||APP_CONFIG.companyName)}</b><small class="text-secondary">Mi portal de cliente</small></span></a><button class="btn btn-outline-secondary btn-sm" id="logout">Salir</button></header>
        <article class="card shadow-sm border-0"><div class="card-body p-4 p-md-5 text-center"><div class="fs-1 mb-2">🔒</div><h2 class="h5">El portal de clientes es una función Premium</h2><p class="text-secondary">Esta cuenta todavía está en el plan Básico. Contacta a tu proveedor para activar el plan Premium y acceder a tu plan, pausas y reactivaciones desde aquí.</p>${wa?`<a class="btn btn-success" href="${wa}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div></article>`;
        $('#logout').onclick=()=>{sessionStorage.removeItem(CLIENT_SESSION_KEY);location.href='./login.html';};
      }
      // "data" ahora solo trae planes y días (compartidos, livianos). El
      // cliente propio ("client") se guarda aparte, en su propia fila de la
      // base de datos: así este portal nunca descarga la lista de los demás
      // clientes, solo la suya.
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
      function render(message='',error=false,showSupport=false){const date=workDate(),next=nextWorkDay(date),st=stateFor(date),p=plan(),remaining=Math.max(0,n(client.paidDays)-n(client.consumedDays)),included=client.items&&Object.keys(client.items).length?client.items:p?.items||{},theme=localStorage.getItem(THEME_KEY)||data.settings?.theme||'light';document.documentElement.dataset.bsTheme=theme==='night'?'dark':'light';document.documentElement.dataset.theme=theme;
        $('#portal').innerHTML=`<header class="navbar bg-body rounded-3 shadow-sm px-3 mb-3"><a class="navbar-brand d-flex align-items-center gap-2 m-0" href="#"><img loading="lazy" decoding="async" class="brand-image rounded-3" src="${esc(branding.logoUrl||APP_CONFIG.logoUrl)}" alt="${esc(branding.companyName||APP_CONFIG.companyName)}" onerror="this.style.display='none'"><span><b class="d-block fs-6">${esc(branding.companyName||APP_CONFIG.companyName)}</b><small class="text-secondary">Mi portal de cliente</small></span></a><div class="d-flex gap-2"><select class="form-select form-select-sm" id="theme" aria-label="Tema"><option value="light">Claro</option><option value="night">Nocturno</option><option value="forest">Bosque</option></select><button class="btn btn-outline-secondary btn-sm" id="logout">Salir</button></div></header>
        <section class="hero rounded-4 shadow-sm p-4 mb-3 d-flex align-items-center justify-content-between gap-3"><div><h1 class="h3 mb-1">Hola, ${esc(client.name)}</h1><p class="mb-0 opacity-75">Consulta tu plan y gestiona tus entregas.</p></div><div class="client-avatar rounded-circle d-grid place-items-center fw-bold fs-5 d-flex align-items-center justify-content-center">${esc((client.name||'?').slice(0,1).toUpperCase())}</div></section>
        ${branding.adImageUrl?`<section class="ad-banner rounded-4 shadow-sm overflow-hidden mb-3"><img loading="lazy" decoding="async" src="${esc(branding.adImageUrl)}" alt="Publicidad" class="d-block"></section>`:''}
        ${p&&n(client.paidDays)>0&&remaining<=renewalWarningDays()&&!['Pausado','Programado','No laborable'].includes(st)?`<section class="renewal-banner rounded-4 shadow-sm p-4 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-3"><div class="d-flex align-items-center gap-3"><span class="bounce fs-1">🥤</span><div><span class="ribbon mb-2 d-inline-flex">${remaining<=0?'¡Ya venció!':remaining===1?'¡Último día!':`¡Solo ${remaining} días!`}</span><h2 class="h5 mb-1 mt-2">${remaining<=0?'Tu plan ya terminó':'Tu plan está por terminar'}</h2><p class="mb-0 opacity-90">${remaining<=0?'Renueva ahora para no perder tus entregas.':'Renueva ahora y no te quedes sin tus entregas.'} ¡Es rapidísimo! 🎉</p></div></div>${whatsappNumber()?`<a class="btn btn-light rounded-pill px-4" href="${wa(`Hola, soy ${client.name}. ${remaining<=0?'Mi plan ya terminó y':`Me quedan ${remaining} día(s) y`} quiero renovarlo.`)}" target="_blank" rel="noopener">Quiero renovar</a>`:''}</section>`:''}
        <section class="row g-3"><div class="col-lg-8"><article class="card shadow-sm border-0 h-100 text-center"><div class="card-body p-4">${p?.photoUrl?`<img loading="lazy" decoding="async" src="${p.photoUrl}" alt="${esc(p.name)}" style="width:84px;height:84px;object-fit:cover;border-radius:16px;margin:0 auto 12px">`:''}<h2 class="h5">Tu plan actual</h2><p class="h3 mb-1">${esc(p?.name||'Plan sin asignar')}</p><span class="badge text-bg-${statusClass(st)} rounded-pill mb-4">${esc(st)}</span><div class="row g-2 justify-content-center"><div class="col-4"><div class="metric p-3"><small class="text-secondary d-block">Días pagados</small><strong class="fs-4">${n(client.paidDays)}</strong></div></div><div class="col-4"><div class="metric p-3"><small class="text-secondary d-block">Consumidos</small><strong class="fs-4">${n(client.consumedDays)}</strong></div></div><div class="col-4"><div class="metric p-3"><small class="text-secondary d-block">Restantes</small><strong class="fs-4">${remaining}</strong></div></div></div><div class="d-flex justify-content-center flex-wrap gap-2 mt-4">${menuItemsList().filter(([key])=>n(included[key])>0).map(([key,label])=>{const icon=branding.itemIcons?.[key];return `<span class="badge rounded-pill text-bg-light border">${icon?`<img loading="lazy" decoding="async" src="${icon}" alt="" style="width:14px;height:14px;object-fit:cover;border-radius:50%;vertical-align:-2px;margin-right:3px">`:''}${n(included[key])} ${label}</span>`;}).join('')||'<span class="text-secondary">Sin artículos registrados.</span>'}</div></div></article></div>
        <div class="col-lg-4"><article class="card shadow-sm border-0 h-100"><div class="card-body p-4 d-flex flex-column"><h2 class="h5">Atención al cliente</h2><p class="text-secondary">Para renovar o cambiar tu plan, escríbenos directamente.</p>${whatsappNumber()?`<a class="btn btn-success mt-auto" href="${wa(`Hola, soy ${client.name}. Quiero renovar o cambiar mi plan.`)}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:'<p class="text-secondary small mb-0">Contacta a tu proveedor para más información.</p>'}</div></article></div>
        <div class="col-12">${st==='Pausado'?`<article class="card shadow-sm border-0"><div class="card-body p-4"><h2 class="h5">Reactivar servicio</h2><p class="text-secondary">Tu servicio se reactivará el siguiente día laborable: <b>${next.split('-').reverse().join('/')}</b>. Puedes solicitarlo hasta las <b>22:00</b>, igual que la pausa.</p>${client.returnDate&&client.returnDate>date?`<p class="text-secondary small">Ya tienes una reactivación programada para el <b>${client.returnDate.split('-').reverse().join('/')}</b>. Puedes confirmar de nuevo para actualizarla al siguiente día laborable.</p>`:''}<button class="btn btn-primary" id="resume">Confirmar reactivación</button><div class="alert alert-${error?'danger':'warning'} mt-3 mb-0 ${message?'':'d-none'}" id="message">${esc(message)}${showSupport&&whatsappNumber()?` <a class="alert-link" href="${wa(`Hola, soy ${client.name}. Necesito reactivar mi servicio.`)}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div></div></article>`:`<article class="card shadow-sm border-0"><div class="card-body p-4"><h2 class="h5">Pausar servicio</h2><p class="text-secondary">La pausa se aplica al siguiente día laborable: <b>${next.split('-').reverse().join('/')}</b>. Puedes programarla hasta las <b>22:00</b>.</p><div class="border rounded-3 p-3 mb-3"><div class="form-check mb-3"><input class="form-check-input" type="checkbox" id="pause-only" checked disabled><label class="form-check-label fw-semibold" for="pause-only">Pausar solo, sin fecha de retorno</label></div><div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="with-return"><label class="form-check-label" for="with-return">Agregar fecha de retorno (opcional)</label></div><div id="return-date-wrap" hidden><label class="form-label" for="return-date">Fecha de retorno</label><input class="form-control" type="date" id="return-date" min="${next}" value="" disabled></div></div><button class="btn btn-primary" id="pause">Confirmar pausa</button><div class="alert alert-${error?'danger':'warning'} mt-3 mb-0 ${message?'':'d-none'}" id="message">${esc(message)}${showSupport&&whatsappNumber()?` <a class="alert-link" href="${wa(`Hola, soy ${client.name}. Necesito solicitar una pausa de mi servicio.`)}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div></div></article>`}</div>
        ${(branding.instagramUrl||APP_CONFIG.instagramUrl)?`<div class="col-12"><a class="instagram d-flex align-items-center gap-3 rounded-4 p-3 shadow-sm" href="${esc(branding.instagramUrl||APP_CONFIG.instagramUrl)}" target="_blank" rel="noopener"><span class="fs-3">◎</span><span><b class="d-block">Seguinos en Instagram</b><small>${esc(branding.instagramHandle||APP_CONFIG.instagramHandle)} · novedades, menús y bienestar</small></span></a></div>`:''}</section>`;
        $('#theme').value=theme;$('#theme').onchange=e=>{localStorage.setItem(THEME_KEY,e.target.value);render();};$('#logout').onclick=()=>{sessionStorage.removeItem(CLIENT_SESSION_KEY);location.href='./login.html';};
        // Estos controles solo existen en la tarjeta de pausa (no en la de reactivar).
        $('#with-return')?.addEventListener('change',e=>{const input=$('#return-date');$('#return-date-wrap').hidden=!e.target.checked;input.disabled=!e.target.checked;if(!e.target.checked)input.value='';});
        $('#pause')?.addEventListener('click',requestPause);
        $('#resume')?.addEventListener('click',requestResume);
      }
      async function requestPause(){const now=new Date();if(now.getHours()>=22){render('Ya pasó el horario de pausa automática. Ponte en contacto con Atención al Cliente.',true,true);return;}const next=nextWorkDay(workDate()),returnDate=$('#with-return').checked?$('#return-date').value:'';if($('#with-return').checked&&!returnDate){render('Selecciona una fecha de retorno o desactiva esa opción.',true);return;}if(returnDate&&returnDate<=next){render('La fecha de retorno debe ser posterior al día pausado.',true);return;}client.pauseStart=next;client.returnDate=returnDate;client.status='Pausado';client.pauseDates=(client.pauseDates||[]).filter(d=>d!==next);const saved=await save();if(!saved){render('No se pudo guardar la pausa en la base de datos. Intenta nuevamente.',true);return;}
        // El panel de operaciones (index.js) registra cada pausa en el
        // historial de auditoría, pero este portal de autoservicio nunca lo
        // hacía — por eso una pausa hecha por el propio cliente no dejaba
        // rastro. Se agrega el mismo tipo de registro, identificando al
        // cliente como el actor (no hay un rol de staff acá).
        window.SupabaseDB?.dbInsertAudit({actor_id:client.id,actor_name:client.name,actor_role:'cliente',action:'Cliente pausó su servicio (autoservicio)',entity_type:'client',entity_label:client.name,entity_id:client.id,details:{desde:next,retorno:returnDate||'sin definir'}});
        render(returnDate?`Pausa programada desde el ${next.split('-').reverse().join('/')} hasta el ${returnDate.split('-').reverse().join('/')}.`:`Pausa abierta desde el ${next.split('-').reverse().join('/')} sin fecha de retorno.`);}
      // Reactivación por el propio cliente, con el mismo horario límite
      // (22:00) y la misma lógica de "aplica al siguiente día laborable"
      // que la pausa. No hace falta tocar client.status ni pauseStart: al
      // fijar returnDate=next, stateFor() ya devuelve 'Activo' automáticamente
      // a partir de esa fecha (revisa returnDate antes que pauseStart).
      async function requestResume(){
        const now=new Date();
        if(now.getHours()>=22){render('Ya pasó el horario de reactivación automática. Ponte en contacto con Atención al Cliente.',true,true);return;}
        const next=nextWorkDay(workDate());
        client.returnDate=next;
        const saved=await save();
        if(!saved){render('No se pudo guardar la reactivación en la base de datos. Intenta nuevamente.',true);return;}
        window.SupabaseDB?.dbInsertAudit({actor_id:client.id,actor_name:client.name,actor_role:'cliente',action:'Cliente reactivó su servicio (autoservicio)',entity_type:'client',entity_label:client.name,entity_id:client.id,details:{reactivaDesde:next}});
        render(`Reactivación programada para el ${next.split('-').reverse().join('/')}.`);
      }
      // Al primer ingreso (o si se limpió el navegador) todavía no hay una
      // copia local del cliente: se busca su propia fila en la base de datos
      // antes de mostrar el portal. En las siguientes visitas ya está en
      // caché y se muestra al instante mientras se sincroniza de fondo.
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
        Promise.all([syncFromServer(),syncBranding()]).then(async()=>{ if(!(await fetchIsPremium())){ renderLocked(); return; } render(); });
      }
      boot();
    })();
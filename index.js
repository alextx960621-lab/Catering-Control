(() => {
      'use strict';
      const APP_CONFIG = window.APP_CONFIG;

      let excelJsLoadPromise=null;
      function ensureExcelJS(){
        if(window.ExcelJS) return Promise.resolve(true);
        if(excelJsLoadPromise) return excelJsLoadPromise;
        excelJsLoadPromise=new Promise(resolve=>{
          const script=document.createElement('script');
          script.src='https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
          script.onload=()=>resolve(true);
          script.onerror=()=>{ excelJsLoadPromise=null; resolve(false); };
          document.head.appendChild(script);
        });
        return excelJsLoadPromise;
      }
      const KEY = `${APP_CONFIG.storagePrefix}-operaciones-v3`;

      const STAFF_USERS_KEY = `${APP_CONFIG.storagePrefix}-staff-users-v1`;
      const STAFF_SESSION_KEY = `${APP_CONFIG.storagePrefix}-staff-session-v1`;

      const UI_THEME_KEY = `${APP_CONFIG.storagePrefix}-ui-theme-v1`;
      // Tema PERSONAL de cada usuario del panel (no del navegador): se
      // indexa por el id de quien inició sesión, igual que las columnas, así
      // dos personas que comparten la misma compu no se pisan el tema. La
      // clave vieja (UI_THEME_KEY) se sigue usando solo en login.html, donde
      // todavía no hay nadie logueado, y sirve como valor inicial la primera
      // vez que cada usuario entra (después cada quien tiene el suyo).
      const USER_THEME_KEY = `${APP_CONFIG.storagePrefix}-user-theme-v1`;
      const SIDEBAR_COLLAPSED_KEY = `${APP_CONFIG.storagePrefix}-sidebar-collapsed-v1`;
      // Ancho/orden de columnas: preferencia PERSONAL de cada usuario del
      // panel, no de la empresa. Por eso vive aparte en localStorage (nunca
      // se sube a Supabase dentro de "settings") y se indexa por el id del
      // usuario que inició sesión, en vez de guardarse en state.settings
      // (que es compartido y se sincroniza para todos los dispositivos).
      const COL_PREFS_KEY = `${APP_CONFIG.storagePrefix}-col-prefs-v1`;
      const $ = (s, root=document) => root.querySelector(s);
      const $$ = (s, root=document) => [...root.querySelectorAll(s)];
      const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
      const n = v => Number(v) || 0;
      const uid = p => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
      const today = () => new Date().toISOString().slice(0,10);

      const DEFAULT_MENU_ITEMS = [['shots','Shots'],['proteins','Proteínas'],['juices','Jugos'],['breakfast','Desayuno'],['snack1','Merienda 1'],['lunch','Almuerzo'],['snack2','Merienda 2'],['dinner','Cena']];

      function menuItems(){ return (state?.settings?.menuItems||[]).map(m=>[m.key,m.label]); }

      function readImageAsDataURL(file, maxDim = 480, quality = 0.82) {
        return new Promise((resolve, reject) => {
          if (!file || !file.type?.startsWith('image/')) { reject(new Error('Archivo no válido')); return; }
          const img = new Image();
          const reader = new FileReader();
          reader.onload = () => {
            img.onload = () => {
              const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
              const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
              const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
              canvas.getContext('2d').drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('No se pudo leer la imagen'));
            img.src = reader.result;
          };
          reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
          reader.readAsDataURL(file);
        });
      }
      function applyBranding(){
        const name = state?.settings?.companyName?.trim() || APP_CONFIG.companyName;
        const logo = state?.settings?.logoUrl || '';
        const nameEl = $('#brand-name'); if (nameEl) nameEl.textContent = name;
        const markEl = $('#brand-mark'); if (markEl) markEl.innerHTML = logo ? `<img loading="lazy" decoding="async" src="${logo}" alt="${esc(name)}">` : '🍽';
        document.title = `${name} · Operaciones`;
      }

      const defaultStaffUser = {id:'staff_admin',name:'Administrador',username:'admin',email:'admin@catering.local',role:'admin',routeId:'',driverId:''};
      function readStaffUsers(){
        try { const stored=JSON.parse(localStorage.getItem(STAFF_USERS_KEY)); if(Array.isArray(stored) && stored.length) return stored; } catch (_) {}
        localStorage.setItem(STAFF_USERS_KEY,JSON.stringify([defaultStaffUser]));
        return [defaultStaffUser];
      }

      let activeUser = null;
      let staffUsers = readStaffUsers();

      function readColPrefsStore(){ try { return JSON.parse(localStorage.getItem(COL_PREFS_KEY)) || {}; } catch (_) { return {}; } }
      function writeColPrefsStore(store){ try { localStorage.setItem(COL_PREFS_KEY, JSON.stringify(store)); } catch (_) {} }
      // Devuelve las preferencias de columnas del usuario activo. La primera
      // vez que un usuario entra migra el valor viejo compartido (si había
      // uno) para no perder de golpe lo ya personalizado; de ahí en más cada
      // usuario tiene su propia copia y ya no se vuelven a tocar entre sí.
      function userColPrefs(){
        const store=readColPrefsStore(), key=activeUser?.id || 'default';
        if(!store[key]){
          store[key]={ columnWidths: state.settings.columnWidths || {}, dispatchColumnOrder: state.settings.dispatchColumnOrder || [], hiddenColumns: state.settings.hiddenColumns || [] };
          writeColPrefsStore(store);
        }
        store[key].hiddenColumns ??= [];
        return store[key];
      }
      function saveColumnWidth(group,key,width){
        const store=readColPrefsStore(), ukey=activeUser?.id || 'default';
        store[ukey] ||= { columnWidths:{}, dispatchColumnOrder:[], hiddenColumns:[] };
        store[ukey].columnWidths[group] ||= {};
        store[ukey].columnWidths[group][key]=width;
        writeColPrefsStore(store);
      }
      function saveColumnOrder(order){
        const store=readColPrefsStore(), ukey=activeUser?.id || 'default';
        store[ukey] ||= { columnWidths:{}, dispatchColumnOrder:[], hiddenColumns:[] };
        store[ukey].dispatchColumnOrder=order;
        writeColPrefsStore(store);
      }
      function saveHiddenColumns(hidden){
        const store=readColPrefsStore(), ukey=activeUser?.id || 'default';
        store[ukey] ||= { columnWidths:{}, dispatchColumnOrder:[], hiddenColumns:[] };
        store[ukey].hiddenColumns=hidden;
        writeColPrefsStore(store);
      }
      function readUserThemeStore(){ try { return JSON.parse(localStorage.getItem(USER_THEME_KEY)) || {}; } catch (_) { return {}; } }
      // Tema del usuario activo. La primera vez que un usuario entra, toma
      // como punto de partida lo que estaba elegido en la pantalla de login
      // (o 'light' si no había nada) y de ahí en más queda solo suyo.
      function userTheme(){
        const store=readUserThemeStore(), key=activeUser?.id || 'default';
        if(!store[key]){
          store[key]=localStorage.getItem(UI_THEME_KEY)||'light';
          localStorage.setItem(USER_THEME_KEY,JSON.stringify(store));
        }
        return store[key];
      }
      function saveUserTheme(theme){
        const store=readUserThemeStore(), key=activeUser?.id || 'default';
        store[key]=theme;
        localStorage.setItem(USER_THEME_KEY,JSON.stringify(store));
      }

      // 'superadmin' es un rol fijo más (como 'admin'), pero solo puede existir
      // UN usuario con ese rol (se valida al crear/editar usuarios en openUser).
      // Es el único que ve el interruptor de plan Premium/Básico en Configuración.
      const ROLE_LABELS = {admin:'Administrador', editor:'Editor', kitchen:'Cocina', driver:'Driver', superadmin:'Super Administrador'};
      const NAV_PERMS = {
        dispatch: ['admin','editor','kitchen','driver','superadmin'],
        clients: ['admin','editor','driver','superadmin'],
        drivers: ['admin','editor','superadmin'],
        routes: ['admin','editor','superadmin'],
        plans: ['admin','editor','superadmin'],
        payroll: ['admin','editor','driver','superadmin'],
        inventory: ['admin','editor','kitchen','superadmin'],
        users: ['admin','superadmin'],
        audit: ['admin','superadmin'],
        settings: ['admin','editor','kitchen','driver','superadmin']
      };
      // Funciones que solo están disponibles con el plan Premium activo. El
      // Super Administrador siempre las ve, tenga el plan que tenga la cuenta.
      const PREMIUM_FEATURES = ['payroll','inventory','audit'];

      const ROLE_PAGE_OPTIONS = [
        ['dispatch','Día de trabajo',true],
        ['clients','Clientes',true],
        ['drivers','Drivers',true],
        ['routes','Rutas',true],
        ['plans','Planes',true],
        ['payroll','Sueldos',true],
        ['inventory','Inventario',true],
        ['audit','Auditoría',false],
        ['settings','Configuración',false]
      ];
      const role = () => activeUser?.role || 'driver';
      // El Super Administrador tiene todos los permisos de Administrador
      // (isAdmin() lo incluye), más el interruptor de plan (isSuperAdmin()).
      const isAdmin = () => role() === 'admin' || role() === 'superadmin';
      const isSuperAdmin = () => role() === 'superadmin';
      const isDriverRole = () => role() === 'driver';
      const isKitchenRole = () => role() === 'kitchen';
      const isBuiltinRole = () => !!ROLE_LABELS[role()];
      function customRole(id){ return (state.settings.customRoles||[]).find(r=>r.id===id); }
  
      function roleLabel(r){ return ROLE_LABELS[r] || customRole(r)?.label || r || 'Usuario'; }

      const canManage = () => ['admin','editor','superadmin'].includes(role());
      // Puede administrar el inventario de cocina.
      const canManageInventory = () => ['admin','editor','kitchen','superadmin'].includes(role());
      function canAccessPage(page){
        if (page === 'users') return isAdmin();
        if (isBuiltinRole()) return (NAV_PERMS[page] || []).includes(role());
        return !!customRole(role())?.pages?.[page]?.view;
      }
      const BUILTIN_EDIT = { dispatch:canManage, clients:canManage, drivers:canManage, routes:canManage, plans:canManage, payroll:isAdmin, inventory:canManageInventory };
      function canEditPage(page){
        if (page === 'users') return isAdmin();
        if (isBuiltinRole()) return !!BUILTIN_EDIT[page]?.();
        return !!customRole(role())?.pages?.[page]?.edit;
      }
      // --- Plan Premium/Básico (cuenta completa, lo activa solo el Super Admin) ---
      const isPremium = () => state.settings.plan === 'premium';
      // true si la persona actual debe ver el contenido real de una función
      // premium (porque hay Premium activo, o porque es el Super Admin).
      const hasPremiumAccess = () => isPremium() || isSuperAdmin();
      function premiumLockHtml(featureLabel){
        // El contacto para pasar a Premium es el WhatsApp del PROVEEDOR de
        // Catering Control (vos/los dueños de la app), no el WhatsApp de
        // atención al cliente de la empresa que usa el panel — por eso usa
        // premiumWhatsapp y no whatsappNumber.
        const wa = state.settings.premiumWhatsapp ? `https://wa.me/${state.settings.premiumWhatsapp}?text=${encodeURIComponent(`Hola, quiero activar el plan Premium para desbloquear ${featureLabel}.`)}` : '';
        return `<div class="premium-lock"><div class="premium-lock-icon">🔒</div><h2>${esc(featureLabel)} es una función Premium</h2><p>Esta cuenta está en el plan Básico. Contacta a tu proveedor para activar el plan Premium y desbloquear esta función.</p>${wa?`<a class="btn-premium" href="${wa}" target="_blank" rel="noopener">Contactar por WhatsApp</a>`:''}</div>`;
      }
      function logAudit(action, entityType, entityLabel, entityId, details){
        window.SupabaseDB?.dbInsertAudit({
          actor_id: activeUser?.id || '',
          actor_name: activeUser?.name || roleLabel(role()),
          actor_role: role(),
          action, entity_type: entityType, entity_label: entityLabel || '', entity_id: entityId || '',
          details: details || {}
        });
      }
      function canEditDispatchField(c, field){
        if (canEditPage('dispatch')) return true;
        if (isDriverRole()) return ['maps','phone1','phone2','order'].includes(field) && effectiveRouteId(c) === activeUser.routeId;
        return false;
      }
      let ui = { page:'dispatch', search:{}, sort:{}, route:'', month:today().slice(0,7) };
      let state;

      const seed = () => ({
        currentDate: today(), days: {},
        routes: [
          {id:'r_open', name:'Ruta abierta', description:'Drivers disponibles en empresa sin ruta de trabajo', open:true, order:0},
          {id:'r_centro', name:'Centro', description:'Centro y zona norte', order:1},
          {id:'r_sur', name:'Sur', description:'Zona sur', order:2}
        ],
        plans: [
          {id:'p_balance', name:'Balance', type:'General', items:{shots:1,proteins:1,juices:1,breakfast:1,snack1:1,lunch:1,snack2:1,dinner:1}},
          {id:'p_light', name:'Light', type:'General', items:{shots:0,proteins:1,juices:1,breakfast:1,snack1:0,lunch:1,snack2:0,dinner:1}}
        ], drivers: [], clients: [], inventory:{items:[],links:[],movements:[]}, settings:{theme:'light', hiddenColumns:[], dispatchColumnOrder:[], columnWidths:{}, companyName:'', logoUrl:'', itemIcons:{}, whatsappNumber:'', premiumWhatsapp:'', instagramUrl:'', instagramHandle:'', adImageUrl:'', renewalWarningDays:3, menuItems: DEFAULT_MENU_ITEMS.map(([key,label])=>({key,label})), customRoles: [], plan: 'basico', premiumUntil: ''}
      });
      // Fecha "de confianza" para el vencimiento de Premium: se pide al
      // servidor de Supabase (no al reloj del dispositivo), así cambiar la
      // fecha de la PC o el celular no adelanta ni atrasa el vencimiento.
      // Requiere una función SQL en Supabase (ver nota junto al botón de
      // activar Premium). Si no hay conexión o la función no existe todavía,
      // usa la última fecha de servidor que se haya podido obtener en esta
      // sesión — y si nunca se pudo obtener ninguna, cae a la fecha local
      // solo como último recurso (arranque en frío, sin internet).
      let cachedServerDate = today();
      async function serverToday(){
        try{
          const d = await window.SupabaseDB?.rpc('get_server_date');
          if(typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)){ cachedServerDate = d.slice(0,10); }
        }catch(_){}
        return cachedServerDate;
      }
      function normalize(refDate) {
        state ||= seed(); state.days ||= {}; state.routes ||= []; state.plans ||= []; state.drivers ||= []; state.clients ||= []; state.inventory ||= {}; state.inventory.items ||= []; state.inventory.links ||= []; state.inventory.movements ||= []; state.settings ||= {};
        state.currentDate ||= today(); state.settings.theme ||= 'light'; state.settings.hiddenColumns ||= []; state.settings.dispatchColumnOrder ||= []; state.settings.columnWidths ||= {}; state.settings.companyName ??= ''; state.settings.logoUrl ??= ''; state.settings.itemIcons ??= {}; state.settings.whatsappNumber ??= ''; state.settings.premiumWhatsapp ??= ''; state.settings.instagramUrl ??= ''; state.settings.instagramHandle ??= ''; state.settings.adImageUrl ??= ''; state.settings.renewalWarningDays ??= 3; state.settings.plan = (state.settings.plan==='premium')?'premium':'basico'; state.settings.premiumUntil ??= '';
        // Premium por tiempo limitado: si el Super Admin activó Premium con
        // una fecha límite (premiumUntil) y esa fecha ya pasó, la cuenta
        // vuelve sola a Básico. Se revisa acá (en cada carga de datos) para
        // que el downgrade ocurra sin depender de que alguien entre como
        // Super Admin a apagarlo manualmente.
        if (state.settings.plan === 'premium' && state.settings.premiumUntil && state.settings.premiumUntil < (refDate || cachedServerDate)) {
          state.settings.plan = 'basico'; state.settings.premiumUntil = '';
        }
        if (!Array.isArray(state.settings.menuItems) || !state.settings.menuItems.length) state.settings.menuItems = DEFAULT_MENU_ITEMS.map(([key,label])=>({key,label}));
        if (!Array.isArray(state.settings.customRoles)) state.settings.customRoles = [];
        if (!state.routes.some(r => r.open)) state.routes.unshift({id:'r_open',name:'Ruta abierta',description:'Drivers disponibles sin ruta de trabajo',open:true,order:0});
        state.clients.forEach(c => { c.items ||= {}; c.order ??= ''; c.status ||= 'Activo'; c.returnDate ??= c.estimatedReturn || ''; c.paidDays ??= 0; c.consumedDays ??= 0; });
      }
      let operationsSaveQueue=Promise.resolve(true);
      let saveInFlight=false;
      function setDatabaseStatus(kind){
        saveInFlight = kind==='saving';
        const dot=$('#sync-dot'),text=$('#sync-text');
        if(dot)dot.className='sync-dot '+(kind==='saving'?'local':kind);
        if(text)text.textContent=kind==='saving'?'Guardando…':kind==='ok'?'Sincronizado':'Error de guardado';
      }
      let lastSavedClients=new Map();
      let lastSyncedClientes=null, lastSyncedPersonal=null, lastSyncedInventario=null;
      function mergeTopLevel(serverPayload, localPayload, lastSynced){
        const merged={...(serverPayload||{})};
        Object.keys(localPayload).forEach(key=>{
          const changed=!lastSynced || JSON.stringify(localPayload[key])!==JSON.stringify(lastSynced[key]);
          if(changed) merged[key]=localPayload[key];
        });
        return merged;
      }
      function diffClients(){
        const changed=[],currentIds=new Set();
        for(const c of state.clients){
          currentIds.add(c.id);
          const json=JSON.stringify(c);
          if(lastSavedClients.get(c.id)!==json) changed.push(c);
        }
        const deletedIds=[...lastSavedClients.keys()].filter(id=>!currentIds.has(id));
        return {changed,deletedIds};
      }
      async function saveClientRows(){
        const db=window.SupabaseDB,{changed,deletedIds}=diffClients();
        const [okUpsert,okDelete]=await Promise.all([
          db.dbUpsertClientRows(changed),
          db.dbDeleteClientRows(deletedIds)
        ]);
        if(okUpsert) changed.forEach(c=>lastSavedClients.set(c.id,JSON.stringify(c)));
        if(okDelete) deletedIds.forEach(id=>lastSavedClients.delete(id));
        return okUpsert&&okDelete;
      }
      function blockChanged(local,lastSynced){
        if(!lastSynced) return true;
        return Object.keys(local).some(key=>JSON.stringify(local[key])!==JSON.stringify(lastSynced[key]));
      }
      function save(){
        localStorage.setItem(KEY, JSON.stringify(state));
        localStorage.setItem(STAFF_USERS_KEY, JSON.stringify(staffUsers));
        setDatabaseStatus('saving');
        operationsSaveQueue=operationsSaveQueue.then(async()=>{
          try{
            const db=window.SupabaseDB;
            if(!db) throw new Error('Supabase no está disponible');
            const localClientes={plans:state.plans,days:state.days,currentDate:state.currentDate};
            const localPersonal={drivers:state.drivers,routes:state.routes,settings:state.settings,staffUsers};
            const localInventario={inventory:state.inventory};
            const needClientes=blockChanged(localClientes,lastSyncedClientes);
            const needPersonal=blockChanged(localPersonal,lastSyncedPersonal);
            const needInventario=blockChanged(localInventario,lastSyncedInventario);
            const [serverClientes,serverPersonal,serverInventario]=await Promise.all([
              needClientes?db.dbGet('clientes'):Promise.resolve(null),
              needPersonal?db.dbGet('personal'):Promise.resolve(null),
              needInventario?db.dbGet('inventario'):Promise.resolve(null)
            ]);
            const mergedClientes=needClientes?mergeTopLevel(serverClientes,localClientes,lastSyncedClientes):localClientes;
            const mergedPersonal=needPersonal?mergeTopLevel(serverPersonal,localPersonal,lastSyncedPersonal):localPersonal;
            const mergedInventario=needInventario?mergeTopLevel(serverInventario,localInventario,lastSyncedInventario):localInventario;
            state.plans=mergedClientes.plans; state.days=mergedClientes.days; state.currentDate=mergedClientes.currentDate;
            state.drivers=mergedPersonal.drivers; state.routes=mergedPersonal.routes; state.settings=mergedPersonal.settings; staffUsers=mergedPersonal.staffUsers;
            state.inventory=mergedInventario.inventory;
            const [okClientes,okClientRows,okPersonal,okInventario]=await Promise.all([
              needClientes?db.dbSet('clientes',mergedClientes):Promise.resolve(true),
              saveClientRows(),
              needPersonal?db.dbSet('personal',mergedPersonal):Promise.resolve(true),
              needInventario?db.dbSet('inventario',mergedInventario):Promise.resolve(true)
            ]);
            const ok=okClientes&&okClientRows&&okPersonal&&okInventario;
            if(ok){
              if(needClientes)lastSyncedClientes=JSON.parse(JSON.stringify(mergedClientes));
              if(needPersonal)lastSyncedPersonal=JSON.parse(JSON.stringify(mergedPersonal));
              if(needInventario)lastSyncedInventario=JSON.parse(JSON.stringify(mergedInventario));
              localStorage.setItem(KEY, JSON.stringify(state));
              localStorage.setItem(STAFF_USERS_KEY, JSON.stringify(staffUsers));
            }
            setDatabaseStatus(ok?'ok':'error');
            if(!ok) notice('Los cambios quedaron locales, pero no se guardaron completamente en Supabase.',true);
            return ok;
          }catch(_){setDatabaseStatus('error');notice('Los cambios quedaron locales, pero no se guardaron en la base de datos.',true);return false;}
        });
        return operationsSaveQueue;
      }
      function load(){ try { state=JSON.parse(localStorage.getItem(KEY)); } catch { state=null; } normalize(); localStorage.setItem(KEY,JSON.stringify(state)); }
      async function loadFromServer(){
        try {
          const db=window.SupabaseDB;
          if(!db) throw new Error('Supabase no está disponible');
          const [clientesData,clientRows,personalData,inventarioData]=await Promise.all([
            db.dbGet('clientes'), db.dbGetClientRows(), db.dbGet('personal'), db.dbGet('inventario')
          ]);
          let gotAny=false;
          if (clientesData) {
            gotAny=true;
            state.plans = clientesData.plans ?? state.plans;
            state.days = clientesData.days ?? state.days;
            state.currentDate = clientesData.currentDate ?? state.currentDate;
            lastSyncedClientes = JSON.parse(JSON.stringify({plans:state.plans,days:state.days,currentDate:state.currentDate}));
          }
          if (clientRows) {
            gotAny=true;
            state.clients = clientRows;
            lastSavedClients = new Map(clientRows.map(c=>[c.id, JSON.stringify(c)]));
          }
          if (personalData) {
            gotAny=true;
            state.drivers = personalData.drivers ?? state.drivers;
            state.routes = personalData.routes ?? state.routes;
            state.settings = personalData.settings ?? state.settings;
            if (Array.isArray(personalData.staffUsers) && personalData.staffUsers.length) {
              staffUsers = personalData.staffUsers;
              localStorage.setItem(STAFF_USERS_KEY, JSON.stringify(staffUsers));
            }
            lastSyncedPersonal = JSON.parse(JSON.stringify({drivers:state.drivers,routes:state.routes,settings:state.settings,staffUsers}));
          }
          if (inventarioData) {
            gotAny=true;
            state.inventory = inventarioData.inventory ?? state.inventory;
            lastSyncedInventario = JSON.parse(JSON.stringify({inventory:state.inventory}));
          }
          if (gotAny) localStorage.setItem(KEY, JSON.stringify(state));
          setDatabaseStatus('ok');
          return gotAny;
        } catch (_) { setDatabaseStatus('error'); return false; }
      }
      function day(date=state.currentDate){ return state.days[date] ||= {laborable:true, processed:false, rates:{}, processedClientIds:[]}; }
      function route(id){ return state.routes.find(x=>x.id===id); }
      function plan(id){ return state.plans.find(x=>x.id===id); }
      function driver(id){ return state.drivers.find(x=>x.id===id); }
      function routeName(id){ return route(id)?.name || 'Sin ruta'; }
      function planName(id){ return plan(id)?.name || 'Sin plan'; }
      function driverName(id){ const d=driver(id); return d ? `${d.firstName} ${d.lastName}` : 'Sin asignar'; }
      function driverForRoute(routeId){ return state.drivers.find(d=>d.routeId===routeId); }
      function syncClientRouteAndDriver(data){
        const selectedDriver=driver(data.driverId);
        if(selectedDriver?.routeId) data.routeId=selectedDriver.routeId;
        else if(data.routeId) data.driverId=driverForRoute(data.routeId)?.id || '';
        return data;
      }
      const WEEKDAYS=[{v:1,l:'Lun'},{v:2,l:'Mar'},{v:3,l:'Mié'},{v:4,l:'Jue'},{v:5,l:'Vie'},{v:6,l:'Sáb'},{v:0,l:'Dom'}];
      function weekdayOf(date=state.currentDate){ return new Date(date+'T00:00:00').getDay(); }
      function scheduleEntryFor(c,date=state.currentDate){
        const wd=weekdayOf(date);
        return (c.schedule||[]).find(e=>(e.days||[]).includes(wd)) || null;
      }
      function effectiveRouteId(c,date=state.currentDate){ return scheduleEntryFor(c,date)?.routeId || c.routeId; }
      function effectiveDriverId(c,date=state.currentDate){ return scheduleEntryFor(c,date)?.driverId || c.driverId; }
      function effectiveAddress(c,date=state.currentDate){
        const e=scheduleEntryFor(c,date), key=(e?.address==='address2')?'address2':'address1';
        return c[key]||c.address1||'';
      }
      function effectiveMaps(c,date=state.currentDate){
        const e=scheduleEntryFor(c,date), key=(e?.address==='address2')?'address2':'address1';
        return (key==='address2'?c.maps2:c.maps)||c.maps||'';
      }
      function scheduleSummary(c){
        if(!c.schedule?.length) return '';
        return c.schedule.map(e=>{
          const days=WEEKDAYS.filter(w=>(e.days||[]).includes(w.v)).map(w=>w.l).join('/')||'—';
          const r=e.routeId?routeName(e.routeId):'ruta base';
          return `${days}: ${esc(r)}`;
        }).join(' · ');
      }
      function scheduleRowHtml(e={},idx){
        const days=e.days||[];
        return `<div class="schedule-row" data-idx="${idx}" style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:8px">
          <div style="display:flex;gap:6px;flex-wrap:wrap">${WEEKDAYS.map(w=>`<label style="display:flex;flex-direction:column;align-items:center;font-size:11px;gap:2px"><span>${w.l}</span><input type="checkbox" class="sched-day" value="${w.v}" ${days.includes(w.v)?'checked':''}></label>`).join('')}</div>
          <select class="sched-route">${options(state.routes,e.routeId,'Ruta base')}</select>
          <select class="sched-driver">${options(state.drivers,e.driverId,'Driver base',d=>`${d.firstName} ${d.lastName}`)}</select>
          <select class="sched-address"><option value="address1" ${(!e.address||e.address==='address1')?'selected':''}>Dirección 1</option><option value="address2" ${e.address==='address2'?'selected':''}>Dirección 2</option></select>
          <button type="button" class="icon-btn delete sched-remove" title="Quitar franja">×</button>
        </div>`;
      }
      function initScheduleEditor(form, rows){
        const container=form.querySelector('#client-schedule-rows'), addBtn=form.querySelector('#add-schedule-row');
        if(!container||!addBtn) return;
        let list=(rows||[]).map(r=>({...r}));
        const bindRemove=()=>container.querySelectorAll('.schedule-row').forEach(row=>{
          row.querySelector('.sched-remove').onclick=()=>{ list.splice(Number(row.dataset.idx),1); render(); };
        });
        function render(){
          container.innerHTML=list.length?list.map((e,i)=>scheduleRowHtml(e,i)).join(''):'<p class="muted" style="margin:0 0 8px">Sin franjas: todos los días usa la ruta y dirección base del cliente.</p>';
          bindRemove();
        }
        render();
        addBtn.onclick=()=>{ list.push({days:[],routeId:'',driverId:'',address:'address1'}); render(); };
        form._getSchedule=()=>[...container.querySelectorAll('.schedule-row')].map(row=>({
          days:[...row.querySelectorAll('.sched-day:checked')].map(cb=>Number(cb.value)),
          routeId:row.querySelector('.sched-route').value,
          driverId:row.querySelector('.sched-driver').value,
          address:row.querySelector('.sched-address').value
        })).filter(e=>e.days.length>0);
      }
      function readScheduleRows(f){ return f._getSchedule ? f._getSchedule() : []; }
      function status(c,date=state.currentDate){
        if (!day(date).laborable) return 'No laborable';
        // El regreso automático a "Activo" por fecha de retorno es una función
        // Premium. En plan Básico la fecha de retorno queda solo como dato
        // informativo: el pase a Activo requiere un clic manual en "Activar".
        if (c.returnDate && date>=c.returnDate && hasPremiumAccess()) return 'Activo';
        if (c.pauseStart && date >= c.pauseStart && (!c.returnDate || date < c.returnDate)) return 'Pausado';
        if (c.pauseDates?.includes(date)) return 'Pausado';
        if (c.startDate && c.startDate > date) return 'Programado';
        if (n(c.paidDays) && n(c.consumedDays)>=n(c.paidDays)) return 'Retorno pendiente';
        return c.status || 'Activo';
      }
      function badge(s){ const cl=({Activo:'active',Pausado:'paused','Retorno pendiente':'pending',Programado:'pending','No laborable':'off'})[s] || 'done'; return `<span class="badge ${cl}">${esc(s)}</span>`; }
      function syncReturnDates(date=state.currentDate){
        if(!hasPremiumAccess()) return; // reactivación automática: solo Premium
        let changed=false;
        state.clients.forEach(c=>{
          if(c.returnDate && date>=c.returnDate && c.status!=='Activo'){
            c.status='Activo'; c.pauseStart=''; c.returnDate=''; changed=true;
          }
        });
        if(changed) save();
      }
      function notice(text, error=false){ const el=$('#notice'); el.textContent=text; el.className='notice show'+(error?' error':''); clearTimeout(notice.t); notice.t=setTimeout(()=>el.className='notice',2600); }
      function pageHead(title, subtitle, actions=''){ return `<div class="page-head"><div><h1>${title}</h1><p>${subtitle}</p></div><div class="head-actions">${actions}</div></div>`; }
      function options(list,current,placeholder='Seleccionar…',label=x=>x.name){ return `<option value="">${placeholder}</option>`+list.map(x=>`<option value="${esc(x.id)}" ${x.id===current?'selected':''}>${esc(label(x))}</option>`).join(''); }
      function itemFields(values={}){ return `<div class="items-grid">${menuItems().map(([key,label])=>{const icon=state.settings.itemIcons?.[key];return `<label>${icon?`<img loading="lazy" decoding="async" src="${icon}" alt="" style="width:16px;height:16px;object-fit:cover;border-radius:4px;vertical-align:-3px;margin-right:4px">`:''}${label}<input type="number" min="0" name="${key}" value="${n(values[key])}"></label>`;}).join('')}</div>`; }
      function formItems(f){ return Object.fromEntries(menuItems().map(([key])=>[key,n(f.elements[key]?.value)])); }
      function sort(list, key, group){ const s=ui.sort[group]; if(!s?.key) return list; const sortKey=s.key; return [...list].sort((a,b)=>String(value(a,sortKey)).localeCompare(String(value(b,sortKey)),undefined,{numeric:true})*s.dir); }
      function value(x,key){ if(key==='route') return routeName(x.routeId); if(key==='driver') return driverName(x.driverId); if(key==='plan') return planName(x.planId); return x[key] ?? ''; }
      // El tirador de reordenar (⋮⋮) es un elemento propio, separado del de
      // resize (el borde derecho). Antes, en Día de trabajo, era el <th>
      // ENTERO el que tenía draggable="true" con el tirador de resize
      // viviendo adentro; al empezar a arrastrar el borde para cambiar el
      // ancho (sobre todo con el dedo, en el celular) el navegador podía
      // interpretar el gesto como "arrastrar la columna" en vez de
      // "resizear", y el ancho no cambiaba. Con el grip aparte, cada gesto
      // tiene su propia zona y ya no compiten entre sí.
      function th(label,key,group){ const s=ui.sort[group]; const dragHandle=group==='dispatch'?'<span class="col-drag-handle" aria-hidden="true" title="Arrastra para reordenar la columna">⋮⋮</span>':''; return `<th data-sort="${key}" data-group="${group}">${dragHandle}${label}${s?.key===key?` <span class="sort-ind">${s.dir===1?'▲':'▼'}</span>`:''}<span class="resize-handle" aria-hidden="true"></span></th>`; }
      function defaultColWidth(label){ return Math.min(240, Math.max(70, String(label).length*8+56)); }
      function colgroupHtml(cols, group){
        const saved = userColPrefs().columnWidths?.[group] || {};
        return `<colgroup>${cols.map(([label,key])=>`<col data-col-key="${esc(key)}" style="width:${n(saved[key])||defaultColWidth(label)}px">`).join('')}</colgroup>`;
      }
      function table(list, headers, rows, group){ return `<div class="sheet table-responsive"><table class="table table-hover align-middle mb-0">${colgroupHtml(headers,group)}<thead><tr>${headers.map(h=>th(h[0],h[1],group)).join('')}</tr></thead><tbody>${list.length?list.map(rows).join(''):`<tr><td colspan="${headers.length}" class="empty">No hay registros para mostrar.</td></tr>`}</tbody></table></div>`; }
      function activate(name){ if(!canAccessPage(name)) name='dispatch'; ui.page=name; $$('.page').forEach(p=>p.classList.toggle('active',p.id===`${name}-page`)); $$('#nav [data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===name)); renderPage(name); $('#nav').classList.remove('open'); }
      function render(){ document.documentElement.dataset.theme=userTheme(); $('#current-name').textContent=activeUser.name || roleLabel(role()); $('#current-role').textContent=roleLabel(role()); $('#avatar').textContent=(activeUser.name||'O').slice(0,1).toUpperCase(); $$('#nav [data-page]').forEach(b=>b.hidden=!canAccessPage(b.dataset.page)); if(!canAccessPage(ui.page)) ui.page='dispatch'; renderPage(ui.page); }
      function renderPage(name){ const fn={dispatch:renderDispatch,clients:renderClients,drivers:renderDrivers,routes:renderRoutes,plans:renderPlans,payroll:renderPayroll,inventory:renderInventory,users:renderUsers,audit:renderAudit,settings:renderSettings}[name]; if(fn) { try{ fn(); }catch(err){ console.error(`[render:${name}]`,err); } enableTableTools(); } }
      function enableTableTools(){
      function syncTableWidth(tbl,cols){
        cols=cols||$$('colgroup col',tbl);
        const sum=cols.reduce((a,c)=>a+(parseFloat(c.style.width)||0),0);
        if(sum>0){ tbl.style.width=sum+'px'; }
        else { const min=tbl.closest('.sheet')?.clientWidth; if(min) tbl.style.width=min+'px'; }
      }
      $$('.sheet table').forEach(tbl=>{
          const cols=$$('colgroup col',tbl);
          syncTableWidth(tbl,cols);
          $$('.resize-handle',tbl).forEach((handle,index)=>{
            const headCell=handle.parentElement, col=cols[index];
            if(!col) return;
            // Pointer Events cubre mouse, dedo y lápiz con un solo listener
            // (antes había un onmousedown Y un ontouchstart por separado).
            handle.onpointerdown=e=>{
              e.preventDefault(); e.stopPropagation();
              handle.setPointerCapture(e.pointerId);
              const initial=col.getBoundingClientRect().width, start=e.clientX;
              const move=ev=>{ const width=Math.max(28,Math.round(initial+ev.clientX-start)); col.style.width=width+'px'; syncTableWidth(tbl,cols); };
              const up=()=>{
                handle.removeEventListener('pointermove',move);
                handle.removeEventListener('pointerup',up);
                handle.removeEventListener('pointercancel',up);
                const group=headCell.dataset.group, key=headCell.dataset.sort;
                if(group && key) saveColumnWidth(group,key,parseInt(col.style.width,10));
              };
              handle.addEventListener('pointermove',move);
              handle.addEventListener('pointerup',up);
              handle.addEventListener('pointercancel',up);
            };
          });
        });
        // Reordenar columnas de Día de trabajo: el tirador ⋮⋮ (separado del
        // de resize) también usa Pointer Events en vez del drag-and-drop
        // nativo de HTML5, que no responde al dedo en la mayoría de
        // navegadores móviles — por eso antes solo se podía reordenar con
        // mouse en escritorio.
        const dispatchTable=$('#dispatch-page .sheet table');
        if(dispatchTable){
          const heads=$$('thead th[data-group="dispatch"]',dispatchTable);
          $$('.col-drag-handle',dispatchTable).forEach(grip=>{
            const head=grip.parentElement;
            grip.onpointerdown=e=>{
              e.preventDefault(); e.stopPropagation();
              const sourceKey=head.dataset.sort;
              let targetHead=head;
              const move=ev=>{
                const el=document.elementFromPoint(ev.clientX,ev.clientY)?.closest('th[data-group="dispatch"]');
                heads.forEach(h=>h.classList.remove('drag-over'));
                targetHead=(el && el!==head)?el:head;
                if(targetHead!==head) targetHead.classList.add('drag-over');
              };
              const up=()=>{
                document.removeEventListener('pointermove',move);
                document.removeEventListener('pointerup',up);
                document.removeEventListener('pointercancel',up);
                heads.forEach(h=>h.classList.remove('drag-over'));
                const targetKey=targetHead.dataset.sort;
                if(!sourceKey || sourceKey===targetKey) return;
                const all=['order','name','route','driver','plan',...menuItems().map(([key])=>key),'address1','maps','phone1','phone2','notes','specialDiet','career','bags','status','returnDate','id'];
                const currentOrder=userColPrefs().dispatchColumnOrder;
                const order=currentOrder.length?[...currentOrder]:all;
                all.forEach(key=>{if(!order.includes(key))order.push(key);});
                const from=order.indexOf(sourceKey), to=order.indexOf(targetKey);
                order.splice(to,0,order.splice(from,1)[0]);
                saveColumnOrder(order); renderDispatch();
              };
              document.addEventListener('pointermove',move);
              document.addEventListener('pointerup',up);
              document.addEventListener('pointercancel',up);
            };
          });
        }
      }

      function renderDispatch(){
        syncReturnDates(state.currentDate);
        const date=state.currentDate, d=day(date), q=(ui.search.dispatch||'').toLowerCase(), rf=isDriverRole()?activeUser.routeId:ui.route, sf=ui.dispatchStatus||'all';
        const matchesBase=c=>(!rf || effectiveRouteId(c,date)===rf) && (!q || [c.name,c.carnet,c.address1,c.phone1,c.phone2,c.specialDiet,c.notes].join(' ').toLowerCase().includes(q));
        const matchesStatus=c=>sf==='all' || status(c,date)===sf;
        const routeScoped=isDriverRole()?state.clients.filter(c=>effectiveRouteId(c,date)===activeUser.routeId):state.clients;
        const activeOrders=routeScoped.filter(c=>status(c,date)==='Activo');
        let list=routeScoped.filter(c=>matchesBase(c) && matchesStatus(c));
        list=sort(list,'order','dispatch');
        const editableField=(c,field,val,type='text')=>`<input class="day-edit" data-id="${c.id}" data-field="${field}" type="${type}" value="${esc(val)}" ${canEditDispatchField(c,field)?'':'disabled'}>`;
        const itemValue=(c,key)=>{
          const ownItems=c.items && Object.keys(c.items).length ? c.items : plan(c.planId)?.items || {};
          return n(ownItems[key]);
        };
        const statusCell=c=>{
          const current=status(c,date), pausedToday=c.pauseDates?.includes(date);
          const canToggle=current==='Activo' || pausedToday;
          return `${badge(current)}${canEditPage('dispatch')&&canToggle?`<button class="outline pause-day-btn" data-action="toggle-day-pause" data-id="${c.id}">${pausedToday?'Reanudar hoy':'Pausar hoy'}</button>`:''}`;
        };
        const definitions=[
          {key:'order',label:'Orden',cell:c=>editableField(c,'order',c.order,'number')},
          {key:'name',label:'Cliente',cell:c=>`<b>${esc(c.name)}</b><br><small class="muted">${esc(c.carnet||'Sin carnet')}</small>`},
          {key:'route',label:'Ruta',cell:c=>esc(routeName(effectiveRouteId(c,date)))},
          {key:'driver',label:'Driver',cell:c=>esc(driverName(effectiveDriverId(c,date)))},
          {key:'plan',label:'Plan',cell:c=>{const p=plan(c.planId);return `${p?.photoUrl?`<img loading="lazy" decoding="async" src="${p.photoUrl}" alt="" style="width:18px;height:18px;object-fit:cover;border-radius:4px;vertical-align:-4px;margin-right:4px">`:''}${esc(planName(c.planId))}`;}},
          ...menuItems().map(([key,label])=>({key,label,cell:c=>itemValue(c,key)})),
          {key:'address1',label:'Dirección',cell:c=>{const addr=effectiveAddress(c,date),other=addr===c.address2?c.address1:c.address2;return `${esc(addr||'—')}<br><small>${esc(other||'')}</small>`;}},
          {key:'maps',label:'Google Maps',cell:c=>{const link=effectiveMaps(c,date);return `${link?`<a href="${esc(link)}" target="_blank" rel="noopener">Abrir mapa</a>`:'—'}<br>${editableField(c,'maps',c.maps||'')}`;}},
          {key:'phone1',label:'Teléfono 1',cell:c=>editableField(c,'phone1',c.phone1||'')},
          {key:'phone2',label:'Teléfono 2',cell:c=>editableField(c,'phone2',c.phone2||'')},
          {key:'notes',label:'Observaciones',cell:c=>esc(c.notes||'—')},
          {key:'specialDiet',label:'Dieta especial',cell:c=>esc(c.specialDiet||'—')},
          {key:'career',label:'Carreras / entrega',cell:c=>n(c.career||1)},
          {key:'bags',label:'Bolsas',cell:c=>n(c.bags)},
          {key:'status',label:'Estado',cell:statusCell},
          {key:'remaining',label:'Servicios restantes',cell:c=>n(c.paidDays)?Math.max(0,n(c.paidDays)-n(c.consumedDays)):'—'},
          {key:'returnDate',label:'Fecha de retorno',cell:c=>hasPremiumAccess()?(canEditPage('dispatch')?editableField(c,'returnDate',c.returnDate||'','date'):esc(c.returnDate||'—')):'<span class="muted" title="Función Premium">🔒 Premium</span>'},
          {key:'id',label:'Acciones',cell:c=>canEditPage('dispatch')?`<button class="icon-btn" data-action="edit-client" data-id="${c.id}">Editar</button>`:'—'}
        ];
        const allKeys=definitions.map(x=>x.key), wanted=userColPrefs().dispatchColumnOrder;
        const arranged=[...definitions].sort((a,b)=>{const ai=wanted.indexOf(a.key),bi=wanted.indexOf(b.key);return (ai<0?allKeys.indexOf(a.key):ai)-(bi<0?allKeys.indexOf(b.key):bi);});
        const columns=arranged.filter(x=>!userColPrefs().hiddenColumns.includes(x.key));
        const numericKeys=new Set([...menuItems().map(([key])=>key),'career','bags','remaining']);
        const totalRow=(label,orders,variant)=>{
          let labelled=false;
          return `<tr class="table-totals ${variant}">${columns.map(col=>{
            if(numericKeys.has(col.key)) return `<td>${orders.reduce((sum,c)=>sum+(col.key==='career'?n(c.career||1):col.key==='bags'?n(c.bags):col.key==='remaining'?(n(c.paidDays)?Math.max(0,n(c.paidDays)-n(c.consumedDays)):0):itemValue(c,col.key)),0)}</td>`;
            if(!labelled){ labelled=true; return `<td>${label}</td>`; }
            return '<td>—</td>';
          }).join('')}</tr>`;
        };
        const rows=c=>`<tr data-id="${c.id}">${columns.map(col=>`<td>${col.cell(c)}</td>`).join('')}</tr>`;
        const filteredActive=list.filter(c=>status(c,date)==='Activo');
        const totals=`<tfoot>${totalRow(`Totales filtrados (${filteredActive.length} pedidos activos)`,filteredActive,'filtered')}${totalRow(`Totales generales (${activeOrders.length} pedidos activos)`,activeOrders,'general')}</tfoot>`;
        const printButtons=isDriverRole()
          ?`<button class="outline" data-action="export-diets">Imprimir orden de ruta</button>`
          :`<button class="outline" data-action="export-diets">Imprimir dietas especiales</button><button class="outline" data-action="export-route-order">Imprimir orden de ruta</button>`;
        const routeField=isDriverRole()?`<label class="field">Ruta<div class="field-locked" aria-disabled="true">${esc(routeName(activeUser.routeId))}</div></label>`:`<label class="field">Ruta<select id="dispatch-route">${options(state.routes,rf,'Todas las rutas')}</select></label>`;
        $('#dispatch-page').innerHTML=pageHead('Día de trabajo','La fecha seleccionada define la base de datos operativa y los clientes activos del día.',`${printButtons}${canEditPage('dispatch')?(d.processed?'<button class="outline" data-action="unprocess-day">Desprocesar día</button>':'<button class="primary" data-action="process-day">Procesar día</button>'):''}`)+
          `<div class="toolbar"><label class="field">Día de trabajo${isDriverRole()?`<div class="field-locked" aria-disabled="true">${esc(date.split('-').reverse().join('/'))}</div>`:`<input type="date" id="work-date" value="${date}">`}</label>${routeField}<label class="field">Estado del pedido<select id="dispatch-status"><option value="all" ${sf==='all'?'selected':''}>Todos</option>${['Activo','Pausado','Programado','Retorno pendiente','No laborable'].map(s=>`<option value="${s}" ${sf===s?'selected':''}>${s}</option>`).join('')}</select></label><label class="field">Estado del día<select id="work-status" ${canEditPage('dispatch')?'':'disabled'}><option value="work" ${d.laborable?'selected':''}>Laborable</option><option value="off" ${!d.laborable?'selected':''}>No laborable</option></select></label><input id="dispatch-search" class="search" placeholder="Buscar cliente, teléfono o dieta…" value="${esc(ui.search.dispatch||'')}"><span class="spacer"></span><span class="muted">${list.length} pedidos visibles</span></div>`+
          `<div class="sheet"><table id="dispatch-table">${colgroupHtml(columns.map(c=>[c.label,c.key]),'dispatch')}<thead><tr>${columns.map(col=>th(col.label,col.key,'dispatch')).join('')}</tr></thead><tbody>${list.length?list.map(rows).join(''):`<tr><td colspan="${columns.length}" class="empty">No hay pedidos para los filtros seleccionados.</td></tr>`}</tbody>${totals}</table></div>`;
        $('#work-date')?.addEventListener('change',e=>{ if(!canEditPage('dispatch'))return; state.currentDate=e.target.value; day(e.target.value); save(); renderDispatch(); });
        $('#dispatch-route')?.addEventListener('change',e=>{ui.route=e.target.value;renderDispatch();}); $('#dispatch-status')?.addEventListener('change',e=>{ui.dispatchStatus=e.target.value;renderDispatch();}); $('#work-status')?.addEventListener('change',e=>{if(!canEditPage('dispatch'))return;day().laborable=e.target.value==='work';save();renderDispatch();}); bindSearch('dispatch-search','dispatch',renderDispatch);
        $$('.day-edit').forEach(i=>i.onchange=()=>{const c=state.clients.find(x=>x.id===i.dataset.id); if(!c)return; if(!canEditDispatchField(c,i.dataset.field))return; c[i.dataset.field]=i.value; save(); if(i.dataset.field==='returnDate'){syncReturnDates(state.currentDate);renderDispatch();notice('Fecha de retorno actualizada. El pedido volverá a Activo en esa fecha.');}});
        enableTableTools();
      }
      function bindSearch(id,key,fn){
        const el=$('#'+id);
        if(!el) return;
        el.oninput=e=>{
          const cursor=e.target.selectionStart;
          ui.search[key]=e.target.value;
          fn();
          const fresh=$('#'+id);
          fresh?.focus();
          fresh?.setSelectionRange(cursor,cursor);
        };
      }
      function renderClients(){
        if(!canAccessPage('clients')) return;
        const q=(ui.search.clients||'').toLowerCase(); const scope=isDriverRole()?state.clients.filter(c=>effectiveRouteId(c)===activeUser.routeId):state.clients; let list=scope.filter(c=>!q||[c.name,c.carnet,c.address1,c.phone1,routeName(c.routeId),planName(c.planId)].join(' ').toLowerCase().includes(q)); list=sort(list,'order','clients');
        const rows=c=>{const p=plan(c.planId);return `<tr data-id="${c.id}"><td>${n(c.order)||''}</td><td><b>${esc(c.name)}</b><br><small class="muted">CI: ${esc(c.carnet||'—')}</small></td><td>${esc(routeName(c.routeId))}${c.schedule?.length?` <span class="badge off" title="${esc(scheduleSummary(c))}">Variable</span>`:''}</td><td>${esc(c.address1||'—')}</td><td>${esc(c.phone1||'—')}</td><td>${p?.photoUrl?`<img loading="lazy" decoding="async" src="${p.photoUrl}" alt="" style="width:20px;height:20px;object-fit:cover;border-radius:5px;vertical-align:-5px;margin-right:4px">`:''}${esc(planName(c.planId))}</td><td>${esc(driverName(c.driverId))}</td><td>${badge(status(c))}</td><td>${n(c.paidDays)}</td><td>${n(c.consumedDays)}</td><td>${esc(c.specialDiet||'—')}</td><td>${canEditPage('clients')?`${status(c)==='Pausado'?`<button class="icon-btn" data-action="resume-client" data-id="${c.id}">Activar</button>`:`<button class="icon-btn" data-action="pause-client" data-id="${c.id}">Pausar</button>`}<button class="icon-btn" data-action="edit-client" data-id="${c.id}">Editar</button><button class="icon-btn delete" data-action="delete-client" data-id="${c.id}">×</button>`:'—'}</td></tr>`;};
        $('#clients-page').innerHTML=pageHead('Clientes','Ficha completa, plan alimenticio y datos de entrega.',canEditPage('clients')?'<button class="primary" data-action="add-client">+ Añadir cliente</button>':'')+`<div class="toolbar"><input id="clients-search" class="search" placeholder="Buscar clientes…" value="${esc(ui.search.clients||'')}"><span class="spacer"></span><span class="muted">${list.length} clientes</span></div>`+table(list,[['Orden','order'],['Cliente / carnet','name'],['Ruta','route'],['Dirección','address1'],['Teléfono','phone1'],['Plan','plan'],['Driver','driver'],['Estado','status'],['Días pagados','paidDays'],['Consumidos','consumedDays'],['Dieta especial','specialDiet'],['Acciones','id']],rows,'clients'); bindSearch('clients-search','clients',renderClients);
      }
      function clientForm(c={}){ return `<div class="form-grid"><label>Nombre completo *<input name="name" required value="${esc(c.name)}"></label><label>Carnet *<input name="carnet" required value="${esc(c.carnet)}"></label><label>Ruta *<select name="routeId" required>${options(state.routes,c.routeId,'Seleccionar ruta')}</select></label><label>Driver asignado<select name="driverId">${options(state.drivers,c.driverId,'Sin asignar',d=>`${d.firstName} ${d.lastName}`)}</select></label><label>Dirección 1 *<input name="address1" required value="${esc(c.address1)}"></label><label class="wide">Link de Google Maps (Dirección 1)<input type="url" name="maps" value="${esc(c.maps)}" placeholder="https://maps.google.com/…"></label><label>Dirección 2<input name="address2" value="${esc(c.address2)}"></label><label class="wide">Link de Google Maps (Dirección 2)<input type="url" name="maps2" value="${esc(c.maps2)}" placeholder="https://maps.google.com/…"></label><label>Teléfono 1 *<input name="phone1" required value="${esc(c.phone1)}"></label><label>Teléfono 2<input name="phone2" value="${esc(c.phone2)}"></label><label>Plan asignado<select name="planId">${options(state.plans,c.planId,'Sin plan')}</select></label><label>Estado del plan<select name="status">${['Activo','Pausado','Retorno pendiente','Programado'].map(s=>`<option ${c.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Fecha de inicio<input name="startDate" type="date" value="${esc(c.startDate)}"></label><label>Fecha de retorno${hasPremiumAccess()?`<input name="returnDate" type="date" value="${esc(c.returnDate)}">`:` <span class="muted" style="font-weight:400">🔒 Función Premium — contacta a tu proveedor</span><input type="hidden" name="returnDate" value="${esc(c.returnDate)}">`}</label><label>Días pagados<input name="paidDays" type="number" min="0" value="${n(c.paidDays)}"></label><label>Días consumidos<input name="consumedDays" type="number" min="0" value="${n(c.consumedDays)}"></label><label>Carreras por entrega<select name="career"><option value="1" ${n(c.career)!==2&&n(c.career)!==3?'selected':''}>Corto (1)</option><option value="2" ${n(c.career)===2?'selected':''}>Largo (2)</option><option value="3" ${n(c.career)===3?'selected':''}>Muy Largo (3)</option></select></label><label>Cantidad de bolsas<input name="bags" type="number" min="0" value="${n(c.bags)}"></label><label>Orden<input name="order" type="number" min="0" value="${esc(c.order)}"></label><label>Observaciones<input name="notes" value="${esc(c.notes)}"></label><label class="wide">Dieta especial<textarea name="specialDiet">${esc(c.specialDiet)}</textarea></label><div class="wide"><label>Artículos incluidos</label><p class="muted" style="margin:2px 0 8px">Se autorrellenan al elegir un plan arriba; puedes editarlos manualmente después.</p>${itemFields(c.items || plan(c.planId)?.items || {})}</div><div class="wide">${hasPremiumAccess()?`<label>Horario semanal (opcional)</label><p class="muted" style="margin:2px 0 8px">Marca los días en que este cliente cambia de ruta y/o dirección (ej.: Lun/Mié/Vie a una dirección, Mar/Jue a otra). Los días sin franja usan la ruta y Dirección 1 base de arriba. El cambio entre franjas es automático según el Día de trabajo.</p><div id="client-schedule-rows"></div><button type="button" class="outline" id="add-schedule-row">+ Agregar franja de días</button>`:`<label>Horario semanal</label>${premiumLockHtml('Horario semanal')}`}</div></div>`; }
      function scrollToRow(id){
        requestAnimationFrame(()=>{
          const row=document.querySelector(`tr[data-id="${id}"]`);
          if(!row)return;
          row.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});
          row.classList.add('row-flash');
          setTimeout(()=>row.classList.remove('row-flash'),2100);
        });
      }
      function openClient(id){
        let c=id?state.clients.find(x=>x.id===id):null;
        const isNew=!c;
        showModal(c?'Editar cliente':'Añadir cliente',clientForm(c||{}),async f=>{
          const data=syncClientRouteAndDriver(Object.fromEntries(new FormData(f))); data.items=formItems(f);
          data.schedule=readScheduleRows(f);
          if(c)Object.assign(c,data);else{c={id:uid('c'),...data};state.clients.push(c);}
          const saved=await save();
          if(!saved)return false;
          renderClients();notice('Cliente guardado en la base de datos.');
          scrollToRow(c.id);
          logAudit(isNew?'Cliente creado':'Cliente editado','client',c.name,c.id,{});
        });
        const form=$('#modal-form'), routeField=form?.elements.routeId, driverField=form?.elements.driverId, planField=form?.elements.planId;
        if(routeField) routeField.onchange=()=>{ driverField.value=driverForRoute(routeField.value)?.id || ''; };
        if(driverField) driverField.onchange=()=>{ const d=driver(driverField.value); if(d?.routeId) routeField.value=d.routeId; };
        if(planField) planField.onchange=()=>{
          const p=plan(planField.value);
          menuItems().forEach(([key])=>{ const input=form.elements[key]; if(input) input.value=n(p?.items?.[key]); });
        };
        initScheduleEditor(form, c?.schedule||[]);
      }
      function openClientPause(id){
        const c=state.clients.find(x=>x.id===id);if(!c)return;
        const html=`<div class="form-grid"><div class="wide pause-panel"><label class="pause-option"><input type="checkbox" name="pauseService" checked><span>Pausar servicio desde el día de trabajo actual</span></label><p>La pausa puede quedar abierta.${hasPremiumAccess()?' Si deseas programar el regreso, activa la fecha de retorno.':''}</p>${hasPremiumAccess()?`<label class="pause-option"><input type="checkbox" id="pause-with-return"><span>Agregar fecha de retorno (opcional)</span></label><label id="pause-return-wrap" hidden>Fecha de retorno<input type="date" name="returnDate" min="${state.currentDate}" value=""></label>`:`<p class="muted">🔒 Programar fecha de retorno automática es una función Premium. En el plan Básico, reactiva manualmente con el botón "Activar" cuando corresponda.</p><input type="hidden" name="returnDate" value="">`}</div></div>`;
        showModal(`Pausar a ${c.name}`,html,async f=>{
          if(!f.elements.pauseService.checked)return false;
          const returnDate=f.elements.returnDate.value;
          if(returnDate&&returnDate<=state.currentDate){notice('La fecha de retorno debe ser posterior al inicio de la pausa.',true);return false;}
          c.status='Pausado';c.pauseStart=state.currentDate;c.returnDate=returnDate;c.pauseDates=[];
          const saved=await save();if(!saved)return false;
          renderClients();notice(returnDate?'Pausa guardada con fecha de retorno.':'Pausa abierta guardada sin fecha de retorno.');
          scrollToRow(c.id);
          logAudit('Cliente pausado','client',c.name,c.id,{desde:state.currentDate,retorno:returnDate||'sin definir'});
        });
        const toggle=$('#pause-with-return'),wrap=$('#pause-return-wrap'),input=$('#modal-form').elements.returnDate;
        if(toggle){ toggle.onchange=()=>{wrap.hidden=!toggle.checked;input.disabled=!toggle.checked;if(!toggle.checked)input.value='';}; input.disabled=true; }
      }
      async function resumeClient(id){
        const c=state.clients.find(x=>x.id===id);if(!c)return;
        c.status='Activo';c.pauseStart='';c.returnDate='';c.pauseDates=[];
        const saved=await save();
        if(!saved){notice('No se pudo guardar la reactivación en la base de datos. Intenta nuevamente.',true);return;}
        renderClients();notice(`Servicio de ${c.name} activado.`);scrollToRow(c.id);
        logAudit('Cliente reactivado','client',c.name,c.id,{});
      }
      function renderDrivers(){ if(!canAccessPage('drivers')) return; const q=(ui.search.drivers||'').toLowerCase();let list=state.drivers.filter(d=>!q||[d.firstName,d.lastName,d.carnet,d.phone,d.address,routeName(d.routeId)].join(' ').toLowerCase().includes(q));list=sort(list,'order','drivers');const rows=d=>`<tr><td>${n(d.order)||''}</td><td style="display:flex;align-items:center;gap:8px"><div style="width:28px;height:28px;border-radius:50%;overflow:hidden;flex:0 0 auto;display:grid;place-items:center;background:var(--bg);border:1px solid var(--line)">${d.photoUrl?`<img loading="lazy" decoding="async" src="${d.photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`:'👤'}</div><b>${esc(d.firstName)} ${esc(d.lastName)}</b></td><td>${esc(d.carnet||'—')}</td><td>${esc(d.phone||'—')}</td><td>${esc(d.address||'—')}</td><td>${esc(routeName(d.routeId))}</td><td>${canEditPage('drivers')?`<button class="icon-btn" data-action="edit-driver" data-id="${d.id}">Editar</button><button class="icon-btn delete" data-action="delete-driver" data-id="${d.id}">×</button>`:'—'}</td></tr>`;$('#drivers-page').innerHTML=pageHead('Drivers','Personal de entrega registrado.',canEditPage('drivers')?'<button class="primary" data-action="add-driver">+ Añadir driver</button>':'')+`<div class="toolbar"><input id="drivers-search" class="search" placeholder="Buscar driver…" value="${esc(ui.search.drivers||'')}"></div>`+table(list,[['Orden','order'],['Nombre','firstName'],['Carnet','carnet'],['Teléfono','phone'],['Dirección domicilio','address'],['Ruta','route'],['Acciones','id']],rows,'drivers');bindSearch('drivers-search','drivers',renderDrivers);}
      function driverForm(d={}){return `<div class="form-grid"><label>Nombre *<input name="firstName" required value="${esc(d.firstName)}"></label><label>Apellido *<input name="lastName" required value="${esc(d.lastName)}"></label><label>Carnet *<input name="carnet" required value="${esc(d.carnet)}"></label><label>Teléfono *<input name="phone" required value="${esc(d.phone)}"></label><label class="wide">Dirección de domicilio *<input name="address" required value="${esc(d.address)}"></label><label>Ruta asignada<select name="routeId">${options(state.routes,d.routeId,'Ruta abierta')}</select></label><label>Orden<input name="order" type="number" min="0" value="${esc(d.order)}"></label><label class="wide">Foto de perfil<div style="display:flex;align-items:center;gap:10px"><div style="width:52px;height:52px;border-radius:50%;overflow:hidden;border:1px solid var(--line);display:grid;place-items:center;background:var(--bg);flex:0 0 auto">${d.photoUrl?`<img loading="lazy" decoding="async" src="${d.photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`:'👤'}</div><input type="file" name="photoFile" accept="image/*">${d.id&&d.photoUrl?`<button type="button" class="outline" onclick="removeDriverPhoto('${d.id}')">Quitar foto</button>`:''}</div></label></div>`;}
      async function removeDriverPhoto(id){const d=driver(id);if(!d)return;d.photoUrl='';const saved=await save();notice(saved?'Foto eliminada.':'Se quitó localmente, pero no se guardó en la base de datos.',!saved);openDriver(id);}
      function openDriver(id){const isNew=!id;const d0=id?driver(id):null;showModal(d0?'Editar driver':'Añadir driver',driverForm(d0||{}),async f=>{const data=Object.fromEntries(new FormData(f));const file=f.elements['photoFile']?.files?.[0];delete data.photoFile;if(file){try{data.photoUrl=await readImageAsDataURL(file,320,.82);}catch(_){notice('No se pudo procesar la foto.',true);}}let d=d0;if(d){Object.assign(d,data);state.clients.filter(c=>c.driverId===d.id).forEach(c=>c.routeId=d.routeId);
        const linkedUser=staffUsers.find(u=>u.driverId===d.id);
        if(linkedUser) linkedUser.routeId=d.routeId;
      }else{d={id:uid('d'),...data};state.drivers.push(d);}const saved=await save();if(!saved)return false;renderDrivers();notice('Driver guardado.');logAudit(isNew?'Driver creado':'Driver editado','driver',`${d.firstName||''} ${d.lastName||''}`.trim(),d.id,{});});}
      const ROUTE_TYPES={short:['Corta','done'],long:['Larga','pending'],verylong:['Muy larga','warn']};
      function routeTypeBadge(r){const [label,cl]=ROUTE_TYPES[r.type]||ROUTE_TYPES.short;return `<span class="badge ${cl}">${label}</span>`;}
      function renderRoutes(){ if(!canAccessPage('routes')) return; const q=(ui.search.routes||'').toLowerCase();let list=state.routes.filter(r=>!q||[r.name,r.description].join(' ').toLowerCase().includes(q));list=sort(list,'order','routes');const rows=r=>`<tr><td>${n(r.order)||''}</td><td><b>${esc(r.name)}</b>${r.open?' <span class="badge off">Abierta</span>':''}</td><td>${routeTypeBadge(r)}</td><td>${esc(r.description||'—')}</td><td>${state.clients.filter(c=>c.routeId===r.id).length}</td><td>${state.drivers.filter(d=>d.routeId===r.id).length}</td><td>${canEditPage('routes')&&!r.open?`<button class="icon-btn" data-action="edit-route" data-id="${r.id}">Editar</button><button class="icon-btn delete" data-action="delete-route" data-id="${r.id}">×</button>`:'—'}</td></tr>`;$('#routes-page').innerHTML=pageHead('Rutas','Incluye una ruta abierta para drivers disponibles sin ruta de trabajo.',canEditPage('routes')?'<button class="primary" data-action="add-route">+ Crear ruta</button>':'')+`<div class="toolbar"><input id="routes-search" class="search" placeholder="Buscar ruta…" value="${esc(ui.search.routes||'')}"></div>`+table(list,[['Orden','order'],['Ruta','name'],['Tipo','type'],['Descripción','description'],['Clientes','clients'],['Drivers','drivers'],['Acciones','id']],rows,'routes');bindSearch('routes-search','routes',renderRoutes);}
      function routeForm(r={}){return `<div class="form-grid"><label>Nombre de ruta *<input name="name" required value="${esc(r.name)}"></label><label>Orden<input type="number" min="0" name="order" value="${esc(r.order)}"></label><label>Tipo de ruta<select name="type"><option value="short" ${(r.type||'short')==='short'?'selected':''}>Corta</option><option value="long" ${r.type==='long'?'selected':''}>Larga</option><option value="verylong" ${r.type==='verylong'?'selected':''}>Muy larga</option></select></label><label class="wide">Descripción / zona<input name="description" value="${esc(r.description)}"></label></div>`;}
      function openRoute(id){const isNew=!id;const r0=id?route(id):null;showModal(r0?'Editar ruta':'Crear ruta',routeForm(r0||{}),f=>{const data=Object.fromEntries(new FormData(f));let r=r0;if(r)Object.assign(r,data);else{r={id:uid('r'),...data};state.routes.push(r);}save();renderRoutes();notice('Ruta guardada.');logAudit(isNew?'Ruta creada':'Ruta editada','route',r.name,r.id,{});});}

      function renderPlans(){ if(!canAccessPage('plans')) return; const cols=menuItems(); let planList=sort(state.plans,'name','plans'); const rows=p=>`<tr><td style="display:flex;align-items:center;gap:8px"><div style="width:32px;height:32px;border-radius:8px;overflow:hidden;flex:0 0 auto;display:grid;place-items:center;background:var(--bg);border:1px solid var(--line)">${p.photoUrl?`<img loading="lazy" decoding="async" src="${p.photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`:'🍽️'}</div><b>${esc(p.name)}</b></td><td>${esc(p.type||'General')}</td>${cols.map(([k])=>`<td>${n(p.items?.[k])}</td>`).join('')}<td>${canEditPage('plans')?`<button class="icon-btn" data-action="edit-plan" data-id="${p.id}">Editar</button><button class="icon-btn delete" data-action="delete-plan" data-id="${p.id}">×</button>`:'—'}</td></tr>`;
        const menuRows=()=>cols.map(([key,label])=>`<tr><td>${esc(label)}</td><td>${canEditPage('plans')?`<button class="icon-btn" data-action="edit-menu-item" data-id="${key}">Editar</button><button class="icon-btn delete" data-action="delete-menu-item" data-id="${key}">×</button>`:'—'}</td></tr>`).join('');
        $('#plans-page').innerHTML=pageHead('Planes','Configuración de artículos incluidos por plan. Arrastra el borde de una columna para ajustar su ancho.',canEditPage('plans')?'<button class="outline" data-action="open-item-icons">Asignar imagen a artículos</button><button class="outline" data-action="add-menu-item">+ Crear artículo</button><button class="primary" data-action="add-plan">+ Crear plan</button>':'')+table(planList,[['Plan','name'],['Tipo','type'],...cols.map(([key,label])=>[label,key]),['Acciones','id']],rows,'plans')
          +pageHead('Artículos del menú','Aparecen como columnas en Día de trabajo, en el Excel del día procesado y en el portal del cliente. Se pueden crear, renombrar o eliminar artículos (incluidos los que vienen por defecto).')
          +`<div class="sheet table-responsive"><table class="table table-hover align-middle mb-0"><thead><tr><th>Artículo</th><th>Acciones</th></tr></thead><tbody>${cols.length?menuRows():'<tr><td colspan="2" class="empty">No hay artículos definidos.</td></tr>'}</tbody></table></div>`;
      }
      function menuItemForm(item={}){ return `<div class="form-grid"><label class="wide">Nombre del artículo *<input name="label" required value="${esc(item.label)}" placeholder="Ej.: Postre"></label></div>`; }
      function openMenuItem(key){
        const isNew=!key;
        const current=isNew?null:state.settings.menuItems.find(x=>x.key===key);
        showModal(current?'Editar artículo':'Crear artículo',menuItemForm(current||{}),async f=>{
          const label=f.elements.label.value.trim();
          if(!label){notice('El nombre no puede estar vacío.',true);return false;}
          if(current){ current.label=label; }
          else { state.settings.menuItems.push({key:uid('item'),label}); }
          const saved=await save();
          if(!saved)return false;
          renderPlans();
          notice(isNew?'Artículo creado.':'Artículo actualizado.');
          logAudit(isNew?'Artículo de menú creado':'Artículo de menú editado','menu-item',label,current?.key||'',{});
        });
      }
      async function deleteMenuItem(key){
        const current=state.settings.menuItems.find(x=>x.key===key);
        if(!current)return;
        if(state.settings.menuItems.length<=1){notice('Debe existir al menos un artículo en el menú.',true);return;}
        if(!confirm(`¿Eliminar el artículo "${current.label}"? Se quitará de planes, clientes y vínculos de inventario que lo usen.`))return;
        state.settings.menuItems=state.settings.menuItems.filter(x=>x.key!==key);
        state.plans.forEach(p=>{ if(p.items) delete p.items[key]; });
        state.clients.forEach(c=>{ if(c.items) delete c.items[key]; });
        if(state.settings.itemIcons) delete state.settings.itemIcons[key];
        state.inventory.links=state.inventory.links.filter(l=>l.clientItemKey!==key);
        const saved=await save();
        renderPlans();
        notice(saved?'Artículo eliminado.':'Se eliminó localmente, pero no se guardó en la base de datos.',!saved);
        if(saved) logAudit('Artículo de menú eliminado','menu-item',current.label,key,{});
      }
      function itemIconsForm(){
        return `<p class="muted">Sube una imagen para cada artículo del menú (aparece junto a las cantidades en planes y clientes).</p>
        <div class="toggle-list" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr))">${menuItems().map(([key,label])=>{const icon=state.settings.itemIcons?.[key];return `<div style="display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:10px;padding:8px">
          <div style="width:34px;height:34px;border-radius:8px;overflow:hidden;border:1px solid var(--line);display:grid;place-items:center;background:var(--bg);flex:0 0 auto">${icon?`<img loading="lazy" decoding="async" src="${icon}" alt="" style="width:100%;height:100%;object-fit:cover">`:'🍽️'}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:650;margin-bottom:4px">${label}</div>
            <input type="file" accept="image/*" data-item-icon="${key}" style="font-size:11px">
          </div>
          ${icon?`<button type="button" class="icon-btn" data-action="remove-item-icon" data-id="${key}" title="Quitar">✕</button>`:''}
        </div>`;}).join('')}</div>`;
      }
      function openItemIcons(){
        showModal('Asignar imagen a artículos',itemIconsForm(),()=>false); // false: este modal se cierra con la X, no "Guardar" (cada imagen se guarda al elegirla)
        $('#modal-save').hidden=true;
        openItemIconsHandlers();
      }
      function openItemIconsHandlers(){
        $$('[data-item-icon]').forEach(input=>input.onchange=async e=>{const file=e.target.files[0];if(!file)return;const key=input.dataset.itemIcon;try{state.settings.itemIcons[key]=await readImageAsDataURL(file,160,.8);const saved=await save();$('#modal-body').innerHTML=itemIconsForm();openItemIconsHandlers();notice(saved?'Ícono actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);}catch(_){notice('No se pudo procesar la imagen.',true);}});
      }
      function planForm(p={}){return `<div class="form-grid"><label>Nombre *<input name="name" required value="${esc(p.name)}"></label><label>Tipo<input name="type" value="${esc(p.type||'General')}"></label><label class="wide">Foto del plan<div style="display:flex;align-items:center;gap:10px"><div style="width:52px;height:52px;border-radius:10px;overflow:hidden;border:1px solid var(--line);display:grid;place-items:center;background:var(--bg);flex:0 0 auto">${p.photoUrl?`<img loading="lazy" decoding="async" src="${p.photoUrl}" alt="" style="width:100%;height:100%;object-fit:cover">`:'🍽️'}</div><input type="file" name="photoFile" accept="image/*">${p.id&&p.photoUrl?`<button type="button" class="outline" onclick="removePlanPhoto('${p.id}')">Quitar foto</button>`:''}</div></label><div class="wide"><label>Artículos incluidos</label>${itemFields(p.items)}</div></div>`;}
      async function removePlanPhoto(id){const p=plan(id);if(!p)return;p.photoUrl='';const saved=await save();notice(saved?'Foto eliminada.':'Se quitó localmente, pero no se guardó en la base de datos.',!saved);openPlan(id);}
      function openPlan(id){const isNew=!id;const p0=id?plan(id):null;showModal(p0?'Editar plan':'Crear plan',planForm(p0||{}),async f=>{const data=Object.fromEntries(new FormData(f));const file=f.elements['photoFile']?.files?.[0];delete data.photoFile;data.items=formItems(f);if(file){try{data.photoUrl=await readImageAsDataURL(file,320,.82);}catch(_){notice('No se pudo procesar la foto.',true);}}let p=p0;if(p)Object.assign(p,data);else{p={id:uid('p'),...data};state.plans.push(p);}const saved=await save();if(!saved)return false;renderPlans();notice('Plan guardado.');logAudit(isNew?'Plan creado':'Plan editado','plan',p.name,p.id,{});});}

      function kitchenItem(id){ return state.inventory.items.find(x=>x.id===id); }
      function clientItemQuantity(c,key){ const own=c.items && Object.keys(c.items).length ? c.items : plan(c.planId)?.items || {}; return n(own[key]); }
      function inventoryItemForm(item={}){ return `<div class="form-grid"><label>Producto de cocina *<input name="name" required value="${esc(item.name)}" placeholder="Ej.: Envase mediano"></label><label>Unidad *<input name="unit" required value="${esc(item.unit||'unidades')}" placeholder="unidades, kg, litros"></label><label>Stock inicial / actual<input name="stock" type="number" step="0.01" value="${n(item.stock)}"></label><label>Stock mínimo<input name="minimum" type="number" min="0" step="0.01" value="${n(item.minimum)}"></label></div>`; }
      function openInventoryItem(id){ const isNew=!id; const item0=id?kitchenItem(id):null; showModal(item0?'Editar producto':'Añadir producto de cocina',inventoryItemForm(item0||{}),async f=>{const data=Object.fromEntries(new FormData(f));let item=item0;if(item)Object.assign(item,data);else{item={id:uid('inv'),...data};state.inventory.items.push(item);}const saved=await save();if(!saved)return false;renderInventory();notice('Producto de inventario guardado.');logAudit(isNew?'Producto de inventario creado':'Producto de inventario editado','inventory-item',item.name,item.id,{});}); }
      function inventoryOptions(current=''){ return `<option value="">Seleccionar producto</option>`+state.inventory.items.map(x=>`<option value="${x.id}" ${x.id===current?'selected':''}>${esc(x.name)} (${esc(x.unit||'unidades')})</option>`).join(''); }
      function inventoryMovementForm(type,m={}){ const title=(m.id?'Editar ':'')+(type==='entry'?'Ingreso de producto':type==='waste'?'Salida por merma':'Salida por uso'); return {title,html:`<div class="form-grid"><label>Fecha<input name="date" type="date" value="${m.date||state.currentDate}"></label><label>Producto *<select name="inventoryId" required>${inventoryOptions(m.inventoryId)}</select></label><label>Cantidad *<input name="quantity" type="number" min="0.01" step="0.01" required value="${m.id?Math.abs(n(m.quantity)):''}"></label><label>Motivo / detalle<input name="note" required placeholder="Ej.: recepción proveedor" value="${esc(m.note)}"></label></div>`}; }
      function openInventoryMovement(type,id){
        const existing=id?state.inventory.movements.find(x=>x.id===id):null;
        const form=inventoryMovementForm(type,existing||{});
        showModal(form.title,form.html,async f=>{
          const data=Object.fromEntries(new FormData(f)), item=kitchenItem(data.inventoryId); if(!item)return false;
          const qty=n(data.quantity), delta=type==='entry'?qty:-qty;
          if(existing){ const oldItem=kitchenItem(existing.inventoryId); if(oldItem)oldItem.stock=n(oldItem.stock)-n(existing.quantity); }
          item.stock=n(item.stock)+delta;
          if(existing){ Object.assign(existing,{date:data.date,inventoryId:data.inventoryId,type,quantity:delta,note:data.note}); }
          else state.inventory.movements.unshift({id:uid('mov'),date:data.date,inventoryId:data.inventoryId,type,quantity:delta,note:data.note});
          const saved=await save(); if(!saved)return false;
          renderInventory();notice(existing?'Movimiento actualizado.':(type==='entry'?'Ingreso registrado.':'Salida de inventario registrada.'));
          logAudit(existing?'Movimiento de inventario editado':'Movimiento de inventario registrado','inventory-movement',item.name,existing?.id||'',{tipo:type,cantidad:delta,motivo:data.note,fecha:data.date});
        });
      }
      async function deleteInventoryMovement(id){
        const m=state.inventory.movements.find(x=>x.id===id); if(!m||m.type==='delivery')return;
        if(!confirm('¿Eliminar este movimiento? Se revertirá su efecto sobre el stock.'))return;
        const item=kitchenItem(m.inventoryId); if(item)item.stock=n(item.stock)-n(m.quantity);
        state.inventory.movements=state.inventory.movements.filter(x=>x.id!==id);
        const saved=await save(); renderInventory();
        notice(saved?'Movimiento eliminado y stock ajustado.':'Se eliminó localmente, pero no se guardó en la base de datos.',!saved);
        if(saved) logAudit('Movimiento de inventario eliminado','inventory-movement',item?.name||m.inventoryId,m.id,{tipo:m.type,cantidad:m.quantity,motivo:m.note});
      }
      function inventoryLinkForm(link={}){ return `<div class="form-grid"><label>Producto de cocina *<select name="inventoryId" required>${inventoryOptions(link.inventoryId)}</select></label><label>Artículo entregado al cliente *<select name="clientItemKey" required>${menuItems().map(([key,label])=>`<option value="${key}" ${link.clientItemKey===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="wide">Cantidad a descontar por cada artículo entregado *<input name="quantity" type="number" min="0.01" step="0.01" required value="${n(link.quantity)||1}"></label></div>`; }
      function openInventoryLink(id){ const isNew=!id; const link0=id?state.inventory.links.find(x=>x.id===id):null; showModal(link0?'Editar vínculo de consumo':'Vincular consumo a artículo entregado',inventoryLinkForm(link0||{}),async f=>{const data=Object.fromEntries(new FormData(f));let link=link0;if(link)Object.assign(link,data);else{link={id:uid('link'),...data};state.inventory.links.push(link);}const saved=await save();if(!saved)return false;renderInventory();notice('Vínculo de consumo guardado.');logAudit(isNew?'Vínculo de consumo creado':'Vínculo de consumo editado','inventory-link',kitchenItem(link.inventoryId)?.name||link.inventoryId,link.id,{});}); }
      async function deleteInventoryItem(id){ const item=kitchenItem(id); if(!item || !confirm(`¿Eliminar ${item.name} del inventario?`))return; state.inventory.items=state.inventory.items.filter(x=>x.id!==id); state.inventory.links=state.inventory.links.filter(x=>x.inventoryId!==id); const saved=await save();renderInventory();notice(saved?'Producto eliminado.':'Se eliminó localmente, pero no se guardó en la base de datos.',!saved); if(saved) logAudit('Producto de inventario eliminado','inventory-item',item.name,id,{}); }
      async function deleteInventoryLink(id){ const link=state.inventory.links.find(x=>x.id===id); if(!link||!confirm('¿Eliminar este vínculo de consumo?'))return; state.inventory.links=state.inventory.links.filter(x=>x.id!==id);const saved=await save();renderInventory();notice(saved?'Vínculo eliminado.':'Se eliminó localmente, pero no se guardó en la base de datos.',!saved); if(saved) logAudit('Vínculo de consumo eliminado','inventory-link',kitchenItem(link.inventoryId)?.name||link.inventoryId,id,{}); }
      function renderInventory(){
        if(!canAccessPage('inventory')) return;
        if(!hasPremiumAccess()){ $('#inventory-page').innerHTML=pageHead('Inventario','Controla existencias de cocina.')+premiumLockHtml('Inventario'); return; }
        const itemRows=item=>{const links=state.inventory.links.filter(l=>l.inventoryId===item.id);const low=n(item.stock)<=n(item.minimum);return `<tr><td><b>${esc(item.name)}</b>${low?' <span class="badge warn">Stock bajo</span>':''}</td><td>${esc(item.unit||'unidades')}</td><td>${n(item.stock)}</td><td>${n(item.minimum)}</td><td>${links.length?links.map(l=>`${n(l.quantity)} × ${esc(menuItems().find(([key])=>key===l.clientItemKey)?.[1]||l.clientItemKey)}`).join('<br>'):'—'}</td><td>${canEditPage('inventory')?`<button class="icon-btn" data-action="edit-inventory-item" data-id="${item.id}">Editar</button><button class="icon-btn delete" data-action="delete-inventory-item" data-id="${item.id}">×</button>`:'—'}</td></tr>`;};
        const linkRows=link=>`<tr><td>${esc(kitchenItem(link.inventoryId)?.name||'Producto eliminado')}</td><td>${esc(menuItems().find(([key])=>key===link.clientItemKey)?.[1]||link.clientItemKey)}</td><td>${n(link.quantity)}</td><td>${canEditPage('inventory')?`<button class="icon-btn" data-action="edit-inventory-link" data-id="${link.id}">Editar</button><button class="icon-btn delete" data-action="delete-inventory-link" data-id="${link.id}">×</button>`:'—'}</td></tr>`;
        const recent=state.inventory.movements.slice(0,12);
        const movementRows=m=>`<tr><td>${esc(m.date)}</td><td>${esc(kitchenItem(m.inventoryId)?.name||'Producto eliminado')}</td><td>${m.quantity>0?`+${n(m.quantity)}`:n(m.quantity)}</td><td>${m.type==='entry'?'Ingreso':m.type==='waste'?'Merma':m.type==='delivery'?'Entrega procesada':'Uso'}</td><td>${esc(m.note||'—')}</td><td>${canEditPage('inventory')&&m.type!=='delivery'?`<button class="icon-btn" data-action="edit-inventory-movement" data-id="${m.id}">Editar</button><button class="icon-btn delete" data-action="delete-inventory-movement" data-id="${m.id}">×</button>`:'—'}</td></tr>`;
        const actions=canEditPage('inventory')?`<button class="primary" data-action="add-inventory-item">+ Producto de cocina</button><button class="outline" data-action="add-inventory-entry">+ Ingreso</button><button class="outline" data-action="add-inventory-use">− Uso</button><button class="outline" data-action="add-inventory-waste">− Merma</button><button class="outline" data-action="add-inventory-link">Vincular consumo</button>`:'';
        $('#inventory-page').innerHTML=pageHead('Inventario','Controla existencias de cocina. Los vínculos descuentan insumos automáticamente al procesar pedidos activos.',actions)+`<div class="two-col"><div class="card card-pad"><h3 style="margin-bottom:12px">Productos de cocina</h3>${table(state.inventory.items,[['Producto','name'],['Unidad','unit'],['Stock','stock'],['Mínimo','minimum'],['Se descuenta con','links'],['Acciones','id']],itemRows,'inventory')}</div><div class="card card-pad"><h3 style="margin-bottom:12px">Vínculos de consumo</h3>${table(state.inventory.links,[['Producto de cocina','inventoryId'],['Artículo entregado','clientItemKey'],['Cantidad por entrega','quantity'],['Acciones','id']],linkRows,'inventory-links')}</div></div><div class="card card-pad" style="margin-top:18px"><h3 style="margin-bottom:12px">Últimos movimientos</h3>${table(recent,[['Fecha','date'],['Producto','inventoryId'],['Cantidad','quantity'],['Tipo','type'],['Detalle','note'],['Acciones','id']],movementRows,'inventory-movements')}</div>`;
      }
      function applyInventoryForProcessedDay(date){
        const active=state.clients.filter(c=>status(c,date)==='Activo');
        state.inventory.links.forEach(link=>{
          const item=kitchenItem(link.inventoryId); if(!item)return;
          const delivered=active.reduce((sum,c)=>sum+clientItemQuantity(c,link.clientItemKey),0), used=delivered*n(link.quantity);
          if(!used)return;
          item.stock=n(item.stock)-used;
          state.inventory.movements.unshift({id:uid('mov'),date,inventoryId:item.id,type:'delivery',quantity:-used,note:`Descuento automático: ${delivered} ${menuItems().find(([key])=>key===link.clientItemKey)?.[1]||link.clientItemKey}`});
        });
      }
      function revertInventoryForProcessedDay(date){
        const kept=[];
        state.inventory.movements.forEach(m=>{
          if(m.type==='delivery'&&m.date===date){
            const item=kitchenItem(m.inventoryId);
            if(item)item.stock=n(item.stock)-n(m.quantity); // quantity es negativo: al restarlo, se repone
          } else kept.push(m);
        });
        state.inventory.movements=kept;
      }

      function monthDates(month){const [y,m]=month.split('-').map(Number),end=new Date(y,m,0).getDate();return Array.from({length:end},(_,i)=>`${month}-${String(i+1).padStart(2,'0')}`);}
      function renderPayroll(){ if(!canAccessPage('payroll')) return; if(!hasPremiumAccess()){ $('#payroll-page').innerHTML=pageHead('Sueldos','Cálculo de tarifas por driver.')+premiumLockHtml('Sueldos'); return; } const dates=monthDates(ui.month);let list=isDriverRole()?state.drivers.filter(d=>d.id===activeUser.driverId):state.drivers;const dayValues=d=>dates.map(date=>{const rec=day(date);return rec.processed?state.clients.filter(c=>effectiveDriverId(c,date)===d.id&&status(c,date)==='Activo').reduce((a,c)=>a+n(c.career||1),0):'';});const rows=d=>{const values=dayValues(d);const total=values.reduce((a,v)=>a+n(v),0);const rate=n(day(state.currentDate).rates[d.id]??4.5);const rateCell=canEditPage('payroll')?`<input class="rate-edit" type="number" min="0" step="0.01" data-id="${d.id}" value="${rate.toFixed(2)}">`:`${rate.toFixed(2)}`;return `<tr><td><b>${esc(d.firstName)} ${esc(d.lastName)}</b><br><small class="muted">${esc(routeName(d.routeId))}</small></td>${values.map(v=>`<td>${v===''?'—':v}</td>`).join('')}<td>${total}</td><td>${rateCell}</td><td>${(total*rate).toFixed(2)}</td></tr>`};
        const dayTotals=dates.map((date,i)=>list.reduce((sum,d)=>sum+n(dayValues(d)[i]),0));
        const grandTotal=dayTotals.reduce((a,v)=>a+v,0);
        const totalsRow=`<tfoot><tr class="table-totals"><td>Total (carreras/día)</td>${dayTotals.map(v=>`<td>${v||'—'}</td>`).join('')}<td>${grandTotal}</td><td>—</td><td>—</td></tr></tfoot>`;
        // Antes esta tabla tenía encabezados <th> escritos a mano, sin
        // colgroup ni el tirador de resize (.resize-handle) que usan el
        // resto de las tablas — por eso las columnas se amontonaban y no se
        // podían ajustar. Ahora usa el mismo th()/colgroupHtml() que
        // Clientes, Drivers, etc., con sus propios anchos guardados bajo el
        // grupo 'payroll' (una clave fija por día del mes: 'd1'…'d31', para
        // que el ancho no se resetee al cambiar de mes).
        const headers=[['Driver / Ruta','driver'],...dates.map((d,i)=>[String(Number(d.slice(-2))),`d${i+1}`]),['Total','total'],['Día tarifa','rate'],['Monto Bs','amount']];
        $('#payroll-page').innerHTML=pageHead('Sueldos','Tarifa del día: visible para administración y para el driver correspondiente.')+`<div class="toolbar"><label class="field">Mes<input id="payroll-month" type="month" value="${ui.month}"></label><span class="muted">La tarifa se guarda para el día de trabajo seleccionado: ${state.currentDate.split('-').reverse().join('/')}</span></div><div class="sheet table-responsive"><table class="table table-hover align-middle mb-0 payroll">${colgroupHtml(headers,'payroll')}<thead><tr>${headers.map(h=>th(h[0],h[1],'payroll')).join('')}</tr></thead><tbody>${list.length?list.map(rows).join(''):'<tr><td class="empty">No hay drivers.</td></tr>'}</tbody>${list.length?totalsRow:''}</table></div>`;$('#payroll-month').onchange=e=>{ui.month=e.target.value;renderPayroll();};$$('.rate-edit').forEach(i=>i.onchange=()=>{day().rates[i.dataset.id]=n(i.value);save();renderPayroll();});}

      function renderUsers(){if(!canAccessPage('users'))return;
        const rows=u=>`<tr><td><b>${esc(u.username)}</b></td><td>${esc(u.name)}</td><td>${esc(u.email||'—')}</td><td>${badge(roleLabel(u.role))}</td><td>${u.role==='driver'?esc(routeName(u.routeId)):'—'}</td><td><button class="icon-btn" data-action="edit-user" data-id="${u.id}">Editar</button>${u.id!==activeUser.id?`<button class="icon-btn delete" data-action="delete-user" data-id="${u.id}">×</button>`:''}</td></tr>`;
        const roleSummary=r=>ROLE_PAGE_OPTIONS.filter(([key])=>r.pages?.[key]?.view).map(([key,label,editable])=>editable&&r.pages[key].edit?`${label} (editar)`:label).join(', ')||'Sin páginas asignadas';
        const roleRows=r=>{const inUse=staffUsers.filter(u=>u.role===r.id).length;return `<tr><td><b>${esc(r.label)}</b>${inUse?` <small class="muted">(${inUse} usuario${inUse===1?'':'s'})</small>`:''}</td><td>${esc(roleSummary(r))}</td><td><button class="icon-btn" data-action="edit-role" data-id="${r.id}">Editar</button><button class="icon-btn delete" data-action="delete-role" data-id="${r.id}">×</button></td></tr>`;};
        $('#users-page').innerHTML=pageHead('Usuarios y permisos','Esta es una base independiente de clientes y operaciones. Roles fijos: Administrador, Editor, Cocina y Driver. También se pueden crear roles a medida.', '<button class="outline" data-action="add-role">+ Crear rol</button><button class="primary" data-action="add-user">+ Crear usuario</button>')
          +table(staffUsers,[['Usuario','username'],['Nombre','name'],['Correo','email'],['Rol','role'],['Ruta asignada','route'],['Acciones','id']],rows,'users')
          +pageHead('Roles personalizados','Qué páginas puede ver y editar cada rol creado a medida. Administrador, Editor, Cocina y Driver son fijos y no aparecen aquí.')
          +`<div class="sheet table-responsive"><table class="table table-hover align-middle mb-0"><thead><tr><th>Rol</th><th>Permisos</th><th>Acciones</th></tr></thead><tbody>${(state.settings.customRoles||[]).length?state.settings.customRoles.map(roleRows).join(''):'<tr><td colspan="3" class="empty">No hay roles personalizados todavía.</td></tr>'}</tbody></table></div>`;
      }
      let auditEntries=null;
      async function renderAudit(forceRefresh){
        if(!canAccessPage('audit')) return;
        if(!hasPremiumAccess()){ $('#audit-page').innerHTML=pageHead('Auditoría','Historial de cambios.')+premiumLockHtml('Auditoría'); return; }
        const actions='<button class="outline" data-action="refresh-audit">🔄 Actualizar</button>';
        if(forceRefresh||auditEntries===null){
          $('#audit-page').innerHTML=pageHead('Auditoría','Historial de cambios: quién hizo qué y cuándo. Muestra los últimos 300 eventos.',actions)+'<p class="muted">Cargando historial…</p>';
          const rows=await window.SupabaseDB?.dbGetAuditLog(300);
          auditEntries=rows||[];
          if(!rows){ $('#audit-page').innerHTML=pageHead('Auditoría','Historial de cambios: quién hizo qué y cuándo.',actions)+'<p class="muted">No se pudo cargar el historial. Verifica que la tabla db_audit_log exista (corre supabase-audit-log-migration.sql) y vuelve a intentar.</p>'; return; }
        }
        const q=(ui.search.audit||'').toLowerCase();
        let list=auditEntries.filter(e=>!q||[e.actor_name,e.actor_role,e.action,e.entity_type,e.entity_label].join(' ').toLowerCase().includes(q));
        list=sort(list,'at','audit');
        const rows=e=>`<tr><td>${new Date(e.at).toLocaleString('es-BO',{dateStyle:'short',timeStyle:'short'})}</td><td>${esc(e.actor_name||'—')}<br><small class="muted">${esc(roleLabel(e.actor_role))}</small></td><td>${esc(e.action)}</td><td>${esc(e.entity_label||e.entity_type||'—')}</td><td>${Object.keys(e.details||{}).length?esc(Object.entries(e.details).map(([k,v])=>`${k}: ${v}`).join(' · ')):'—'}</td></tr>`;
        $('#audit-page').innerHTML=pageHead('Auditoría','Historial de cambios: quién hizo qué y cuándo. Muestra los últimos 300 eventos.',actions)+`<div class="toolbar"><input id="audit-search" class="search" placeholder="Buscar por persona, acción o registro…" value="${esc(ui.search.audit||'')}"><span class="spacer"></span><span class="muted">${list.length} eventos</span></div>`+table(list,[['Fecha','at'],['Quién','actor_name'],['Acción','action'],['Registro','entity_label'],['Detalle','details']],rows,'audit');
        bindSearch('audit-search','audit',renderAudit);
      }
      function userForm(u={}){const d=u.driverId?driver(u.driverId):{};const showDriver=u.role==='driver';return `<div class="form-grid"><label>Nombre de usuario *<input name="username" required value="${esc(u.username)}"></label><label>Correo *<input type="email" name="email" required value="${esc(u.email)}"></label><label>${u.id?'Nueva contraseña':'Contraseña *'}<input type="password" name="password" ${u.id?'':'required'} autocomplete="new-password"></label><label>${u.id?'Confirmar nueva contraseña':'Confirmar contraseña *'}<input type="password" name="passwordConfirm" ${u.id?'':'required'} autocomplete="new-password"></label><label>Rol<select name="role" id="user-role-select">${isSuperAdmin()?`<option value="superadmin" ${u.role==='superadmin'?'selected':''}>Super Administrador</option>`:''}<option value="admin" ${u.role==='admin'?'selected':''}>Administrador</option><option value="editor" ${u.role==='editor'?'selected':''}>Editor</option><option value="kitchen" ${u.role==='kitchen'?'selected':''}>Cocina</option><option value="driver" ${(!u.role||u.role==='driver')?'selected':''}>Driver</option>${(state.settings.customRoles||[]).map(r=>`<option value="${r.id}" ${u.role===r.id?'selected':''}>${esc(r.label)}</option>`).join('')}</select>${isSuperAdmin()?'<p class="muted" style="margin-top:4px">Solo puede haber un Super Administrador.</p>':''}</label><label>Nombre completo *<input name="name" required value="${esc(u.name)}"></label><label class="driver-field" ${showDriver?'':'hidden'}>Carnet${showDriver?' *':''}<input name="carnet" value="${esc(d.carnet)}" ${showDriver?'required':''}></label><label class="driver-field" ${showDriver?'':'hidden'}>Teléfono<input name="phone" value="${esc(d.phone)}"></label><label class="driver-field" ${showDriver?'':'hidden'}>Ruta asignada<select name="routeId">${options(state.routes,u.routeId,'Ruta abierta')}</select></label><label class="driver-field wide" ${showDriver?'':'hidden'}>Dirección de domicilio<input name="address" value="${esc(d.address)}"></label><p class="muted wide driver-field-hint" ${showDriver?'hidden':''}>Solo el rol Driver necesita ficha de driver y ruta asignada.</p></div>`;}
      function roleForm(r={}){
        const pages=r.pages||{};
        return `<div class="form-grid"><label class="wide">Nombre del rol *<input name="label" required value="${esc(r.label)}" placeholder="Ej.: Supervisor de zona"></label>
          <div class="wide"><table class="table table-sm align-middle mb-0"><thead><tr><th>Página</th><th>Ver</th><th>Editar</th></tr></thead><tbody>
          ${ROLE_PAGE_OPTIONS.map(([key,label,editable])=>`<tr><td>${esc(label)}</td><td><input type="checkbox" name="view_${key}" ${pages[key]?.view?'checked':''}></td><td>${editable?`<input type="checkbox" name="edit_${key}" ${pages[key]?.edit?'checked':''}>`:'—'}</td></tr>`).join('')}
          </tbody></table></div></div>`;
      }
      function openRole(id){
        const isNew=!id;
        const current=isNew?null:customRole(id);
        showModal(current?'Editar rol':'Crear rol',roleForm(current||{}),async f=>{
          const label=f.elements.label.value.trim();
          if(!label){notice('El nombre del rol no puede estar vacío.',true);return false;}
          const pages={};
          ROLE_PAGE_OPTIONS.forEach(([key,,editable])=>{
            const view=!!f.elements[`view_${key}`]?.checked;
            const edit=editable?(view&&!!f.elements[`edit_${key}`]?.checked):false;
            pages[key]={view,edit};
          });
          if(current){ current.label=label; current.pages=pages; }
          else { state.settings.customRoles.push({id:uid('role'),label,pages}); }
          const saved=await save();
          if(!saved)return false;
          renderUsers();
          notice(isNew?'Rol creado.':'Rol actualizado.');
          logAudit(isNew?'Rol creado':'Rol editado','role',label,current?.id||'',{});
        });
      }
      async function deleteRole(id){
        const current=customRole(id);
        if(!current)return;
        const inUse=staffUsers.filter(u=>u.role===id);
        if(inUse.length){notice(`No se puede eliminar: ${inUse.length} usuario(s) todavía tienen el rol "${current.label}". Cámbiales el rol primero.`,true);return;}
        if(!confirm(`¿Eliminar el rol "${current.label}"?`))return;
        state.settings.customRoles=state.settings.customRoles.filter(x=>x.id!==id);
        const saved=await save();
        renderUsers();
        notice(saved?'Rol eliminado.':'Se eliminó localmente, pero no se guardó en la base de datos.',!saved);
        if(saved) logAudit('Rol eliminado','role',current.label,id,{});
      }
      function bindUserFormRoleToggle(){
        const select=$('#user-role-select'); if(!select) return;
        select.onchange=()=>{
          const showDriver=select.value==='driver';
          $$('.driver-field').forEach(el=>el.hidden=!showDriver);
          const hint=$('.driver-field-hint'); if(hint) hint.hidden=showDriver;
          const carnet=$('.driver-field input[name="carnet"]'); if(carnet) carnet.required=showDriver;
        };
      }
      function openUser(id){let u=id?staffUsers.find(x=>x.id===id):null;const isNewUser=!u;showModal(u?'Editar usuario':'Crear usuario',userForm(u||{}),async f=>{
        const data=Object.fromEntries(new FormData(f));
        if(staffUsers.some(x=>x.username===data.username&&x.id!==u?.id)){notice('Ese usuario ya existe.',true);return false;}
        if(staffUsers.some(x=>x.email.toLowerCase()===data.email.toLowerCase()&&x.id!==u?.id)){notice('Ese correo ya está registrado.',true);return false;}
        if(data.role==='superadmin'){
          if(!isSuperAdmin()){notice('Solo el Super Administrador puede asignar ese rol.',true);return false;}
          if(staffUsers.some(x=>x.role==='superadmin'&&x.id!==u?.id)){notice('Ya existe un Super Administrador. Solo puede haber uno.',true);return false;}
        }
        if(u?.role==='superadmin'&&data.role!=='superadmin'&&!isSuperAdmin()){notice('Solo el propio Super Administrador puede quitarse ese rol.',true);return false;}
        if(data.password&&data.password!==data.passwordConfirm){notice('La contraseña y su confirmación no coinciden.',true);return false;}
        let passwordHash=u?.passwordHash||'';
        if(data.password){
          passwordHash=await window.SupabaseDB?.rpc('hash_password',{p_password:data.password});
          if(!passwordHash){notice('No se pudo generar la contraseña de forma segura. Intenta nuevamente.',true);return false;}
        } else if(!u){
          notice('La contraseña es obligatoria para un usuario nuevo.',true);return false;
        }
        let driverId=u?.driverId;
        if(data.role==='driver'){
          let d=driver(driverId);const parts=data.name.trim().split(/\s+/);
          const driverData={firstName:parts.shift()||data.name,lastName:parts.join(' ')||'',carnet:data.carnet,phone:data.phone,address:data.address,routeId:data.routeId};
          if(d)Object.assign(d,driverData);else{d={id:uid('d'),...driverData};state.drivers.push(d);}
          driverId=d.id;
        }
        const userData={username:data.username,email:data.email,passwordHash,name:data.name,role:data.role,routeId:data.role==='driver'?data.routeId:'',driverId:data.role==='driver'?driverId:''};
        if(u){Object.assign(u,userData);delete u.password;}else{u={id:uid('u'),...userData};staffUsers.push(u);}
        const saved=await save();if(!saved)return false;
        renderUsers();
        notice(data.role==='driver'?'Usuario, acceso y ficha de driver guardados en la base de datos.':'Usuario guardado en la base de datos.');
        logAudit(isNewUser?'Usuario creado':'Usuario editado','user',`${u.name} (${u.username})`,u.id,{rol:u.role});
      });bindUserFormRoleToggle();}
      function renderSettings(){
        if(!canAccessPage('settings')) return;
        const dispatchColumns=[['order','Orden'],['name','Cliente'],['route','Ruta'],['driver','Driver'],['plan','Plan'],...menuItems(),['address1','Dirección'],['maps','Google Maps'],['phone1','Teléfono 1'],['phone2','Teléfono 2'],['notes','Observaciones'],['specialDiet','Dieta especial'],['career','Carreras / entrega'],['bags','Bolsas'],['status','Estado'],['remaining','Servicios restantes'],['returnDate','Fecha de retorno'],['id','Acciones']];
        const logo=state.settings.logoUrl;
        const columnsCard=`<div class="card card-pad stack">
            <h3>Tu tema</h3>
            <p class="muted">Solo afecta a tu navegador, no a los demás usuarios.</p>
            <label>Tema<select id="my-theme"><option value="light" ${userTheme()==='light'?'selected':''}>Claro</option><option value="night" ${userTheme()==='night'?'selected':''}>Nocturno</option><option value="forest" ${userTheme()==='forest'?'selected':''}>Bosque</option></select></label>
            <h3 style="margin-top:10px">Columnas visibles</h3>
            <p class="muted">Afecta a la tabla de Día de trabajo. Es personal: no se comparte con otros usuarios. Allí también puedes arrastrar los encabezados para cambiar su orden.</p>
            <div class="toggle-list">${dispatchColumns.map(([key,label])=>`<label><input type="checkbox" data-column="${key}" ${!userColPrefs().hiddenColumns.includes(key)?'checked':''}>${label}</label>`).join('')}</div>
          </div>`;
        if(!isAdmin()){
          $('#settings-page').innerHTML=pageHead('Configuración','Elige tu tema y qué columnas ver en la tabla de Día de trabajo.')+`<div class="two-col">${columnsCard}</div>`;
          $('#my-theme').onchange=e=>{saveUserTheme(e.target.value);render();};
          $$('[data-column]').forEach(input=>input.onchange=()=>{const key=input.dataset.column,hidden=userColPrefs().hiddenColumns;saveHiddenColumns(input.checked?hidden.filter(x=>x!==key):[...hidden,key]);notice('Columnas actualizadas.');});
          return;
        }
        $('#settings-page').innerHTML=pageHead('Configuración','Preferencias visuales, columnas y respaldo de datos.')+`<div class="two-col">
          ${columnsCard}
          <div class="card card-pad stack">
            <h3>Empresa</h3>
            <label>Nombre de la empresa<input id="company-name" value="${esc(state.settings.companyName||APP_CONFIG.companyName)}" placeholder="${esc(APP_CONFIG.companyName)}"></label>
            <label>Logo
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:52px;height:52px;border-radius:10px;overflow:hidden;border:1px solid var(--line);display:grid;place-items:center;background:var(--bg)">${logo?`<img loading="lazy" decoding="async" src="${logo}" alt="Logo" style="width:100%;height:100%;object-fit:contain">`:'🍽'}</div>
                <input type="file" id="logo-file" accept="image/*">
                ${logo?'<button type="button" class="outline" data-action="remove-logo">Quitar logo</button>':''}
              </div>
            </label>
            <label>Número de WhatsApp<input id="whatsapp-number" value="${esc(state.settings.whatsappNumber)}" placeholder="${esc(APP_CONFIG.whatsappNumber||'Ej: 59171234567')}"></label>
            <p class="muted" style="margin-top:-6px">Solo números, con código de país, sin espacios ni signos. Se usa en los botones de contacto del portal del cliente.</p>
            <label>Link de Instagram<input id="instagram-url" value="${esc(state.settings.instagramUrl)}" placeholder="${esc(APP_CONFIG.instagramUrl||'https://instagram.com/tu_empresa')}"></label>
            <label>Usuario de Instagram (@handle)<input id="instagram-handle" value="${esc(state.settings.instagramHandle)}" placeholder="${esc(APP_CONFIG.instagramHandle||'@tu_empresa')}"></label>
          </div>
          <div class="card card-pad stack">
            <h3>Publicidad del portal de clientes</h3>
            <p class="muted">Esta imagen se muestra a todos los clientes en su portal, justo antes de "Tu plan actual". Ideal para promociones o novedades.</p>
            <label>Imagen publicitaria
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:88px;height:52px;border-radius:10px;overflow:hidden;border:1px solid var(--line);display:grid;place-items:center;background:var(--bg)">${state.settings.adImageUrl?`<img loading="lazy" decoding="async" src="${state.settings.adImageUrl}" alt="Publicidad" style="width:100%;height:100%;object-fit:cover">`:'📣'}</div>
                <input type="file" id="ad-image-file" accept="image/*">
                ${state.settings.adImageUrl?'<button type="button" class="outline" data-action="remove-ad-image">Quitar imagen</button>':''}
              </div>
            </label>
            <h3 style="margin-top:10px">Aviso de renovación</h3>
            <p class="muted">Cuando a un cliente le queden estos días o menos, verá un cartel rojo invitándolo a renovar su plan.</p>
            <label>Días restantes para mostrar el aviso<input id="renewal-warning-days" type="number" min="0" max="30" value="${n(state.settings.renewalWarningDays)}"></label>
          </div>
          <div class="card card-pad stack">
            <h3>Datos</h3>
            <p class="muted">Clientes, operaciones y usuarios del equipo se sincronizan con la base de datos en cada guardado.</p>
            <p class="muted">Los días laborables/no laborables se administran directamente desde Día de trabajo.</p>
            <label>Exportar
              <select id="export-scope">
                <option value="all">Todo (respaldo completo)</option>
                <option value="clientes">Solo Clientes (clientes, planes, días)</option>
                <option value="personal">Solo Personal (drivers, rutas, usuarios)</option>
                <option value="inventario">Solo Inventario</option>
              </select>
            </label>
            <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="outline" data-action="export-json">Exportar JSON</button><button class="outline" data-action="import-json">Importar JSON</button></div>
          </div>
          ${isSuperAdmin()?`<div class="card card-pad stack">
            <h3>Plan de la cuenta</h3>
            <p class="muted">Solo tú, como Super Administrador, puedes cambiar esto. En plan Básico, Sueldos, Inventario, Auditoría, Horario semanal, Imprimir dietas especiales, el Portal de clientes y la reactivación automática por fecha de retorno quedan bloqueados para el resto del equipo.</p>
            <p class="muted">El vencimiento se calcula contra la fecha del servidor de Supabase, no contra el reloj de esta PC o celular — así nadie lo altera cambiando la fecha del dispositivo. Necesita la función <code>get_server_date</code> creada en Supabase (ver instrucciones del desarrollador).</p>
            <p>Plan actual: <b>${isPremium()?'Premium':'Básico'}</b>${isPremium()&&state.settings.premiumUntil?` · vence el ${state.settings.premiumUntil.split('-').reverse().join('/')} (${Math.max(0,Math.ceil((new Date(state.settings.premiumUntil)-new Date(cachedServerDate))/86400000))} días restantes)`:''}${isPremium()&&!state.settings.premiumUntil?' · sin vencimiento':''}</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
              <label class="field" style="width:150px">Días de Premium<input type="number" id="premium-days" min="1" placeholder="Ej: 30"></label>
              <button type="button" class="primary" id="activate-premium-days-btn">Activar por esos días</button>
              <button type="button" class="outline" id="activate-premium-btn" ${isPremium()&&!state.settings.premiumUntil?'disabled':''}>Activar sin vencimiento</button>
              <button type="button" class="outline" id="activate-basic-btn" ${!isPremium()?'disabled':''}>Volver a Básico ahora</button>
            </div>
            <h3 style="margin-top:10px">WhatsApp para upgrade a Premium</h3>
            <p class="muted">Este es TU número (el proveedor de Catering Control), no el de la empresa. Es el que ve el equipo y los clientes cuando tocan "Contactar por WhatsApp" para pasar a Premium — el número de la empresa de arriba se usa para todo lo demás (soporte a sus clientes).</p>
            <label>Tu WhatsApp<input id="premium-whatsapp" value="${esc(state.settings.premiumWhatsapp)}" placeholder="Ej: 59171234567"></label>
          </div>`:''}
        </div>`;
        $('#my-theme').onchange=e=>{saveUserTheme(e.target.value);render();};
        $$('[data-column]').forEach(input=>input.onchange=()=>{const key=input.dataset.column,hidden=userColPrefs().hiddenColumns;saveHiddenColumns(input.checked?hidden.filter(x=>x!==key):[...hidden,key]);notice('Columnas actualizadas.');});
        $('#company-name').onchange=async e=>{state.settings.companyName=e.target.value.trim();const saved=await save();applyBranding();notice(saved?'Nombre de la empresa actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);};
        $('#logo-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{state.settings.logoUrl=await readImageAsDataURL(file,240,.85);const saved=await save();applyBranding();renderSettings();notice(saved?'Logo actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);}catch(_){notice('No se pudo procesar la imagen.',true);}};
        $('#whatsapp-number').onchange=async e=>{state.settings.whatsappNumber=e.target.value.trim().replace(/[^\d]/g,'');e.target.value=state.settings.whatsappNumber;const saved=await save();notice(saved?'Número de WhatsApp actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);};
        $('#instagram-url').onchange=async e=>{state.settings.instagramUrl=e.target.value.trim();const saved=await save();notice(saved?'Link de Instagram actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);};
        $('#instagram-handle').onchange=async e=>{state.settings.instagramHandle=e.target.value.trim();const saved=await save();notice(saved?'Usuario de Instagram actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);};
        $('#ad-image-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{state.settings.adImageUrl=await readImageAsDataURL(file,960,.85);const saved=await save();renderSettings();notice(saved?'Imagen publicitaria actualizada.':'Se guardó localmente, pero no en la base de datos.',!saved);}catch(_){notice('No se pudo procesar la imagen.',true);}};
        $('#renewal-warning-days').onchange=async e=>{state.settings.renewalWarningDays=Math.max(0,n(e.target.value));e.target.value=state.settings.renewalWarningDays;const saved=await save();notice(saved?'Aviso de renovación actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);};
        $('#activate-premium-btn')?.addEventListener('click',async()=>{if(!isSuperAdmin())return;state.settings.plan='premium';state.settings.premiumUntil='';const saved=await save();renderSettings();notice(saved?'Plan Premium activado sin vencimiento.':'Se activó localmente, pero no se guardó en la base de datos.',!saved);if(saved)logAudit('Plan cambiado a Premium (sin vencimiento)','settings','Plan de la cuenta','',{});});
        $('#activate-premium-days-btn')?.addEventListener('click',async()=>{if(!isSuperAdmin())return;const days=n($('#premium-days').value);if(days<=0){notice('Ingresa una cantidad de días válida.',true);return;}const base=await serverToday();const until=new Date(base+'T00:00:00Z');until.setUTCDate(until.getUTCDate()+days);const untilStr=until.toISOString().slice(0,10);state.settings.plan='premium';state.settings.premiumUntil=untilStr;const saved=await save();renderSettings();notice(saved?`Plan Premium activado por ${days} días (vence el ${untilStr.split('-').reverse().join('/')}).`:'Se activó localmente, pero no se guardó en la base de datos.',!saved);if(saved)logAudit(`Plan cambiado a Premium por ${days} días`,'settings','Plan de la cuenta','',{premiumUntil:untilStr});});
        $('#activate-basic-btn')?.addEventListener('click',async()=>{if(!isSuperAdmin())return;if(!confirm('¿Volver al plan Básico? El equipo perderá acceso a las funciones Premium.'))return;state.settings.plan='basico';state.settings.premiumUntil='';const saved=await save();renderSettings();notice(saved?'Plan Básico activado.':'Se cambió localmente, pero no se guardó en la base de datos.',!saved);if(saved)logAudit('Plan cambiado a Básico','settings','Plan de la cuenta','',{});});
        $('#premium-whatsapp')?.addEventListener('change',async e=>{if(!isSuperAdmin())return;state.settings.premiumWhatsapp=e.target.value.trim().replace(/[^\d]/g,'');e.target.value=state.settings.premiumWhatsapp;const saved=await save();notice(saved?'Tu WhatsApp de upgrade actualizado.':'Se guardó localmente, pero no en la base de datos.',!saved);});
      }
      function showModal(title,html,submit){$('#modal-title').textContent=title;$('#modal-body').innerHTML=html;const dialog=$('#modal'),form=$('#modal-form'),saveButton=$('#modal-save');form.onsubmit=async e=>{e.preventDefault();saveButton.disabled=true;try{if(await submit(form)!==false)dialog.close();}finally{saveButton.disabled=false;}};dialog.showModal();}
      async function remove(kind,id){const labels={client:'cliente',driver:'driver',route:'ruta',user:'usuario',plan:'plan'};if(!confirm(`¿Eliminar este ${labels[kind]}?`))return;if(kind==='user'){if(id===activeUser.id){notice('No puedes eliminar tu usuario actual.',true);return;}const u=staffUsers.find(x=>x.id===id);if(u?.role==='superadmin'&&!isSuperAdmin()){notice('No puedes eliminar al Super Administrador.',true);return;}staffUsers=staffUsers.filter(x=>x.id!==id);const saved=await save();renderUsers();notice(saved?'Usuario eliminado de la base de datos.':'El usuario solo se eliminó de esta copia local.',!saved);if(saved)logAudit('Usuario eliminado','user',u?`${u.name} (${u.username})`:id,id,{});return;}if(kind==='plan'){if(state.clients.some(c=>c.planId===id)){notice('No se puede eliminar un plan asignado a clientes. Reasígnalos primero.',true);return;}const p=plan(id);state.plans=state.plans.filter(x=>x.id!==id);const saved=await save();renderPlans();notice(saved?'Plan eliminado de la base de datos.':'El plan solo se eliminó de esta copia local.',!saved);if(saved)logAudit('Plan eliminado','plan',p?.name||id,id,{});return;}const map={client:'clients',driver:'drivers',route:'routes'};if(kind==='route'&&(state.clients.some(c=>c.routeId===id)||state.drivers.some(d=>d.routeId===id))){notice('No se puede eliminar una ruta asignada.',true);return;}const before=state[map[kind]].find(x=>x.id===id);const label=kind==='client'?before?.name:kind==='driver'?`${before?.firstName||''} ${before?.lastName||''}`.trim():before?.name;state[map[kind]]=state[map[kind]].filter(x=>x.id!==id);const saved=await save();renderPage(ui.page);notice(saved?'Registro eliminado de la base de datos.':'El registro solo se eliminó de esta copia local.',!saved);if(saved)logAudit(`${labels[kind][0].toUpperCase()}${labels[kind].slice(1)} eliminado`,kind,label||id,id,{});}

      async function exportProcessedDaySnapshot(date,clientIds){
        const activeClients=clientIds?state.clients.filter(c=>clientIds.includes(c.id)):state.clients.filter(c=>status(c,date)==='Activo');
        const menuCols=menuItems();
        const clientRow=c=>{
          const pitems=c.items||plan(c.planId)?.items||{};
          const row={nombre:c.name, bolsas:n(c.bags)};
          menuCols.forEach(([key])=>{row[key]=n(pitems[key]);});
          row.restantes=n(c.paidDays)?Math.max(0,n(c.paidDays)-n(c.consumedDays)):0;
          row.carreras=n(c.career||1);
          return row;
        };
        const NUMERIC_KEYS=['bolsas',...menuCols.map(([key])=>key),'restantes','carreras'];
 
        const groupsById=new Map();
        activeClients.forEach(c=>{
          const rid=effectiveRouteId(c,date)||'__none__';
          if(!groupsById.has(rid))groupsById.set(rid,{name:rid==='__none__'?'Sin ruta':routeName(rid),clients:[]});
          groupsById.get(rid).clients.push(c);
        });
        const orderedIds=[...state.routes.map(r=>r.id),'__none__'].filter(id=>groupsById.has(id));
        const routeGroups=orderedIds.map(id=>groupsById.get(id));
        routeGroups.forEach(group=>{ group.clients.sort((a,b)=>(n(a.order)||9999)-(n(b.order)||9999)); });
        const movimientosDelDia=state.inventory.movements.filter(m=>m.date===date&&m.type==='delivery').map(m=>({
          producto:kitchenItem(m.inventoryId)?.name||m.inventoryId,
          cantidadDescontada:-n(m.quantity),
          unidad:kitchenItem(m.inventoryId)?.unit||'',
          nota:m.note||''
        }));
        const tarifas=Object.entries(day(date).rates||{}).map(([driverId,rate])=>({driver:driverName(driverId),tarifa:n(rate)}));

        if(!await ensureExcelJS()){ notice('Día procesado, pero no se pudo generar el Excel: la librería ExcelJS no cargó (revisa la conexión a jsdelivr).',true); return; }
        const wb=new ExcelJS.Workbook();
        wb.creator=state.settings.companyName||APP_CONFIG.companyName;
        const thinLine={style:'thin',color:{argb:'FFD9DEE7'}};
        const ws=wb.addWorksheet('Clientes atendidos',{views:[{state:'frozen',ySplit:1}]});
        ws.columns=[
          {header:'Nombre',key:'nombre',width:26},{header:'Ruta',key:'ruta',width:16},
          {header:'Bolsas',key:'bolsas',width:9},
          ...menuCols.map(([key,label])=>({header:label,key,width:11})),
          {header:'Servicios restantes',key:'restantes',width:17},
          {header:'Carreras',key:'carreras',width:11}
        ];
        const CARRERAS_COL=ws.columns.length; 
        const CARRERAS_FILL={argb:'FFFFC857'}; 
        ws.getRow(1).eachCell((cell,colNumber)=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colNumber===CARRERAS_COL?'FFB8860B':'FF0D6EFD'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});
        const sumField=(clients,key)=>clients.reduce((a,c)=>a+clientRow(c)[key],0);
        const styleDataRow=(row,i)=>row.eachCell((cell,colNumber)=>{cell.fill={type:'pattern',pattern:'solid',fgColor:colNumber===CARRERAS_COL?CARRERAS_FILL.argb:{argb:i%2===0?'FFF3F6FB':'FFFFFFFF'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};cell.alignment={vertical:'top'};});
        const styleTotalRow=(row,argb)=>row.eachCell((cell,colNumber)=>{cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:colNumber===CARRERAS_COL?'FFB8860B':argb}};if(colNumber===CARRERAS_COL)cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});
        routeGroups.forEach(group=>{
          group.clients.forEach((c,i)=>{const row=ws.addRow({...clientRow(c),ruta:group.name});styleDataRow(row,i);});
          const totalRow=ws.addRow({nombre:`Total ${group.name}`,ruta:'',...Object.fromEntries(NUMERIC_KEYS.map(k=>[k,sumField(group.clients,k)]))});
          styleTotalRow(totalRow,'FFE3E7EE');
        });
        const grandTotalRow=ws.addRow({nombre:'TOTAL GENERAL',ruta:'',...Object.fromEntries(NUMERIC_KEYS.map(k=>[k,sumField(activeClients,k)]))});
        styleTotalRow(grandTotalRow,'FF0D6EFD');
        grandTotalRow.eachCell((cell,colNumber)=>{if(colNumber!==CARRERAS_COL)cell.font={bold:true,color:{argb:'FFFFFFFF'}};});
        if(movimientosDelDia.length){
          const ws2=wb.addWorksheet('Inventario descontado',{views:[{state:'frozen',ySplit:1}]});
          ws2.columns=[{header:'Producto',key:'producto',width:28},{header:'Cantidad descontada',key:'cantidadDescontada',width:20},{header:'Unidad',key:'unidad',width:14},{header:'Nota',key:'nota',width:36}];
          ws2.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF15A77F'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});
          movimientosDelDia.forEach((m,i)=>{const row=ws2.addRow(m);row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2===0?'FFF0FBF4':'FFFFFFFF'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});});
        }
        if(tarifas.length){
          const ws3=wb.addWorksheet('Tarifas',{views:[{state:'frozen',ySplit:1}]});
          ws3.columns=[{header:'Driver',key:'driver',width:28},{header:'Tarifa (Bs)',key:'tarifa',width:16}];
          ws3.getRow(1).eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB8860B'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});
          tarifas.forEach((t,i)=>{const row=ws3.addRow(t);row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:i%2===0?'FFFBF6EC':'FFFFFFFF'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});});
        }
        const buffer=await wb.xlsx.writeBuffer();
        const aXlsx=document.createElement('a');
        aXlsx.href=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
        aXlsx.download=`dia-procesado-${date}.xlsx`; aXlsx.click();
        setTimeout(()=>URL.revokeObjectURL(aXlsx.href),1000);
      }
      function processDay(){
        if(!canEditPage('dispatch')){notice('No tienes permiso para procesar el día.',true);return;}
        const d=day();
        if(!d.laborable){notice('Un día no laborable no procesa pedidos ni descuenta inventario.',true);return;}
        if(d.processed){notice('Este día ya fue procesado.',true);return;}
        if(!confirm(`¿Procesar el día ${state.currentDate.split('-').reverse().join('/')}?`))return;
        // Se captura la lista de clientes activos ANTES de sumarles el día
        // consumido: si algún cliente llega justo a su último día pagado, su
        // estado cambia a "Retorno pendiente" en el mismo instante, y si más
        // adelante volviéramos a calcular quién estaba "Activo" (en la
        // constancia o al desprocesar) ese cliente ya no aparecería, pese a
        // haber sido atendido este día.
        const activeClients=state.clients.filter(c=>status(c)==='Activo');
        const processedIds=activeClients.map(c=>c.id);
        activeClients.forEach(c=>c.consumedDays=n(c.consumedDays)+1);
        applyInventoryForProcessedDay(state.currentDate);
        d.processed=true;d.processedClientIds=processedIds;save();renderDispatch();notice('Día procesado e inventario actualizado. Descargando constancia (Excel)…');
        logAudit('Día procesado','day',state.currentDate,state.currentDate,{clientesAtendidos:processedIds.length});
        exportProcessedDaySnapshot(state.currentDate,processedIds);
      }
      function unprocessDay(){
        if(!canEditPage('dispatch')){notice('No tienes permiso para desprocesar el día.',true);return;}
        const d=day();
        if(!d.processed){notice('Este día no está procesado.',true);return;}
        if(!confirm(`¿Desprocesar el día ${state.currentDate.split('-').reverse().join('/')}? Se revertirá el descuento de inventario y el conteo de días consumidos que se hicieron al procesarlo (puedes volver a procesarlo después).`))return;
        const ids=d.processedClientIds||state.clients.filter(c=>status(c)==='Activo').map(c=>c.id);
        state.clients.filter(c=>ids.includes(c.id)).forEach(c=>c.consumedDays=Math.max(0,n(c.consumedDays)-1));
        revertInventoryForProcessedDay(state.currentDate);
        d.processed=false;d.processedClientIds=[];save();renderDispatch();notice('Día desprocesado. El inventario y los días consumidos fueron restaurados.');
        logAudit('Día desprocesado','day',state.currentDate,state.currentDate,{});
      }
      function toggleDayPause(id){
        if(!canEditPage('dispatch')) return;
        const c=state.clients.find(x=>x.id===id); if(!c) return;
        c.pauseDates ||= [];
        const i=c.pauseDates.indexOf(state.currentDate);
        if(i>=0){ c.pauseDates.splice(i,1); notice('Pedido reanudado para este día.'); }
        else { c.pauseDates.push(state.currentDate); notice('Pedido pausado solo para este día.'); }
        save(); renderDispatch();
      }
      async function exportDiets(){
        if(isDriverRole()) return exportRouteOrder();
        if(!hasPremiumAccess()){ notice('Imprimir dietas especiales es una función Premium. Contacta a tu proveedor para activarla.',true); return; }
        const date=state.currentDate;
        const activeClients=state.clients.filter(c=>status(c,date)==='Activo');
        if(!await ensureExcelJS()){ notice('No se pudo cargar el generador de Excel. Revisa tu conexión e intenta de nuevo.',true); return; }
        if(!activeClients.length){ notice('No hay clientes activos para exportar hoy.',true); return; }
        const wb=new ExcelJS.Workbook();
        wb.creator=state.settings.companyName||APP_CONFIG.companyName;
        const ws=wb.addWorksheet('Dietas especiales',{views:[{state:'frozen',ySplit:1}]});
        ws.columns=[
          {header:'Ruta',key:'ruta',width:16},
          {header:'Cliente',key:'cliente',width:26},
          {header:'Plan',key:'plan',width:18},
          {header:'Artículos incluidos',key:'items',width:46},
          {header:'Observaciones / dieta especial',key:'notes',width:38}
        ];
        const thinLine={style:'thin',color:{argb:'FFD9DEE7'}};
        const headerRow=ws.getRow(1);
        headerRow.height=22;
        headerRow.eachCell(cell=>{
          cell.font={bold:true,color:{argb:'FFFFFFFF'},size:11};
          cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0D6EFD'}};
          cell.alignment={vertical:'middle',horizontal:'left'};
          cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};
        });
        const groupsById=new Map();
        activeClients.forEach(c=>{
          const rid=effectiveRouteId(c,date)||'__none__';
          if(!groupsById.has(rid))groupsById.set(rid,{name:rid==='__none__'?'Sin ruta':routeName(rid),clients:[]});
          groupsById.get(rid).clients.push(c);
        });
        const orderedIds=[...state.routes.map(r=>r.id),'__none__'].filter(id=>groupsById.has(id));
        const routeGroups=orderedIds.map(id=>groupsById.get(id));
        routeGroups.forEach(group=>{ group.clients.sort((a,b)=>(n(a.order)||9999)-(n(b.order)||9999)); });
        let rowIndex=0;
        routeGroups.forEach(group=>{
          group.clients.forEach(c=>{
            const pitems=c.items||plan(c.planId)?.items||{};
            const row=ws.addRow({
              ruta:group.name,
              cliente:c.name,
              plan:planName(c.planId),
              items:menuItems().filter(([k])=>n(pitems[k])>0).map(([k,l])=>`${l}: ${n(pitems[k])}`).join(' | ')||'—',
              notes:[c.notes,c.specialDiet].filter(Boolean).join(' — ')||'—'
            });
            const fillColor=rowIndex%2===0?'FFF3F6FB':'FFFFFFFF';
            row.eachCell(cell=>{
              cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fillColor}};
              cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};
              cell.alignment={vertical:'top',horizontal:'left',wrapText:true};
            });
            rowIndex++;
          });
          const totalRow=ws.addRow({ruta:'',cliente:`Total ${group.name}: ${group.clients.length} clientes`,plan:'',items:'',notes:''});
          totalRow.eachCell(cell=>{cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE3E7EE'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});
        });
        const grandTotalRow=ws.addRow({ruta:'',cliente:`TOTAL GENERAL: ${activeClients.length} clientes`,plan:'',items:'',notes:''});
        grandTotalRow.eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0D6EFD'}};cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};});
        const buffer=await wb.xlsx.writeBuffer();
        const a=document.createElement('a');
        a.href=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
        a.download=`dietas-especiales-${date}.xlsx`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
        notice('Archivo Excel generado.');
      }
      async function exportRouteOrder(){
        const date=state.currentDate;
        // Para un driver, su ruta siempre es la propia (activeUser.routeId).
        // Para admin/editor no hay una "ruta propia" — se usa la ruta
        // elegida en el filtro "Ruta" de Día de trabajo, para poder generar
        // el orden de cualquier ruta puntual.
        const routeId=isDriverRole()?activeUser.routeId:ui.route;
        if(!routeId){ notice('Selecciona una ruta en el filtro "Ruta" antes de imprimir el orden de ruta.',true); return; }
        const r=route(routeId);
        let activeClients=state.clients.filter(c=>effectiveRouteId(c,date)===routeId && status(c,date)==='Activo');
        activeClients=[...activeClients].sort((a,b)=>(n(a.order)||9999)-(n(b.order)||9999));
        if(!await ensureExcelJS()){ notice('No se pudo cargar el generador de Excel. Revisa tu conexión e intenta de nuevo.',true); return; }
        if(!activeClients.length){ notice('No hay clientes activos en esa ruta para exportar hoy.',true); return; }
        const wb=new ExcelJS.Workbook();
        wb.creator=state.settings.companyName||APP_CONFIG.companyName;
        const ws=wb.addWorksheet('Orden de ruta',{views:[{state:'frozen',ySplit:1}]});
        ws.columns=[
          {header:'Orden',key:'order',width:8},
          {header:'Cliente',key:'cliente',width:26},
          {header:'Dirección',key:'address',width:34},
          {header:'Teléfono',key:'phone',width:16},
          {header:'Google Maps',key:'maps',width:16},
          {header:'Bolsas',key:'bags',width:10},
          {header:'Carreras',key:'career',width:12},
          {header:'Observaciones',key:'notes',width:30}
        ];
        const thinLine={style:'thin',color:{argb:'FFD9DEE7'}};
        const headerRow=ws.getRow(1);
        headerRow.height=22;
        headerRow.eachCell(cell=>{
          cell.font={bold:true,color:{argb:'FFFFFFFF'},size:11};
          cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF198754'}};
          cell.alignment={vertical:'middle',horizontal:'left'};
          cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};
        });
        activeClients.forEach((c,i)=>{
          const mapsLink=effectiveMaps(c,date);
          const row=ws.addRow({
            order:n(c.order)||'',
            cliente:c.name,
            address:effectiveAddress(c,date)||'—',
            phone:[c.phone1,c.phone2].filter(Boolean).join(' / ')||'—',
            maps:mapsLink?'Abrir mapa':'—',
            bags:n(c.bags),
            career:n(c.career||1),
            notes:c.notes||'—'
          });
          if(mapsLink) row.getCell('maps').value={text:'Abrir mapa',hyperlink:mapsLink};
          const fillColor=i%2===0?'FFF0FBF4':'FFFFFFFF';
          row.eachCell(cell=>{
            cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:fillColor}};
            cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine};
            cell.alignment={vertical:'top',horizontal:'left',wrapText:true};
          });
          row.getCell('maps').font={color:{argb:'FF0D6EFD'},underline:true};
        });
        const totalRow=ws.addRow({order:'',cliente:`Total: ${activeClients.length} clientes`,address:'',phone:'',maps:'',bags:activeClients.reduce((a,c)=>a+n(c.bags),0),career:activeClients.reduce((a,c)=>a+n(c.career||1),0),notes:''});
        totalRow.eachCell(cell=>{ cell.font={bold:true}; cell.border={top:thinLine,left:thinLine,bottom:thinLine,right:thinLine}; });
        const buffer=await wb.xlsx.writeBuffer();
        const a=document.createElement('a');
        a.href=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
        a.download=`orden-de-ruta-${(r?.name||'ruta').toLowerCase().replace(/\s+/g,'-')}-${date}.xlsx`;
        a.click();
        setTimeout(()=>URL.revokeObjectURL(a.href),1000);
        notice('Archivo Excel generado.');
      }
      document.addEventListener('click',e=>{const action=e.target.closest('[data-action]')?.dataset.action,id=e.target.closest('[data-action]')?.dataset.id;if(!action)return;const map={"add-client":()=>openClient(),"pause-client":()=>openClientPause(id),"resume-client":()=>resumeClient(id),"edit-client":()=>openClient(id),"delete-client":()=>remove('client',id),"add-driver":()=>openDriver(),"edit-driver":()=>openDriver(id),"delete-driver":()=>remove('driver',id),"add-route":()=>openRoute(),"edit-route":()=>openRoute(id),"delete-route":()=>remove('route',id),"add-plan":()=>openPlan(),"edit-plan":()=>openPlan(id),"delete-plan":()=>remove('plan',id),"add-menu-item":()=>openMenuItem(),"edit-menu-item":()=>openMenuItem(id),"delete-menu-item":()=>deleteMenuItem(id),"open-item-icons":()=>openItemIcons(),"add-inventory-item":()=>openInventoryItem(),"edit-inventory-item":()=>openInventoryItem(id),"delete-inventory-item":()=>deleteInventoryItem(id),"add-inventory-entry":()=>openInventoryMovement('entry'),"add-inventory-use":()=>openInventoryMovement('use'),"add-inventory-waste":()=>openInventoryMovement('waste'),"edit-inventory-movement":()=>{const m=state.inventory.movements.find(x=>x.id===id);if(m)openInventoryMovement(m.type,id);},"delete-inventory-movement":()=>deleteInventoryMovement(id),"add-inventory-link":()=>openInventoryLink(),"edit-inventory-link":()=>openInventoryLink(id),"delete-inventory-link":()=>deleteInventoryLink(id),"add-user":()=>openUser(),"edit-user":()=>openUser(id),"delete-user":()=>remove('user',id),"add-role":()=>openRole(),"edit-role":()=>openRole(id),"delete-role":()=>deleteRole(id),"refresh-audit":()=>renderAudit(true),"process-day":processDay,"unprocess-day":unprocessDay,"toggle-day-pause":()=>toggleDayPause(id),"export-diets":exportDiets,"export-route-order":exportRouteOrder,"remove-logo":async()=>{state.settings.logoUrl='';const saved=await save();applyBranding();renderSettings();notice(saved?'Logo eliminado.':'Se quitó localmente, pero no se guardó en la base de datos.',!saved);},"remove-ad-image":async()=>{state.settings.adImageUrl='';const saved=await save();renderSettings();notice(saved?'Imagen publicitaria eliminada.':'Se quitó localmente, pero no se guardó en la base de datos.',!saved);},"remove-item-icon":async()=>{delete state.settings.itemIcons[id];const saved=await save();$('#modal-body').innerHTML=itemIconsForm();openItemIconsHandlers();notice(saved?'Ícono eliminado.':'Se quitó localmente, pero no se guardó en la base de datos.',!saved);},"export-json":()=>{const scope=$('#export-scope')?.value||'all';const scopes={all:{data:{...state,staffUsers},label:'respaldo-completo'},clientes:{data:{clients:state.clients,plans:state.plans,days:state.days,currentDate:state.currentDate},label:'clientes'},personal:{data:{drivers:state.drivers,routes:state.routes,settings:state.settings,staffUsers},label:'personal'},inventario:{data:{inventory:state.inventory},label:'inventario'}};const chosen=scopes[scope]||scopes.all;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(chosen.data,null,2)],{type:'application/json'}));a.download=`catering-${chosen.label}-${today()}.json`;a.click();},"import-json":()=>$('#import-file').click()};

        const ACTION_PERMS={
          "add-client":()=>canEditPage('clients'),"pause-client":()=>canEditPage('clients'),"resume-client":()=>canEditPage('clients'),"edit-client":()=>canEditPage('clients'),"delete-client":()=>canEditPage('clients'),
          "add-driver":()=>canEditPage('drivers'),"edit-driver":()=>canEditPage('drivers'),"delete-driver":()=>canEditPage('drivers'),
          "add-route":()=>canEditPage('routes'),"edit-route":()=>canEditPage('routes'),"delete-route":()=>canEditPage('routes'),
          "add-plan":()=>canEditPage('plans'),"edit-plan":()=>canEditPage('plans'),"delete-plan":()=>canEditPage('plans'),
          "add-menu-item":()=>canEditPage('plans'),"edit-menu-item":()=>canEditPage('plans'),"delete-menu-item":()=>canEditPage('plans'),
          "add-inventory-item":()=>canEditPage('inventory'),"edit-inventory-item":()=>canEditPage('inventory'),"delete-inventory-item":()=>canEditPage('inventory'),
          "add-inventory-entry":()=>canEditPage('inventory'),"add-inventory-use":()=>canEditPage('inventory'),"add-inventory-waste":()=>canEditPage('inventory'),
          "edit-inventory-movement":()=>canEditPage('inventory'),"delete-inventory-movement":()=>canEditPage('inventory'),
          "add-inventory-link":()=>canEditPage('inventory'),"edit-inventory-link":()=>canEditPage('inventory'),"delete-inventory-link":()=>canEditPage('inventory'),
          "add-user":isAdmin,"edit-user":isAdmin,"delete-user":isAdmin,"add-role":isAdmin,"edit-role":isAdmin,"delete-role":isAdmin,
          "process-day":()=>canEditPage('dispatch'),"unprocess-day":()=>canEditPage('dispatch'),"toggle-day-pause":()=>canEditPage('dispatch'),
          "remove-logo":isAdmin,"remove-ad-image":isAdmin,"remove-item-icon":isAdmin,"export-json":isAdmin,"import-json":isAdmin,"refresh-audit":()=>canAccessPage('audit')
        };
        if(ACTION_PERMS[action] && !ACTION_PERMS[action]()){ notice('No tienes permiso para hacer esto.',true); return; }
        map[action]?.();});
      document.addEventListener('click',e=>{if(e.target.closest('.resize-handle')||e.target.closest('.col-drag-handle'))return;const h=e.target.closest('th[data-sort]');if(!h)return;const g=h.dataset.group,k=h.dataset.sort,s=ui.sort[g]||{};ui.sort[g]={key:k,dir:s.key===k?-s.dir:1};renderPage(ui.page);});
      $('#nav').onclick=e=>{const b=e.target.closest('[data-page]');if(b)activate(b.dataset.page);};$('#menu-toggle').onclick=()=>$('#nav').classList.toggle('open');
      // Menú lateral retráctil (solo escritorio): guarda la preferencia por
      // navegador, igual que el tema, así queda como la dejó la última vez.
      (function initSidebarCollapse(){
        const btn=$('#sidebar-collapse-btn'); if(!btn) return;
        const apply=collapsed=>{ document.getElementById('app').classList.toggle('sidebar-collapsed',collapsed); btn.textContent=collapsed?'»':'«'; btn.title=collapsed?'Expandir menú':'Contraer menú'; };
        apply(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)==='1');
        btn.onclick=()=>{ const collapsed=!document.getElementById('app').classList.contains('sidebar-collapsed'); apply(collapsed); localStorage.setItem(SIDEBAR_COLLAPSED_KEY,collapsed?'1':'0'); };
      })();$('#modal-close').onclick=()=>$('#modal').close();$('#modal-cancel').onclick=()=>$('#modal').close();$('#logout-btn').onclick=async()=>{
        // save() sube los cambios a Supabase de forma asíncrona (no bloquea
        // la interfaz). Antes, "Salir" navegaba a login.html al toque, sin
        // esperar ese guardado — si alguien cambiaba el ancho de una columna
        // (o cualquier otra cosa) y le daba a Salir enseguida, la navegación
        // podía cortar el guardado a mitad de camino: quedaba bien en este
        // navegador (localStorage) pero nunca llegaba a subirse a Supabase.
        // Al volver a entrar, se bajaba la versión vieja del servidor y
        // pisaba el cambio, dando la sensación de que "no se guardó nada".
        // Ahora espera a que cualquier guardado en curso termine antes de salir.
        try{ await operationsSaveQueue; }catch(_){}
        sessionStorage.removeItem(STAFF_SESSION_KEY);
        location.href='./login.html';
      };$('#manual-sync-btn').onclick=async()=>{const synced=await loadFromServer();const sd=await serverToday();normalize(sd);render();applyBranding();notice(synced?'Datos sincronizados con el servidor.':'No se pudo leer la base de datos.',!synced);};$('#import-file').onchange=e=>{
        const file=e.target.files[0];if(!file)return;
        const r=new FileReader();
        r.onload=async()=>{
          let parsed;
          try{ parsed=JSON.parse(r.result); }
          catch{ notice('El archivo no es un JSON válido.',true); e.target.value=''; return; }
          if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)){ notice('El archivo no tiene el formato esperado.',true); e.target.value=''; return; }

          const knownStateKeys=['clients','plans','days','currentDate','drivers','routes','settings','inventory'];
          const foundStateKeys=knownStateKeys.filter(k=>k in parsed);
          const hasStaffUsers=Array.isArray(parsed.staffUsers)&&parsed.staffUsers.length>0;
          if(!foundStateKeys.length&&!hasStaffUsers){ notice('El archivo no contiene datos reconocibles de Catering Control.',true); e.target.value=''; return; }
          const resumen=[...foundStateKeys,...(hasStaffUsers?['staffUsers']:[])].join(', ');
          if(!confirm(`Vas a restaurar: ${resumen}.\n\nEsto reemplaza esos datos en este dispositivo y, al guardar, también en Supabase (para los demás dispositivos). ¿Continuar?`)){ e.target.value=''; return; }
          foundStateKeys.forEach(k=>{ state[k]=parsed[k]; });
          if(hasStaffUsers) staffUsers=parsed.staffUsers;
          normalize();
          const saved=await save();
          render();
          notice(saved?'Respaldo restaurado y guardado en Supabase.':'Se restauró localmente, pero no se pudo guardar en Supabase. Intenta sincronizar de nuevo.',!saved);
          e.target.value='';
        };
        r.readAsText(file);
      };
      document.getElementById('brand-name').textContent = APP_CONFIG.companyName;
      try { activeUser=JSON.parse(sessionStorage.getItem(STAFF_SESSION_KEY)); } catch (_) { activeUser=null; }
      if(!activeUser){ window.location.replace('./login.html'); return; }
      load(); applyBranding(); loadFromServer().then(async () => { const sd=await serverToday(); normalize(sd); render(); applyBranding(); }); render(); activate('dispatch');
      // Si se cierra la pestaña o se recarga mientras hay un guardado en
      // curso (p. ej. justo después de resizar una columna), el navegador
      // puede cortar esa subida a Supabase a mitad de camino — el cambio
      // queda bien guardado en este navegador pero nunca llega al servidor,
      // y se pierde en el próximo inicio de sesión. Este aviso nativo del
      // navegador le da a la persona la chance de esperar unos segundos.
      window.addEventListener('beforeunload', e => { if (saveInFlight) { e.preventDefault(); e.returnValue = ''; } });
    })();
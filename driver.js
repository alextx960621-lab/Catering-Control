// driver.js — Mapa de reparto (OpenStreetMap / Leaflet) para Catering Control.
// Independiente de index.js: solo habla con él a través de window.CateringMapBridge
// (expuesto al final de index.js) y con Supabase a través de window.SupabaseDB.client.
//
// Qué hace:
//  1. Resuelve coordenadas de cada cliente (lat/lng) a partir de:
//     a) su link de Google Maps, cuando el formato trae coordenadas visibles
//        (ej. ".../@-16.5,-68.15,17z" o "?q=-16.5,-68.15"); los links cortos
//        tipo maps.app.goo.gl NO traen coordenadas legibles desde el navegador
//        (son un redirect), así que para esos se usa el paso (b).
//     b) si no se pudo con el link, geocodifica la Dirección 1 con el
//        servicio gratuito de OpenStreetMap (Nominatim).
//     Una vez resuelta, la coordenada se guarda en el cliente (c.lat/c.lng)
//     para no tener que volver a resolverla la próxima vez.
//  2. Dibuja un mapa Leaflet con tiles de OpenStreetMap, un marcador numerado
//     por cliente (según la columna "Orden") y una línea recta orientativa
//     que los une en ese orden (no sigue calles).
//  3. Si el rol es driver, comparte su ubicación en vivo (GPS del celular)
//     mientras el diálogo del mapa esté abierto, vía un canal broadcast de
//     Supabase Realtime. El admin, si abre el mapa de esa misma ruta, ve el
//     ícono del driver moverse en vivo.

(() => {
  'use strict';

  const LOCATION_CHANNEL_NAME = 'catering-driver-location';
  const BROADCAST_MIN_INTERVAL_MS = 4000;
  const NOMINATIM_DELAY_MS = 1100; // respeta el límite de ~1 solicitud/seg de Nominatim

  let dialog = null, mapBodyEl = null, statusEl = null, routeSelectWrap = null, routeSelectEl = null, legendEl = null;
  let map = null, markersLayer = null, routeLine = null, driverMarker = null;
  let watchId = null;
  let locationChannel = null, channelBound = false;
  let lastBroadcastAt = 0;
  let currentRouteId = '';
  let isDriver = false;

  function ensureStyles() {
    if (document.getElementById('driver-map-style')) return;
    const style = document.createElement('style');
    style.id = 'driver-map-style';
    style.textContent = `
      #map-dialog{border:none;border-radius:14px;padding:0;width:min(920px,96vw);height:min(680px,92vh);max-width:none;max-height:none}
      #map-dialog::backdrop{background:rgba(15,23,42,.55)}
      #map-dialog .mmap-head{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(0,0,0,.08);flex-wrap:wrap}
      #map-dialog .mmap-head h2{margin:0;font-size:16px;flex:1 1 auto}
      #map-dialog .mmap-close{border:none;background:transparent;font-size:20px;cursor:pointer;line-height:1;padding:4px 8px}
      #map-dialog .mmap-status{padding:6px 16px;font-size:12.5px;color:#64748b;border-bottom:1px solid rgba(0,0,0,.06)}
      #map-dialog .mmap-legend{padding:4px 16px;font-size:11.5px;color:#94a3b8}
      #map-dialog .mmap-body{position:relative;width:100%;height:calc(100% - 96px)}
      #map-dialog select{padding:5px 8px;border-radius:8px;border:1px solid #cbd5e1;font-size:13px}
      .mc-pin{width:26px;height:26px;border-radius:50% 50% 50% 0;background:#0d6efd;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:rotate(-45deg);display:flex;align-items:center;justify-content:center}
      .mc-pin span{transform:rotate(45deg);color:#fff;font-weight:700;font-size:12px}
      .mc-pin.mc-delivered{background:#16a34a}
      .mc-driver-icon{width:34px;height:34px;border-radius:50%;background:#f97316;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;font-size:16px}
      @media (max-width:520px){#map-dialog{width:100vw;height:100vh;border-radius:0}}
    `;
    document.head.appendChild(style);
  }

  function buildDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'map-dialog';
    dialog.innerHTML = `
      <div class="mmap-head">
        <h2>🗺️ Mapa de reparto</h2>
        <div id="mmap-route-select-wrap" hidden></div>
        <button type="button" class="mmap-close" aria-label="Cerrar">×</button>
      </div>
      <div class="mmap-status" id="mmap-status">Cargando…</div>
      <div class="mmap-legend" id="mmap-legend"></div>
      <div class="mmap-body" id="mmap-body"></div>
    `;
    document.body.appendChild(dialog);
    mapBodyEl = dialog.querySelector('#mmap-body');
    statusEl = dialog.querySelector('#mmap-status');
    legendEl = dialog.querySelector('#mmap-legend');
    routeSelectWrap = dialog.querySelector('#mmap-route-select-wrap');
    dialog.querySelector('.mmap-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', teardown);
    dialog.addEventListener('cancel', () => dialog.close());
  }

  function setStatus(text) { if (statusEl) statusEl.textContent = text; }

  // --- Coordenadas a partir del link de Google Maps (cuando es posible) ---
  function extractCoordsFromMapsLink(url) {
    if (!url) return null;
    if (/goo\.gl|maps\.app\.goo\.gl/i.test(url)) return null; // link corto: no se puede leer sin abrirlo
    const patterns = [
      /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
      /[?&](?:q|ll|daddr)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
      /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/
    ];
    for (const re of patterns) {
      const m = url.match(re);
      if (m) {
        const lat = parseFloat(m[1]), lng = parseFloat(m[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
      }
    }
    return null;
  }

  async function geocodeAddress(address) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.length) return null;
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    } catch (_) { return null; }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // Resuelve coordenadas faltantes: primero el link, si no geocodifica la
  // dirección (con pausa entre llamadas para respetar el límite de Nominatim).
  // Guarda cada resultado en el cliente vía el bridge para no repetirlo después.
  async function resolveCoords(list) {
    const bridge = window.CateringMapBridge;
    const pending = list.filter(c => c.lat == null || c.lng == null);
    let resolved = 0;
    for (const c of pending) {
      let coords = extractCoordsFromMapsLink(c.maps) || extractCoordsFromMapsLink(c.maps2);
      if (!coords && c.address1) {
        setStatus(`Resolviendo direcciones… ${resolved + 1}/${pending.length}`);
        coords = await geocodeAddress(c.address1);
        await sleep(NOMINATIM_DELAY_MS);
      }
      if (coords) {
        c.lat = coords.lat; c.lng = coords.lng;
        bridge.saveClientCoords(c.id, coords.lat, coords.lng);
      }
      resolved++;
    }
  }

  function renderMap(list) {
    if (!mapBodyEl) return;
    if (map) { map.remove(); map = null; }
    mapBodyEl.innerHTML = '';
    if (!window.L) { setStatus('No se pudo cargar el mapa (sin conexión a internet).'); return; }

    const withCoords = list.filter(c => c.lat != null && c.lng != null);
    const withoutCoords = list.length - withCoords.length;

    map = window.L.map(mapBodyEl, { zoomControl: true });
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);

    markersLayer = window.L.layerGroup().addTo(map);
    const sorted = [...withCoords].sort((a, b) => (a.order || 9999) - (b.order || 9999));
    const latlngs = [];
    sorted.forEach(c => {
      const icon = window.L.divIcon({ className: '', html: `<div class="mc-pin"><span>${c.order || '·'}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] });
      window.L.marker([c.lat, c.lng], { icon }).addTo(markersLayer)
        .bindPopup(`<b>${escapeHtml(c.name)}</b><br>Orden: ${c.order || '—'}<br>${escapeHtml(c.address1 || '')}`);
      latlngs.push([c.lat, c.lng]);
    });
    if (routeLine) { routeLine = null; }
    if (latlngs.length > 1) {
      routeLine = window.L.polyline(latlngs, { color: '#0d6efd', weight: 4, opacity: 0.65, dashArray: '8,6' }).addTo(map);
    }
    if (latlngs.length) {
      map.fitBounds(window.L.latLngBounds(latlngs).pad(0.2));
    } else {
      map.setView([-16.5, -68.15], 12); // vista general de La Paz por defecto si no hay puntos aún
    }

    legendEl.textContent = `Números = orden del cliente. Línea punteada = ruta sugerida en línea recta (no sigue calles).${withoutCoords ? ` ${withoutCoords} cliente(s) sin ubicación resuelta.` : ''}`;
    setStatus(withCoords.length ? `${withCoords.length}/${list.length} puntos en el mapa.` : 'No se pudo ubicar a ningún cliente en el mapa todavía.');

    setTimeout(() => map && map.invalidateSize(), 50);
  }

  function escapeHtml(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }

  // --- Ubicación en vivo ---
  function ensureLocationChannel() {
    const client = window.SupabaseDB?.client;
    if (!client || locationChannel) return locationChannel;
    locationChannel = client.channel(LOCATION_CHANNEL_NAME);
    return locationChannel;
  }

  function startDriverBroadcast(routeId, name) {
    const channel = ensureLocationChannel();
    if (!channel || !navigator.geolocation) return;
    channel.subscribe();
    watchId = navigator.geolocation.watchPosition(pos => {
      const now = Date.now();
      drawDriverMarker(pos.coords.latitude, pos.coords.longitude, name || 'Driver', true);
      if (now - lastBroadcastAt < BROADCAST_MIN_INTERVAL_MS) return;
      lastBroadcastAt = now;
      channel.send({ type: 'broadcast', event: 'loc', payload: { routeId, lat: pos.coords.latitude, lng: pos.coords.longitude, name, at: now } });
    }, err => {
      setStatus(err.code === 1 ? 'Activa el permiso de ubicación para compartir tu posición en vivo.' : 'No se pudo obtener tu ubicación en vivo.');
    }, { enableHighAccuracy: true, maximumAge: 4000, timeout: 15000 });
  }

  function startAdminListening(routeId) {
    const channel = ensureLocationChannel();
    if (!channel) return;
    if (!channelBound) {
      channel.on('broadcast', { event: 'loc' }, ({ payload }) => {
        if (!payload || payload.routeId !== currentRouteId) return;
        drawDriverMarker(payload.lat, payload.lng, payload.name || 'Driver', false);
      });
      channel.subscribe();
      channelBound = true;
    }
  }

  function drawDriverMarker(lat, lng, name, isSelf) {
    if (!map || !window.L) return;
    const icon = window.L.divIcon({ className: '', html: `<div class="mc-driver-icon">🚚</div>`, iconSize: [34, 34], iconAnchor: [17, 17] });
    if (!driverMarker) {
      driverMarker = window.L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(map).bindPopup(escapeHtml(name));
    } else {
      driverMarker.setLatLng([lat, lng]);
    }
  }

  function teardown() {
    if (watchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (map) { map.remove(); map = null; }
    driverMarker = null; routeLine = null; markersLayer = null;
    // El canal de Supabase se deja vivo (es liviano) para no pagar el costo
    // de reconectar cada vez que se abre el mapa; solo se detiene el GPS.
  }

  async function populateRouteSelector(activeRouteId) {
    const bridge = window.CateringMapBridge;
    const routes = bridge.getRoutes();
    routeSelectWrap.hidden = false;
    routeSelectWrap.innerHTML = `<select id="mmap-route-select">${routes.map(r => `<option value="${r.id}" ${r.id === activeRouteId ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('')}</select>`;
    routeSelectEl = routeSelectWrap.querySelector('select');
    routeSelectEl.addEventListener('change', () => loadAndRender(routeSelectEl.value));
  }

  async function firstRouteWithData(bridge) {
    const routes = bridge.getRoutes();
    for (const r of routes) {
      if (bridge.getDeliveryList(r.id).length) return r.id;
    }
    return routes[0]?.id || '';
  }

  async function loadAndRender(routeId) {
    const bridge = window.CateringMapBridge;
    currentRouteId = routeId;
    setStatus('Cargando lista de entregas…');
    const list = bridge.getDeliveryList(routeId);
    if (!list.length) {
      if (map) { map.remove(); map = null; }
      mapBodyEl.innerHTML = '';
      legendEl.textContent = '';
      setStatus('Esta ruta no tiene pedidos activos para hoy.');
      return;
    }
    renderMap(list); // primero muestra lo que ya tiene coordenadas guardadas
    await resolveCoords(list);
    renderMap(list); // vuelve a dibujar ya con lo recién resuelto

    if (isDriver) {
      startDriverBroadcast(routeId, bridge.getActiveUser().name);
    } else {
      startAdminListening(routeId);
    }
  }

  async function open(routeId) {
    const bridge = window.CateringMapBridge;
    if (!bridge || !bridge.canAccessDelivery()) return;
    ensureStyles();
    buildDialog();
    const user = bridge.getActiveUser();
    isDriver = bridge.isDriverRole();
    dialog.showModal();
    setTimeout(() => map && map.invalidateSize(), 30);

    if (isDriver) {
      routeSelectWrap.hidden = true;
      await loadAndRender(user.routeId);
    } else {
      const target = routeId || await firstRouteWithData(bridge);
      await populateRouteSelector(target);
      await loadAndRender(target);
    }
  }

  window.DriverMap = { open };
})();

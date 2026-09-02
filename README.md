# Catering Control — migración a React + Vite

## Estado de la migración

| Página | Estado |
|---|---|
| `login.html` | ✅ Migrado — React real, compilado con Vite (`src/login/`) |
| `index.html` (panel de operaciones) | ⏳ Pendiente — sigue siendo el archivo clásico (vanilla JS), vive en `public/` tal cual |
| `cliente.html` (portal de cliente) | ⏳ Pendiente — sigue siendo React con Babel Standalone (sin build), vive en `public/` tal cual |

A medida que se migren `index.html` y `cliente.html`, se agregan como entradas
nuevas en `vite.config.js` (ver comentario ahí) y se borran sus copias de
`public/`.

## Primeros pasos

```bash
npm install
npm run dev
```

Abre `http://localhost:5173/login.html` (el servidor de desarrollo no
redirige sola la raíz `/` a login todavía porque `index.html` sigue siendo
el panel de operaciones, no la portada).

## Icons

Copia tu carpeta `icons/` (los `.png` del manifest/PWA) dentro de
`public/icons/` — no venían en los archivos que se usaron para armar este
proyecto, así que hay que pasarlos a mano una vez.

## Compilar para producción

```bash
npm run build
```

Esto genera una carpeta `dist/` con TODO listo para subir a tu hosting
(Vercel, Hostinger, etc.) — reemplaza el contenido actual del sitio por el
contenido de `dist/`. Dentro vas a encontrar:

- `login.html` ya compilado (JS/CSS minificados y con hash de caché-busting
  automático — por eso ya no hace falta ningún `?v=` a mano en este archivo).
- `index.html`, `cliente.html`, `config.js`, `supabase-client.js`,
  `manifest.json`, `pwa-register.js`, `sw.js`, `icons/` — copiados tal cual
  desde `public/`, sin tocar.

Puedes previsualizar el resultado del build localmente con:

```bash
npm run preview
```

## Sobre `sw.js` (Service Worker) durante la migración

`sw.js` sigue funcionando exactamente igual: precachea `login.html`,
`index.html`, `cliente.html` y los estáticos compartidos por su URL de
siempre (sin `?v=`), y el `fetch` handler cachea sobre la marcha cualquier
otra cosa que se pida (como los `assets/*.js` con hash que genera el build
de `login.html`). No hace falta listar esos archivos con hash a mano en
`PRECACHE_URLS` — el propio Service Worker los cachea la primera vez que se
piden. Sigue subiendo el número de `CACHE_NAME` en cada despliegue, como ya
hacías.

## Por qué `login.html` no está en la raíz del sitio

Tu `manifest.json` tiene `"start_url": "./login.html"`, así que no hace
falta que `login.html` se llame `index.html` ni vivir en ninguna ruta
especial — la PWA ya sabe que el punto de entrada es `login.html`.

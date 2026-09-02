import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ============================================================================
// Catering Control · configuración de Vite
// ============================================================================
// Multi-página: cada pantalla de la app (login, panel de operaciones, portal
// de cliente) es su propio archivo .html en la raíz, con su propio punto de
// entrada de React en src/<pagina>/main.jsx — igual patrón que ya tenías,
// solo que ahora el JSX se compila en el build (rápido, con tree-shaking,
// minificado) en vez de en el navegador con Babel Standalone.
//
// Migración en curso: por ahora SOLO "login" está acá como entrada real de
// Vite. index.html y cliente.html todavía son los archivos "clásicos"
// (Babel Standalone / vanilla JS) y viven en /public tal cual — Vite los
// copia sin tocarlos al compilar, así que la app entera sigue funcionando
// mientras se van migrando uno por uno. A medida que se porten, se agregan
// acá como una entrada más (ver comentario abajo).
// ============================================================================
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        login: './login.html'
        // Cuando migremos el panel de operaciones y el portal de cliente:
        // index: './index.html',
        // cliente: './cliente.html',
        // ...y se borran esos mismos archivos de /public para que no quede
        // una copia vieja compitiendo con la nueva.
      }
    }
  }
});

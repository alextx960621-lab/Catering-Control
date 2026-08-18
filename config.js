/* ==========================================================================
   CONFIGURACIÓN DE LA EMPRESA — ÚNICO ARCHIVO A EDITAR POR CLIENTE/EMPRESA
   ==========================================================================
   Para dar de alta una empresa nueva:
     1) Copia toda esta carpeta a un nuevo proyecto/repositorio.
     2) Crea un proyecto de Supabase nuevo para esa empresa y ejecuta
        supabase-setup.sql en él (SQL Editor → New query → Run).
     3) Reemplaza los valores de abajo con los datos de la empresa nueva
        (marca + credenciales de su proyecto de Supabase).
     4) Sube la carpeta al hosting y conecta el dominio de la empresa.
   Ningún otro archivo (login.html, index.html, cliente.html,
   supabase-client.js) necesita tocarse: todos leen de aquí.
   ========================================================================== */
window.APP_CONFIG = {
  // --- Marca / identidad de la empresa ---
  companyName: 'Catering Control',        // Nombre mostrado en toda la app
  logoUrl: './logo.jpg',                  // Ruta o URL del logo
  whatsappNumber: '',                     // Ej. 59170000000 (sin +). Vacío = oculta el botón
  instagramUrl: '',                       // Ej. https://instagram.com/miempresa. Vacío = oculta la tarjeta
  instagramHandle: '',                    // Ej. @miempresa

  // --- Almacenamiento local (debe ser único por empresa si comparten navegador) ---
  storagePrefix: 'catering-app',

  // --- Conexión a Supabase (un proyecto de Supabase distinto por empresa) ---
  supabaseUrl: 'https://sucygrskajrcnwizrfpd.supabase.co',
  supabaseKey: 'sb_publishable_yiChv91nKsuQVEPMd0t3Ng_hjpiurFD'
};

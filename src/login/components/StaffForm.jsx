import { useState } from 'react';

// Antes había un index.html (admin/editor/kitchen) y un driver.html
// separados. Ahora index.html ya trae permisos por rol (isDriverRole(),
// canAccessPage()) y muestra/oculta páginas según quién entró — así que
// TODOS entran al mismo index.html; no hay que distinguir por rol acá.
const STAFF_APP_URL = './index.html';

export default function StaffForm({ active, sessionKey, onError, onClearError }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    onClearError();
    setLoading(true);
    try {
      const cleanEmail = email.trim();
      const rows = await window.SupabaseDB?.rpc('login_staff', { p_email: cleanEmail, p_password: password });
      const person = Array.isArray(rows) ? rows[0] : null;
      if (person?.locked_seconds > 0) {
        onError(`Demasiados intentos fallidos. Espera ${person.locked_seconds} segundos e intenta de nuevo.`);
        return;
      }
      // Blindaje extra: solo se acepta la respuesta si trae un id real. La
      // validación de verdad (contraseña, cuenta bloqueada) ya la hace el
      // backend en login_staff — acá solo nos aseguramos de que vino algo
      // utilizable, sin exigir que el rol esté en una lista fija (eso
      // bloqueaba "superadmin" o roles personalizados creados en Usuarios).
      const validPerson = person && typeof person.id === 'string' && person.id.trim() && typeof person.role === 'string' && person.role.trim();
      if (!validPerson) { onError('Correo o contraseña incorrectos.'); return; }
      sessionStorage.setItem(sessionKey, JSON.stringify({
        id: person.id, name: person.name, role: person.role,
        routeId: person.routeId || '', driverId: person.driverId || ''
      }));
      window.location.href = STAFF_APP_URL;
    } catch (_) {
      onError('No se pudo conectar. Revisa tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={`form-panel${active ? ' active' : ''}`} onSubmit={handleSubmit}>
      <div className="mb-3">
        <label className="form-label" htmlFor="staff-email">Correo</label>
        <input className="form-control" id="staff-email" type="email" autoComplete="username" required
          value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="staff-pass">Contraseña</label>
        <div className="input-group">
          <input className="form-control" id="staff-pass" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required
            value={password} onChange={e => setPassword(e.target.value)} />
          <button className="btn btn-outline-secondary" type="button"
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            onClick={() => setShowPassword(v => !v)}>
            {showPassword ? '😆' : '😃'}
          </button>
        </div>
      </div>
      <button className="btn btn-primary w-100" type="submit" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar al panel'}
      </button>
    </form>
  );
}

export { STAFF_APP_URL };

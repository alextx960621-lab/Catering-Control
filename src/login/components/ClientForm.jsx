import { useState } from 'react';

const CLIENT_PORTAL_URL = './cliente.html';

export default function ClientForm({ active, sessionKey, onError, onClearError }) {
  const [carnet, setCarnet] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    onClearError();
    setLoading(true);
    try {
      const cleanCarnet = carnet.trim();
      const cleanPhone = phone.replace(/\D/g, '');
      const rows = await window.SupabaseDB?.rpc('login_cliente', { p_carnet: cleanCarnet, p_phone: cleanPhone });
      const client = Array.isArray(rows) ? rows[0] : null;
      if (!client) { onError('Carnet o teléfono no coinciden con un cliente registrado.'); return; }
      sessionStorage.setItem(sessionKey, JSON.stringify({ id: client.id, name: client.name }));
      window.location.href = CLIENT_PORTAL_URL;
    } catch (_) {
      onError('No se pudo conectar. Revisa tu internet e intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={`form-panel${active ? ' active' : ''}`} onSubmit={handleSubmit}>
      <div className="mb-3">
        <label className="form-label" htmlFor="client-carnet">Carnet de identidad</label>
        <input className="form-control" id="client-carnet" autoComplete="username" placeholder="Ej. 12345678" required
          value={carnet} onChange={e => setCarnet(e.target.value)} />
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="client-phone">Teléfono</label>
        <input className="form-control" id="client-phone" inputMode="tel" autoComplete="current-password" placeholder="70000000" required
          value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      <button className="btn btn-primary w-100" type="submit" disabled={loading}>
        {loading ? 'Entrando…' : 'Entrar a mi plan'}
      </button>
    </form>
  );
}

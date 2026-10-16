'use client';

import { useState } from 'react';
import Pokeball from '../components/Pokeball';

export default function AccessPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Accès refusé.');
    } catch {
      setError('Connexion impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6 text-center">
        <Pokeball size={72} className="mx-auto" />
        <h1 className="mt-4 font-display text-2xl">PokéScan</h1>
        <p className="mt-1 text-sm font-semibold text-ink/70">Application privée. Entrez votre code d’accès.</p>

        <label htmlFor="code" className="sr-only">
          Code d’accès
        </label>
        <input
          id="code"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code d’accès"
          className="mt-5 w-full rounded-xl border-2 border-ink bg-white px-3 py-2.5 text-center text-base font-bold placeholder:font-semibold placeholder:text-ink/40"
        />
        {error && (
          <p role="alert" className="mt-3 text-sm font-extrabold text-dex-deep">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !code.trim()} className="btn-chunky mt-4 w-full bg-pika">
          {busy ? 'Vérification…' : 'Entrer'}
        </button>
      </form>
    </main>
  );
}

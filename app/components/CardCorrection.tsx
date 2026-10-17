'use client';

import { useState } from 'react';
import { PokemonCard } from '../types';
import { EditionOption, findEditions, loadDetails } from '../lib/pokemonTcg';

interface Props {
  initialName: string;
  initialNumber: string;
  defaultOpen?: boolean;
  onCards: (cards: PokemonCard[]) => void;
}

export default function CardCorrection({ initialName, initialNumber, defaultOpen = false, onCards }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState(initialName);
  const [number, setNumber] = useState(initialNumber);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editions, setEditions] = useState<EditionOption[] | null>(null);
  const [exact, setExact] = useState(false);
  const [lang, setLang] = useState('fr');
  const [selected, setSelected] = useState<string | null>(null);

  async function pick(edition: EditionOption, useLang: string) {
    setSelected(edition.id);
    setBusy(true);
    setError(null);
    try {
      onCards(await loadDetails(useLang, edition.briefs));
    } catch {
      setError('Impossible de charger cette édition. Réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    setEditions(null);
    setSelected(null);
    try {
      const res = await findEditions(name.trim(), number.trim());
      setLang(res.lang);
      setExact(res.exact);
      setEditions(res.editions);
      // Une seule édition possible : inutile de faire choisir.
      if (res.editions.length === 1) await pick(res.editions[0], res.lang);
    } catch {
      setError('Recherche impossible pour le moment. Réessayez dans un instant.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-4 w-full text-center text-sm font-extrabold text-ink/70 underline">
        Ce n’est pas la bonne carte ? Corriger
      </button>
    );
  }

  const input = 'mt-0.5 w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-bold placeholder:font-semibold placeholder:text-ink/40';

  return (
    <form onSubmit={search} className="panel mt-4 p-3">
      <p className="font-display text-sm">{initialName ? 'Corriger la recherche' : 'Rechercher une carte'}</p>
      <div className="mt-2 grid grid-cols-[1fr_7rem] gap-2">
        <label>
          <span className="text-xs font-extrabold text-ink/60">Nom de la carte</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex. Roucarnage"
            autoFocus={defaultOpen && !initialName}
            className={input}
          />
        </label>
        <label>
          <span className="text-xs font-extrabold text-ink/60">N° sur la carte</span>
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="136/189"
            autoCapitalize="characters"
            className={input}
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-ink/60">
        Le numéro est imprimé en bas de la carte. Le total (après le « / ») suffit souvent à trouver l’édition.
      </p>
      <button type="submit" disabled={busy || !name.trim()} className="btn-chunky mt-3 w-full bg-pika">
        {busy ? 'Recherche…' : 'Chercher'}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm font-extrabold text-dex-deep">
          {error}
        </p>
      )}

      {editions && editions.length === 0 && (
        <p className="mt-3 text-sm font-bold text-ink/70">
          Aucune carte nommée « {name.trim()} ». Vérifiez l’orthographe, ou essayez avec une partie du nom.
        </p>
      )}

      {editions && editions.length > 0 && (
        <>
          <p className="mt-4 text-xs font-extrabold text-ink/65">
            {exact
              ? `Éditions où cette carte porte le n° ${number.split('/')[0].trim()}`
              : number.trim()
                ? 'Aucune édition avec ce numéro : voici toutes les éditions de cette carte'
                : 'Éditions contenant cette carte'}
            {' '}({editions.length}). Touchez la bonne :
          </p>
          <ul className="mt-2 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto pr-1">
            {editions.map((ed) => {
              const active = selected === ed.id;
              return (
                <li key={ed.id}>
                  <button
                    type="button"
                    onClick={() => pick(ed, lang)}
                    disabled={busy}
                    aria-pressed={active}
                    className={`flex h-full w-full flex-col items-center justify-between gap-1 rounded-xl border-2 bg-white p-2 text-center transition-colors ${
                      active ? 'border-dex ring-2 ring-dex/40' : 'border-ink/20'
                    }`}
                  >
                    <span className="grid h-10 w-full place-items-center">
                      {ed.logo || ed.symbol ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={ed.logo ? `${ed.logo}.png` : `${ed.symbol}.png`}
                          alt=""
                          loading="lazy"
                          className="max-h-10 max-w-full object-contain"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-[11px] font-extrabold leading-tight">{ed.name}</span>
                    {ed.cardCount?.official ? (
                      <span className="text-[10px] font-bold text-ink/55">{ed.cardCount.official} cartes</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </form>
  );
}

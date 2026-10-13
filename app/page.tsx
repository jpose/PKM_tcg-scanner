'use client';

import { useEffect, useState } from 'react';
import CameraCapture, { ScanPhase } from './components/CameraCapture';
import CardResults from './components/CardResults';
import CollectionGrid from './components/CollectionGrid';
import Pokeball from './components/Pokeball';
import { CardVariant, CollectionItem, PokemonCard } from './types';
import { searchPokemonCards } from './lib/pokemonTcg';
import {
  addCardToCollection,
  getCollectionValue,
  loadCollection,
  refreshCollectionPrices,
  removeOneFromCollection,
} from './lib/collection';

type Tab = 'scan' | 'collection';

export default function Home() {
  const [tab, setTab] = useState<Tab>('scan');
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [results, setResults] = useState<PokemonCard[] | null>(null);
  const [identified, setIdentified] = useState<{ name: string; cardNumber: string | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    setCollection(loadCollection());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleCapture(base64: string, mimeType: string) {
    setPhase('reading');
    setErrorMsg(null);
    setResults(null);
    setIdentified(null);
    try {
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setErrorMsg(data.error || 'Lecture impossible. Réessayez avec une photo plus nette.');
        return;
      }
      const found = data.result;
      if (!found?.name) {
        setResults([]);
        return;
      }

      setIdentified({ name: found.name, cardNumber: found.cardNumber ?? null });
      setPhase('searching');
      setResults(
        await searchPokemonCards({
          name: found.name,
          cardNumber: found.cardNumber,
          setName: found.setName,
        })
      );
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '';
      setErrorMsg(
        message.includes('Pokémon TCG')
          ? 'La base de cartes est momentanément indisponible. Réessayez dans quelques instants.'
          : 'Connexion interrompue. Vérifiez votre réseau puis scannez à nouveau.'
      );
    } finally {
      setPhase('idle');
    }
  }

  function handleAdd(card: PokemonCard, variant: CardVariant) {
    setCollection(addCardToCollection(card, variant));
    setToast(`${card.name} ajoutée au classeur`);
    setResults(null);
    setIdentified(null);
  }

  function handleAddOne(itemId: string) {
    const item = collection.find((i) => i.id === itemId);
    if (item) setCollection(addCardToCollection(item.card, item.variant));
  }

  async function handleRefreshPrices() {
    setRefreshing(true);
    try {
      setCollection(await refreshCollectionPrices());
      setToast('Cotes mises à jour');
    } finally {
      setRefreshing(false);
    }
  }

  const totalCards = collection.reduce((n, i) => n + i.quantity, 0);
  const setCount = new Set(collection.map((i) => i.card.set?.id)).size;
  const { eur, usd } = getCollectionValue(collection);
  const valueParts: string[] = [];
  if (eur > 0) valueParts.push(`${eur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
  if (usd > 0) valueParts.push(`${usd.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`);
  const valueLabel = valueParts.join(' + ') || '0,00 €';

  return (
    <div className="min-h-screen pb-28">
      {/* Bandeau Pokédex */}
      <header className="sticky top-0 z-20 border-b-4 border-ink bg-dex pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-ink bg-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.15)]">
            <span className="h-7 w-7 rounded-full border-2 border-ink bg-lens shadow-[inset_-2px_-3px_0_rgba(0,0,0,0.2),inset_3px_3px_0_rgba(255,255,255,0.55)]" />
          </span>
          <span className="flex gap-1.5" aria-hidden="true">
            <i className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-[#FF6B5E]" />
            <i className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-pika" />
            <i className="h-2.5 w-2.5 rounded-full border-2 border-ink bg-[#4ADE80]" />
          </span>
          <h1 className="font-display text-xl tracking-wide drop-shadow-[0_2px_0_rgba(27,35,64,0.6)]">PokéScan</h1>
          <div className="ml-auto text-right leading-tight">
            <p className="text-[11px] font-bold text-white/85">Valeur du classeur</p>
            <p className="font-display text-sm">{valueLabel}</p>
          </div>
        </div>
      </header>

      <main className="px-4 pt-6">
        {tab === 'scan' && (
          <>
            <CameraCapture onCapture={handleCapture} phase={phase} />
            {errorMsg && (
              <p role="alert" className="mx-auto mt-5 max-w-sm rounded-xl border-2 border-dex bg-white px-3 py-2 text-center text-sm font-bold text-dex-deep">
                {errorMsg}
              </p>
            )}
            {results && (
              <CardResults
                cards={results}
                identified={identified}
                onAdd={handleAdd}
                onDismiss={() => {
                  setResults(null);
                  setIdentified(null);
                }}
              />
            )}
          </>
        )}

        {tab === 'collection' && (
          <>
            <div className="panel mx-auto grid max-w-3xl grid-cols-3 divide-x-2 divide-ink/15 py-3 text-center">
              {[
                ['Cartes', totalCards],
                ['Différentes', collection.length],
                ['Éditions', setCount],
              ].map(([label, n]) => (
                <div key={label as string}>
                  <p className="font-display text-2xl leading-none">{n}</p>
                  <p className="mt-1 text-xs font-extrabold text-ink/60">{label}</p>
                </div>
              ))}
            </div>
            {collection.length > 0 && (
              <div className="mx-auto mt-3 flex max-w-3xl justify-end">
                <button onClick={handleRefreshPrices} disabled={refreshing} className="btn-chunky bg-white">
                  {refreshing ? 'Mise à jour…' : 'Actualiser les cotes'}
                </button>
              </div>
            )}
            <CollectionGrid
              items={collection}
              onAddOne={handleAddOne}
              onRemoveOne={(id) => setCollection(removeOneFromCollection(id))}
              onScan={() => setTab('scan')}
            />
          </>
        )}
      </main>

      {toast && (
        <div className="pop fixed bottom-24 left-1/2 z-30 flex items-center gap-2 rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-extrabold shadow-[0_3px_0_#1B2340]">
          <Pokeball size={20} />
          {toast}
        </div>
      )}

      {/* Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t-4 border-ink bg-white pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto grid max-w-3xl grid-cols-2">
          {([
            ['scan', 'Scanner'],
            ['collection', `Classeur (${totalCards})`],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              aria-current={tab === key ? 'page' : undefined}
              className={`flex items-center justify-center gap-2 py-3 text-sm font-extrabold transition-colors ${
                tab === key ? 'bg-pika text-ink' : 'text-ink/60'
              }`}
            >
              {key === 'scan' ? (
                <Pokeball size={22} muted={tab !== key} />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" aria-hidden="true">
                  <rect x="4" y="3" width="16" height="18" rx="2.5" />
                  <path d="M9 3v18M13 8h4M13 12h4" strokeLinecap="round" />
                </svg>
              )}
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import CameraCapture from './components/CameraCapture';
import CardResults from './components/CardResults';
import CollectionGrid from './components/CollectionGrid';
import { CollectionItem, PokemonCard } from './types';
import { searchPokemonCards } from './lib/pokemonTcg';
import {
  addCardToCollection,
  deleteFromCollection,
  getCollectionValue,
  loadCollection,
  removeOneFromCollection,
} from './lib/collection';

type Tab = 'scan' | 'collection';

export default function Home() {
  const [tab, setTab] = useState<Tab>('scan');
  const [isBusy, setIsBusy] = useState(false);
  const [results, setResults] = useState<PokemonCard[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [collection, setCollection] = useState<CollectionItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setCollection(loadCollection());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  async function handleCapture(base64: string, mimeType: string) {
    setIsBusy(true);
    setErrorMsg(null);
    setResults(null);
    try {
      const res = await fetch('/api/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || 'Erreur lors de l’identification.');
        setIsBusy(false);
        return;
      }

      const identified = data.result;
      if (!identified?.name) {
        setResults([]);
        setIsBusy(false);
        return;
      }

      const cards = await searchPokemonCards({
        name: identified.name,
        cardNumber: identified.cardNumber,
        setName: identified.setName,
      });
      setResults(cards);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : '';
      if (message.includes('Pokémon TCG')) {
        setErrorMsg(
          'La base de données Pokémon TCG est momentanément indisponible. Réessayez dans quelques instants.'
        );
      } else {
        setErrorMsg('Une erreur est survenue. Réessayez.');
      }
    } finally {
      setIsBusy(false);
    }
  }

  function handleAdd(card: PokemonCard) {
    const next = addCardToCollection(card);
    setCollection(next);
    setToast(`${card.name} ajoutée à la collection !`);
    setResults(null);
  }

  function handleRemoveOne(cardId: string) {
    setCollection(removeOneFromCollection(cardId));
  }

  function handleDelete(cardId: string) {
    setCollection(deleteFromCollection(cardId));
  }

  const totalCards = collection.reduce((sum, i) => sum + i.quantity, 0);
  const { eur: totalEur, usd: totalUsd } = getCollectionValue(collection);
  const valueParts: string[] = [];
  if (totalEur > 0) valueParts.push(`${totalEur.toFixed(2)} €`);
  if (totalUsd > 0) valueParts.push(`$${totalUsd.toFixed(2)}`);
  const valueLabel = valueParts.length > 0 ? valueParts.join(' · ') : '—';

  return (
    <main className="min-h-screen pb-16">
      <header className="bg-poke-red text-white py-4 px-4 sticky top-0 z-10 card-shadow">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">⚡ PokéScan</h1>
          <div className="flex gap-1 bg-white/20 rounded-full p-1">
            <button
              onClick={() => setTab('scan')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                tab === 'scan' ? 'bg-white text-poke-red' : 'text-white'
              }`}
            >
              Scanner
            </button>
            <button
              onClick={() => setTab('collection')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition ${
                tab === 'collection' ? 'bg-white text-poke-red' : 'text-white'
              }`}
            >
              Collection ({totalCards})
            </button>
          </div>
        </div>
      </header>

      {tab === 'scan' && (
        <section className="px-4 mt-6">
          <CameraCapture onCapture={handleCapture} isBusy={isBusy} />
          {errorMsg && (
            <p className="text-center text-red-600 text-sm mt-4 max-w-md mx-auto">
              {errorMsg}
            </p>
          )}
          {results && (
            <CardResults
              cards={results}
              onAdd={handleAdd}
              onDismiss={() => setResults(null)}
            />
          )}
        </section>
      )}

      {tab === 'collection' && (
        <section className="px-4 mt-6">
          <div className="max-w-3xl mx-auto flex items-center justify-between text-sm text-gray-600 px-2">
            <span>{totalCards} carte(s)</span>
            <span className="font-semibold text-green-600">
              Valeur estimée : {valueLabel}
            </span>
          </div>
          <CollectionGrid
            items={collection}
            onRemoveOne={handleRemoveOne}
            onDelete={handleDelete}
          />
        </section>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-poke-dark text-white text-sm px-4 py-2 rounded-full shadow-lg z-20">
          {toast}
        </div>
      )}
    </main>
  );
}

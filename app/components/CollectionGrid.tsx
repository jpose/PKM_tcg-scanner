'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { CollectionItem, VARIANT_LABELS } from '../types';
import { buildCardImageUrl, getPriceForVariant } from '../lib/pokemonTcg';

interface Props {
  items: CollectionItem[];
  onRemoveOne: (itemId: string) => void;
  onDelete: (itemId: string) => void;
}

type SortMode = 'name' | 'set' | 'recent' | 'value';

function formatItemPrice(item: CollectionItem): string | null {
  const price = getPriceForVariant(item.card, item.variant);
  if (!price) return null;
  return price.currency === 'EUR'
    ? `${price.value.toFixed(2)} €`
    : `$${price.value.toFixed(2)}`;
}

function priceValue(item: CollectionItem): number {
  return getPriceForVariant(item.card, item.variant)?.value ?? 0;
}

function sortItems(items: CollectionItem[], sortMode: SortMode): CollectionItem[] {
  const sorted = [...items];
  switch (sortMode) {
    case 'name':
      return sorted.sort((a, b) => a.card.name.localeCompare(b.card.name));
    case 'set':
      return sorted.sort((a, b) => a.card.set.name.localeCompare(b.card.set.name));
    case 'value':
      return sorted.sort((a, b) => priceValue(b) - priceValue(a));
    case 'recent':
    default:
      return sorted.sort((a, b) => b.addedAt - a.addedAt);
  }
}

export default function CollectionGrid({ items, onRemoveOne, onDelete }: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('recent');
  const [groupBySet, setGroupBySet] = useState(false);

  const groups = useMemo(() => {
    const sorted = sortItems(items, sortMode);
    if (!groupBySet) {
      return [{ label: null as string | null, items: sorted }];
    }
    const map = new Map<string, CollectionItem[]>();
    for (const item of sorted) {
      const key = item.card.set?.name || 'Édition inconnue';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, groupItems]) => ({ label, items: groupItems }));
  }, [items, sortMode, groupBySet]);

  if (items.length === 0) {
    return (
      <p className="text-center text-gray-500 mt-6">
        Votre collection est vide pour l’instant. Scannez une carte pour commencer !
      </p>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center gap-3 px-2 mt-4">
        <label className="text-sm text-gray-600 flex items-center gap-2">
          Trier par
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm bg-white"
          >
            <option value="recent">Ajout récent</option>
            <option value="name">Nom</option>
            <option value="set">Édition</option>
            <option value="value">Valeur</option>
          </select>
        </label>
        <label className="text-sm text-gray-600 flex items-center gap-2">
          <input
            type="checkbox"
            checked={groupBySet}
            onChange={(e) => setGroupBySet(e.target.checked)}
          />
          Grouper par édition
        </label>
      </div>

      {groups.map((group) => (
        <div key={group.label ?? 'all'}>
          {group.label && (
            <h3 className="mt-6 mb-2 px-2 text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {group.label} ({group.items.length})
            </h3>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-2">
            {group.items.map((item) => {
              const imageUrl = buildCardImageUrl(item.card, 'low', 'webp');
              const price = formatItemPrice(item);
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl p-2 card-shadow flex flex-col items-center"
                >
                  <div className="relative w-full aspect-[2/3]">
                    {imageUrl && (
                      <Image
                        src={imageUrl}
                        alt={item.card.name}
                        fill
                        className="object-contain rounded-md"
                        sizes="200px"
                      />
                    )}
                    {item.quantity > 1 && (
                      <span className="absolute top-1 right-1 bg-poke-red text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                        x{item.quantity}
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium mt-2 text-center truncate w-full">
                    {item.card.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate w-full text-center">
                    {item.card.set?.name}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-poke-blue/10 text-poke-blue font-medium">
                      {VARIANT_LABELS[item.variant]}
                    </span>
                    {price && (
                      <span className="text-xs font-semibold text-green-600">{price}</span>
                    )}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => onRemoveOne(item.id)}
                      className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                    >
                      -1
                    </button>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      Suppr.
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

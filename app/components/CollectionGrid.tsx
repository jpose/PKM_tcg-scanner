'use client';

import { useMemo, useState } from 'react';
import { CollectionItem, VARIANT_LABELS } from '../types';
import { getItemPrice } from '../lib/collection';
import CardImage from './CardImage';
import { foilClass, formatPrice } from '../lib/ui';
import Pokeball from './Pokeball';
import CardDetail from './CardDetail';

interface Props {
  items: CollectionItem[];
  onAddOne: (itemId: string) => void;
  onRemoveOne: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onSetPrice: (itemId: string, value: number | null) => void;
  onScan: () => void;
}

type SortMode = 'number' | 'name' | 'value' | 'recent';

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const unitValue = (i: CollectionItem) => getItemPrice(i)?.value ?? 0;

function sortItems(items: CollectionItem[], mode: SortMode): CollectionItem[] {
  const list = [...items];
  const byNumber = (a: CollectionItem, b: CollectionItem) =>
    (a.card.set?.name ?? '').localeCompare(b.card.set?.name ?? '') ||
    a.card.localId.localeCompare(b.card.localId, undefined, { numeric: true });
  switch (mode) {
    case 'name':
      return list.sort((a, b) => a.card.name.localeCompare(b.card.name));
    case 'value':
      return list.sort((a, b) => unitValue(b) - unitValue(a));
    case 'recent':
      return list.sort((a, b) => b.addedAt - a.addedAt);
    default:
      return list.sort(byNumber);
  }
}

export default function CollectionGrid({ items, onAddOne, onRemoveOne, onDelete, onSetPrice, onScan }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('number');
  const [groupBySet, setGroupBySet] = useState(true);

  const groups = useMemo(() => {
    const q = norm(query.trim());
    const filtered = q
      ? items.filter((i) => norm(i.card.name).includes(q) || norm(i.card.set?.name ?? '').includes(q))
      : items;
    const sorted = sortItems(filtered, sortMode);
    if (!groupBySet) return [{ label: null as string | null, logo: undefined as string | undefined, items: sorted }];

    const map = new Map<string, { logo?: string; items: CollectionItem[] }>();
    for (const it of sorted) {
      const key = it.card.set?.name || 'Édition inconnue';
      if (!map.has(key)) map.set(key, { logo: it.card.set?.logo, items: [] });
      map.get(key)!.items.push(it);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, g]) => ({ label, logo: g.logo, items: g.items }));
  }, [items, query, sortMode, groupBySet]);

  if (items.length === 0) {
    return (
      <div className="panel mx-auto mt-6 max-w-sm p-8 text-center">
        <Pokeball size={64} muted className="mx-auto" />
        <p className="mt-4 font-display text-lg">Votre classeur est vide</p>
        <p className="mt-1 text-sm font-semibold text-ink/70">
          Scannez votre première carte : elle viendra se ranger ici avec sa valeur.
        </p>
        <button onClick={onScan} className="btn-chunky mt-5 bg-pika">
          Scanner une carte
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher un nom ou une édition"
          className="min-w-0 flex-1 rounded-xl border-2 border-ink bg-white px-3 py-2 text-sm font-semibold placeholder:text-ink/45"
        />
        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          aria-label="Trier par"
          className="rounded-xl border-2 border-ink bg-white px-2 py-2 text-sm font-bold"
        >
          <option value="number">N° dans l’édition</option>
          <option value="name">Nom</option>
          <option value="value">Valeur</option>
          <option value="recent">Ajout récent</option>
        </select>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-bold">
        <input type="checkbox" checked={groupBySet} onChange={(e) => setGroupBySet(e.target.checked)} className="h-4 w-4 accent-[#E23B2E]" />
        Classer par édition
      </label>

      {groups.length === 0 || groups.every((g) => g.items.length === 0) ? (
        <p className="mt-8 text-center text-sm font-bold text-ink/60">Aucune carte ne correspond à « {query} ».</p>
      ) : (
        groups.map((group) => (
          <section key={group.label ?? 'all'} className="mt-6">
            {group.label && (
              <h3 className="mb-3 flex items-center gap-2 border-b-2 border-ink pb-1.5">
                {group.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${group.logo}.png`}
                    alt=""
                    className="h-6 max-w-[72px] object-contain"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <span className="font-display text-sm">{group.label}</span>
                <span className="ml-auto text-xs font-extrabold text-ink/60">
                  {group.items.reduce((n, i) => n + i.quantity, 0)} carte(s)
                </span>
              </h3>
            )}
            <ul className="grid grid-cols-3 gap-x-2.5 gap-y-5 sm:grid-cols-4">
              {group.items.map((item) => {
                const itemPrice = getItemPrice(item);
                const price = formatPrice(itemPrice);
                return (
                  <li key={item.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      aria-label={`Voir la fiche de ${item.card.name}`}
                      className={`relative block w-full text-left ${foilClass(item.variant)}`}
                    >
                      <CardImage card={item.card} className="shadow-[0_3px_8px_rgba(27,35,64,0.35)]" />
                      {item.quantity > 1 && (
                        <span className="absolute right-1 top-1 z-10 rounded-full border-2 border-ink bg-pika px-1.5 text-[11px] font-extrabold">
                          ×{item.quantity}
                        </span>
                      )}
                    </button>

                    <p className="mt-1.5 truncate text-[13px] font-extrabold leading-tight">{item.card.name}</p>
                    <div className="mt-0.5 flex items-center justify-between gap-1">
                      <span className="truncate text-[11px] font-bold text-ink/60">
                        n° {item.card.localId}
                        {item.variant !== 'normal' && ` · ${VARIANT_LABELS[item.variant]}`}
                      </span>
                    </div>
                    <p
                      title={itemPrice?.manual ? 'Cote saisie par vous' : undefined}
                      className={`mt-1 inline-block rounded-md px-1.5 py-0.5 font-display text-[12px] ${
                        itemPrice?.manual ? 'bg-pika text-ink' : 'bg-ink text-white'
                      }`}
                    >
                      {price ?? 'Prix n.c.'}
                    </p>

                    <div className="mt-1.5 flex items-center justify-between rounded-lg border-2 border-ink/20 bg-white">
                      <button
                        onClick={() => {
                          if (item.quantity > 1 || window.confirm('Retirer cette carte du classeur ?')) onRemoveOne(item.id);
                        }}
                        aria-label="Retirer un exemplaire"
                        className="grid h-7 w-8 place-items-center text-base font-extrabold active:bg-ink/10"
                      >
                        −
                      </button>
                      <span className="text-xs font-extrabold">×{item.quantity}</span>
                      <button
                        onClick={() => onAddOne(item.id)}
                        aria-label="Ajouter un exemplaire"
                        className="grid h-7 w-8 place-items-center text-base font-extrabold active:bg-ink/10"
                      >
                        +
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {selected && (
        <CardDetail
          item={selected}
          onClose={() => setSelectedId(null)}
          onAddOne={onAddOne}
          onRemoveOne={onRemoveOne}
          onDelete={onDelete}
          onSetPrice={onSetPrice}
        />
      )}
    </div>
  );
}

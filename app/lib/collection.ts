import { CollectionItem, PokemonCard } from '../types';
import { getBestPrice } from './pokemonTcg';

const STORAGE_KEY = 'pokescan_collection_v1';

export function loadCollection(): CollectionItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CollectionItem[];
  } catch {
    return [];
  }
}

function saveCollection(items: CollectionItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addCardToCollection(card: PokemonCard): CollectionItem[] {
  const items = loadCollection();
  const existing = items.find((i) => i.card.id === card.id);

  let next: CollectionItem[];
  if (existing) {
    next = items.map((i) =>
      i.card.id === card.id ? { ...i, quantity: i.quantity + 1 } : i
    );
  } else {
    const newItem: CollectionItem = {
      id: `${card.id}-${Date.now()}`,
      card,
      addedAt: Date.now(),
      quantity: 1,
    };
    next = [newItem, ...items];
  }
  saveCollection(next);
  return next;
}

export function removeOneFromCollection(cardId: string): CollectionItem[] {
  const items = loadCollection();
  const next = items
    .map((i) => (i.card.id === cardId ? { ...i, quantity: i.quantity - 1 } : i))
    .filter((i) => i.quantity > 0);
  saveCollection(next);
  return next;
}

export function deleteFromCollection(cardId: string): CollectionItem[] {
  const items = loadCollection().filter((i) => i.card.id !== cardId);
  saveCollection(items);
  return items;
}

/**
 * Les prix TCGdex arrivent soit en EUR (Cardmarket), soit en USD (TCGPlayer)
 * selon la carte. On ne les additionne pas entre devises différentes :
 * on renvoie un total par devise.
 */
export function getCollectionValue(items: CollectionItem[]): { eur: number; usd: number } {
  return items.reduce(
    (totals, item) => {
      const price = getBestPrice(item.card);
      if (!price) return totals;
      if (price.currency === 'EUR') {
        totals.eur += price.value * item.quantity;
      } else {
        totals.usd += price.value * item.quantity;
      }
      return totals;
    },
    { eur: 0, usd: 0 }
  );
}

import { CollectionItem, PokemonTCGCard } from '../types';

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

export function addCardToCollection(card: PokemonTCGCard): CollectionItem[] {
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

export function getCollectionValue(items: CollectionItem[]): number {
  return items.reduce((sum, item) => {
    const prices = item.card.tcgplayer?.prices;
    if (!prices) return sum;
    const firstPriceGroup = Object.values(prices)[0];
    const market = firstPriceGroup?.market || firstPriceGroup?.mid || 0;
    return sum + market * item.quantity;
  }, 0);
}

import { CardVariant, CollectionItem, PokemonCard } from '../types';
import { getPriceForVariant } from './pokemonTcg';

const STORAGE_KEY = 'pokescan_collection_v2';
const LEGACY_STORAGE_KEY = 'pokescan_collection_v1';

function itemKey(cardId: string, variant: CardVariant) {
  return `${cardId}::${variant}`;
}

export function loadCollection(): CollectionItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CollectionItem[];

    // Migration douce depuis l'ancien format (sans variante = "normal").
    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const legacyItems = JSON.parse(legacyRaw) as Array<
        Omit<CollectionItem, 'variant'> & { variant?: CardVariant }
      >;
      const migrated: CollectionItem[] = legacyItems.map((item) => ({
        ...item,
        variant: item.variant || 'normal',
      }));
      saveCollection(migrated);
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

function saveCollection(items: CollectionItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addCardToCollection(card: PokemonCard, variant: CardVariant): CollectionItem[] {
  const items = loadCollection();
  const key = itemKey(card.id, variant);
  const existing = items.find((i) => itemKey(i.card.id, i.variant) === key);

  let next: CollectionItem[];
  if (existing) {
    next = items.map((i) =>
      itemKey(i.card.id, i.variant) === key ? { ...i, quantity: i.quantity + 1 } : i
    );
  } else {
    const newItem: CollectionItem = {
      id: `${key}-${Date.now()}`,
      card,
      variant,
      addedAt: Date.now(),
      quantity: 1,
    };
    next = [newItem, ...items];
  }
  saveCollection(next);
  return next;
}

export function removeOneFromCollection(itemId: string): CollectionItem[] {
  const items = loadCollection();
  const next = items
    .map((i) => (i.id === itemId ? { ...i, quantity: i.quantity - 1 } : i))
    .filter((i) => i.quantity > 0);
  saveCollection(next);
  return next;
}

export function deleteFromCollection(itemId: string): CollectionItem[] {
  const items = loadCollection().filter((i) => i.id !== itemId);
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
      const price = getPriceForVariant(item.card, item.variant);
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

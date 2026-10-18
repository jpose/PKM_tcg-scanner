import { CardVariant, CollectionItem, PokemonCard } from '../types';
import { fetchCardById, getPriceForVariant } from './pokemonTcg';

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
export type ItemPrice = { value: number; currency: 'EUR' | 'USD'; approx?: boolean; manual?: boolean };

/** Cote d'un exemplaire : celle saisie à la main si elle existe, sinon celle des bases. */
export function getItemPrice(item: CollectionItem): ItemPrice | null {
  if (typeof item.customPrice === 'number' && item.customPrice >= 0) {
    return { value: item.customPrice, currency: 'EUR', manual: true };
  }
  return getPriceForVariant(item.card, item.variant);
}

export function setCustomPrice(itemId: string, value: number | null): CollectionItem[] {
  const items = loadCollection().map((i) => {
    if (i.id !== itemId) return i;
    const { customPrice: _old, ...rest } = i;
    return value === null ? rest : { ...rest, customPrice: value };
  });
  saveCollection(items);
  return items;
}

export function getCollectionValue(items: CollectionItem[]): { eur: number; usd: number } {
  return items.reduce(
    (totals, item) => {
      const price = getItemPrice(item);
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

/**
 * Les cartes du classeur sont des copies enregistrées au moment du scan : leur
 * cote vieillit. Cette fonction recharge les prix actuels (par lots de 6).
 */
export async function refreshCollectionPrices(): Promise<CollectionItem[]> {
  const items = loadCollection();
  const ids = Array.from(new Set(items.map((i) => i.card.id)));
  const fresh = new Map<string, PokemonCard>();

  for (let i = 0; i < ids.length; i += 6) {
    await Promise.all(
      ids.slice(i, i + 6).map(async (id) => {
        const card = await fetchCardById(id);
        if (card) fresh.set(id, card);
      })
    );
  }

  const next = items.map((item) => {
    const f = fresh.get(item.card.id);
    return f
      ? {
          ...item,
          card: {
            ...item.card,
            pricing: f.pricing,
            variants: f.variants ?? item.card.variants,
            variants_detailed: f.variants_detailed ?? item.card.variants_detailed,
            image: f.image ?? item.card.image,
          },
        }
      : item;
  });
  saveCollection(next);
  return next;
}

/**
 * Fusionne une sauvegarde dans le classeur sans jamais créer de doublon :
 * une carte déjà présente garde la plus grande des deux quantités.
 * Réimporter deux fois le même fichier ne change donc rien.
 */
export function mergeIntoCollection(imported: CollectionItem[]): {
  items: CollectionItem[];
  added: number;
  updated: number;
} {
  const map = new Map(loadCollection().map((i) => [itemKey(i.card.id, i.variant), i]));
  let added = 0;
  let updated = 0;
  for (const inc of imported) {
    const key = itemKey(inc.card.id, inc.variant);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, inc);
      added++;
    } else {
      const quantity = Math.max(existing.quantity, inc.quantity);
      const customPrice = existing.customPrice ?? inc.customPrice;
      if (quantity !== existing.quantity || customPrice !== existing.customPrice) {
        map.set(key, { ...existing, quantity, customPrice });
        updated++;
      }
    }
  }
  const items = Array.from(map.values()).sort((a, b) => b.addedAt - a.addedAt);
  saveCollection(items);
  return { items, added, updated };
}

import { PokemonCard } from '../types';

// TCGdex : API Pokémon TCG gratuite, sans clé, activement maintenue.
// https://tcgdex.dev — remplace pokemontcg.io/Scrydex, dont les nouvelles
// inscriptions sont fermées (voir email de dépréciation reçu mi-2026).
const BASE_URL = 'https://api.tcgdex.net/v2';
const LANG = 'fr';

interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

/**
 * Recherche des cartes correspondant au nom identifié par l'IA, puis
 * récupère le détail complet (set, rareté, prix) des meilleurs candidats.
 */
export async function searchPokemonCards(params: {
  name: string;
  cardNumber?: string | null;
  setName?: string | null;
}): Promise<PokemonCard[]> {
  const { name, cardNumber, setName } = params;

  const listUrl = new URL(`${BASE_URL}/${LANG}/cards`);
  listUrl.searchParams.set('name', name);

  const listRes = await fetchWithRetry(listUrl.toString());
  if (!listRes.ok) {
    throw new Error(`Erreur API Pokémon TCG (${listRes.status})`);
  }
  const briefs: CardBrief[] = await listRes.json();

  if (!briefs || briefs.length === 0) return [];

  // Classe les résultats bruts selon le numéro de carte s'il est connu,
  // avant d'aller chercher le détail complet (pour limiter les appels).
  let ranked = briefs;
  if (cardNumber) {
    const num = cardNumber.split('/')[0].trim();
    ranked = [...ranked].sort((a, b) => {
      const aMatch = a.localId === num ? 1 : 0;
      const bMatch = b.localId === num ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  const topCandidates = ranked.slice(0, 8);

  const details = await Promise.all(
    topCandidates.map(async (brief) => {
      try {
        const res = await fetchWithRetry(`${BASE_URL}/${LANG}/cards/${brief.id}`);
        if (!res.ok) return null;
        return (await res.json()) as PokemonCard;
      } catch {
        return null;
      }
    })
  );

  let cards = details.filter((c): c is PokemonCard => c !== null);

  if (setName) {
    const setLower = setName.toLowerCase();
    cards = [...cards].sort((a, b) => {
      const aMatch = a.set?.name?.toLowerCase().includes(setLower) ? 1 : 0;
      const bMatch = b.set?.name?.toLowerCase().includes(setLower) ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  return cards;
}

/**
 * Construit l'URL d'image complète à partir de l'URL de base renvoyée
 * par l'API (qui n'a pas d'extension par défaut).
 */
export function buildCardImageUrl(
  card: Pick<PokemonCard, 'image'>,
  quality: 'high' | 'low' = 'high',
  extension: 'webp' | 'png' | 'jpg' = 'webp'
): string | null {
  if (!card.image) return null;
  return `${card.image}/${quality}.${extension}`;
}

/**
 * Extrait un prix de marché représentatif, avec sa devise, en tentant
 * plusieurs champs possibles (la forme exacte de "pricing" peut varier
 * selon le type de carte et la marketplace disponible).
 */
export function getBestPrice(
  card: PokemonCard
): { value: number; currency: 'EUR' | 'USD' } | null {
  const cardmarket = card.pricing?.cardmarket;
  if (cardmarket) {
    const value =
      cardmarket.trend ??
      cardmarket.avg30 ??
      cardmarket.avg7 ??
      cardmarket.avg1 ??
      cardmarket.avg ??
      cardmarket.low;
    if (typeof value === 'number') {
      return { value, currency: 'EUR' };
    }
  }

  const tcgplayer = card.pricing?.tcgplayer;
  if (tcgplayer) {
    for (const variant of Object.values(tcgplayer)) {
      if (variant && typeof variant === 'object') {
        const v = variant as Record<string, unknown>;
        const value = v.marketPrice ?? v.midPrice ?? v.lowPrice;
        if (typeof value === 'number') {
          return { value, currency: 'USD' };
        }
      }
    }
  }

  return null;
}

async function fetchWithRetry(url: string, attempts = 2): Promise<Response> {
  let lastRes: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url);
    if (res.ok) return res;
    lastRes = res;
    if (res.status < 500) break;
    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }
  return lastRes as Response;
}

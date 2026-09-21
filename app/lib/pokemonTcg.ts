import { CardVariant, PokemonCard } from '../types';

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

type Price = { value: number; currency: 'EUR' | 'USD' };

// Mots-clés associés à chaque variante, pour repérer la bonne clé quelle
// que soit sa forme exacte (les APIs de prix Pokémon ne sont jamais
// parfaitement homogènes d'une carte à l'autre).
const VARIANT_KEYWORDS: Record<CardVariant, string[]> = {
  normal: ['normal', 'regular', 'unlimited'],
  reverse: ['reverseholo', 'reverse'],
  holo: ['holofoil', 'holo'],
  firstEdition: ['1stedition', 'firstedition', '1steditionholofoil'],
};

function isVariantKey(key: string, variant: CardVariant): boolean {
  const lk = key.toLowerCase().replace(/[\s_-]/g, '');
  // "holo" est un sous-mot de "reverseholo" et de "1steditionholofoil" :
  // on exclut ces cas pour ne pas mélanger les variantes entre elles.
  if (variant === 'holo' && (lk.includes('reverse') || lk.includes('1st'))) {
    return false;
  }
  return VARIANT_KEYWORDS[variant].some((kw) => lk.includes(kw));
}

function extractNumericPrice(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    const candidate =
      v.marketPrice ?? v.market ?? v.midPrice ?? v.trend ?? v.trendPrice ??
      v.avg30 ?? v.avg7 ?? v.avg1 ?? v.avg ?? v.averageSellPrice ??
      v.sell ?? v.sellPrice ?? v.low ?? v.lowPrice;
    if (typeof candidate === 'number') return candidate;
  }
  return undefined;
}

/**
 * Cherche un prix pour une variante donnée dans un bloc "tcgplayer" ou
 * "cardmarket", en tentant plusieurs conventions de nommage :
 * 1) objets imbriqués par variante (ex: { holofoil: {...}, normal: {...} })
 * 2) champs plats préfixés par la variante (ex: reverseHoloTrend, reverseHoloSell)
 * 3) pour "normal" uniquement : champs plats non préfixés (trend, avg30...)
 */
function findVariantPrice(
  block: Record<string, unknown> | undefined,
  variant: CardVariant
): number | undefined {
  if (!block) return undefined;

  // 1) Objets imbriqués par variante
  for (const [key, value] of Object.entries(block)) {
    if (isVariantKey(key, variant) && value && typeof value === 'object') {
      const price = extractNumericPrice(value);
      if (price !== undefined) return price;
    }
  }

  // 2) Champs plats préfixés (ex: reverseHoloTrend: 2.5)
  for (const [key, value] of Object.entries(block)) {
    if (isVariantKey(key, variant) && typeof value === 'number') {
      return value;
    }
  }

  // 3) Pour la variante normale, retomber sur les champs plats génériques
  if (variant === 'normal') {
    const generic = extractNumericPrice(block);
    if (generic !== undefined) return generic;
  }

  return undefined;
}

/**
 * Extrait le prix d'une carte pour une variante précise (normale, reverse,
 * holo, 1ère édition), en essayant Cardmarket (EUR) puis TCGPlayer (USD).
 */
export function getPriceForVariant(card: PokemonCard, variant: CardVariant): Price | null {
  const cardmarketPrice = findVariantPrice(card.pricing?.cardmarket, variant);
  if (cardmarketPrice !== undefined) {
    return { value: cardmarketPrice, currency: 'EUR' };
  }

  const tcgplayerPrice = findVariantPrice(card.pricing?.tcgplayer, variant);
  if (tcgplayerPrice !== undefined) {
    return { value: tcgplayerPrice, currency: 'USD' };
  }

  return null;
}

/**
 * Prix "représentatif" toutes variantes confondues, utilisé dans les
 * résultats de recherche avant que l'utilisateur n'ait choisi une variante.
 */
export function getBestPrice(card: PokemonCard): Price | null {
  const order: CardVariant[] = ['normal', 'reverse', 'holo', 'firstEdition'];
  for (const variant of order) {
    const price = getPriceForVariant(card, variant);
    if (price) return price;
  }
  return null;
}

/**
 * Renvoie la liste des variantes réellement disponibles pour cette carte,
 * dans un ordre d'affichage cohérent. Si l'API ne précise rien, on
 * suppose prudemment que seule la version normale existe.
 */
export function getAvailableVariants(card: PokemonCard): CardVariant[] {
  const order: CardVariant[] = ['normal', 'reverse', 'holo', 'firstEdition'];
  if (!card.variants) return ['normal'];
  const available = order.filter((v) => card.variants?.[v]);
  return available.length > 0 ? available : ['normal'];
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

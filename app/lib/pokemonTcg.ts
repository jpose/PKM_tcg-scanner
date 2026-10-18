import { CardVariant, PokemonCard, VariantDetailed } from '../types';

// TCGdex : API Pokémon TCG gratuite, sans clé, activement maintenue.
// https://tcgdex.dev — remplace pokemontcg.io/Scrydex, dont les nouvelles
// inscriptions sont fermées (voir email de dépréciation reçu mi-2026).
const BASE_URL = 'https://api.tcgdex.net/v2';
const LANG = 'fr';

export interface CardBrief {
  id: string;
  localId: string;
  name: string;
  image?: string;
}

const LANGS = ['fr', 'en'] as const;
const detailCache = new Map<string, PokemonCard>();

export interface SetBrief {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  // official = total imprimé sur la carte (ex. 189 pour « 136/189 »)
  cardCount?: { total?: number; official?: number };
}
export type EditionOption = SetBrief & { briefs: CardBrief[] };

// Liste des éditions, chargée une seule fois par session. L'API la renvoie
// triée par date de sortie : on en garde l'ordre (Map conserve l'insertion).
const setsCache = new Map<string, Promise<Map<string, SetBrief>>>();
function fetchSets(lang: string): Promise<Map<string, SetBrief>> {
  let promise = setsCache.get(lang);
  if (!promise) {
    promise = (async () => {
      const res = await fetchWithRetry(`${BASE_URL}/${lang}/sets`);
      if (!res.ok) throw new Error(`Erreur API Pokémon TCG (${res.status})`);
      const list: SetBrief[] = await res.json();
      return new Map(list.map((set) => [set.id, set] as [string, SetBrief]));
    })();
    promise.catch(() => setsCache.delete(lang)); // on retentera au prochain scan
    setsCache.set(lang, promise);
  }
  return promise;
}
const safeSets = (lang: string) => fetchSets(lang).catch(() => new Map<string, SetBrief>());

// L'identifiant d'une carte est « <édition>-<numéro> », ex. "swsh3-136".
const setIdOf = (cardId: string) => cardId.slice(0, cardId.lastIndexOf('-'));

// "004/102" et "4" désignent la même carte : on neutralise les zéros initiaux.
export function normalizeNumber(n?: string | null): string {
  return (n ?? '').split('/')[0].trim().replace(/^0+(?=\d)/, '').toLowerCase();
}

// "136/189" → numéro 136 et total imprimé 189 (qui identifie l'édition).
function parseCardNumber(raw?: string | null): { num: string; total: number | null } {
  const total = Number((raw ?? '').split('/')[1]?.replace(/\D/g, '') ?? '');
  return { num: normalizeNumber(raw), total: total > 0 ? total : null };
}

async function fetchBriefs(lang: string, name: string): Promise<CardBrief[]> {
  const url = new URL(`${BASE_URL}/${lang}/cards`);
  url.searchParams.set('name', name);
  const res = await fetchWithRetry(url.toString());
  if (!res.ok) throw new Error(`Erreur API Pokémon TCG (${res.status})`);
  const list = await res.json();
  return Array.isArray(list) ? list : [];
}

// Une recherche déjà faite (même nom, même langue) n'est pas redemandée à l'API.
const briefsCache = new Map<string, Promise<CardBrief[]>>();
function listBriefs(lang: string, name: string): Promise<CardBrief[]> {
  const key = `${lang}:${name.trim().toLowerCase()}`;
  let promise = briefsCache.get(key);
  if (!promise) {
    promise = fetchBriefs(lang, name);
    promise.catch(() => briefsCache.delete(key)); // un échec n'est pas mémorisé
    briefsCache.set(key, promise);
  }
  return promise;
}

async function fetchDetail(lang: string, id: string, fresh = false): Promise<PokemonCard | null> {
  const key = `${lang}:${id}`;
  if (!fresh) {
    const cached = detailCache.get(key);
    if (cached) return cached;
  }
  try {
    const res = await fetchWithRetry(`${BASE_URL}/${lang}/cards/${id}`);
    if (!res.ok) return null;
    const card = (await res.json()) as PokemonCard;
    detailCache.set(key, card);
    return card;
  } catch {
    return null;
  }
}

// Les visuels dépendent de la langue : une carte récente peut avoir son scan en
// anglais mais pas encore en français. La carte est la même : on emprunte l'image.
const IMAGE_FALLBACK_LANGS = ['en', 'de', 'es', 'it'];
const imageBorrowCache = new Map<string, string | null>();

export async function withImage(card: PokemonCard, lang: string): Promise<PokemonCard> {
  if (card.image) return card;
  if (!imageBorrowCache.has(card.id)) {
    const others = await Promise.all(
      IMAGE_FALLBACK_LANGS.filter((l) => l !== lang).map((l) => fetchDetail(l, card.id))
    );
    imageBorrowCache.set(card.id, others.find((c) => c?.image)?.image ?? null);
  }
  const borrowed = imageBorrowCache.get(card.id);
  return borrowed ? { ...card, image: borrowed } : card;
}

/** Charge les fiches complètes (prix, variantes, image) en parallèle, avec cache. */
export async function loadDetails(lang: string, briefs: CardBrief[], limit = 12): Promise<PokemonCard[]> {
  const details = await Promise.all(
    briefs.slice(0, limit).map(async (brief) => {
      const card = await fetchDetail(lang, brief.id);
      return card ? withImage(card, lang) : null;
    })
  );
  return details.filter((c): c is PokemonCard => c !== null);
}

/**
 * Recherche automatique après scan. Les candidats sont classés avec trois
 * indices : le numéro lu, le total imprimé (qui désigne l'édition) et le nom
 * d'extension éventuellement lu. Le total est le plus discriminant.
 */
export async function searchPokemonCards(params: {
  name: string;
  cardNumber?: string | null;
  setName?: string | null;
}): Promise<PokemonCard[]> {
  for (const lang of LANGS) {
    const cards = await searchInLang(lang, params);
    if (cards.length > 0) return cards;
  }
  return [];
}

async function searchInLang(
  lang: string,
  params: { name: string; cardNumber?: string | null; setName?: string | null }
): Promise<PokemonCard[]> {
  const [briefs, sets] = await Promise.all([listBriefs(lang, params.name), safeSets(lang)]);
  if (briefs.length === 0) return [];

  const { num, total } = parseCardNumber(params.cardNumber);
  const setLower = params.setName?.trim().toLowerCase();

  const score = (b: CardBrief): number => {
    const set = sets.get(setIdOf(b.id));
    let points = 0;
    if (num && normalizeNumber(b.localId) === num) points += 2;
    if (total && set?.cardCount?.official === total) points += 3;
    if (setLower && set?.name?.toLowerCase().includes(setLower)) points += 1;
    return points;
  };

  const ranked = briefs
    .map((b) => ({ b, s: score(b) }))
    .sort((x, y) => y.s - x.s)
    .map((x) => x.b);

  return loadDetails(lang, ranked, 6);
}

/**
 * Correction manuelle : liste les éditions où existe une carte de ce nom, avec
 * leur logo. Si un numéro est saisi, seules les éditions où la carte porte ce
 * numéro sont proposées (exact = true).
 */
export async function findEditions(
  name: string,
  numberInput: string
): Promise<{ lang: string; editions: EditionOption[]; exact: boolean }> {
  const { num, total } = parseCardNumber(numberInput);

  for (const lang of LANGS) {
    const [briefs, sets] = await Promise.all([listBriefs(lang, name), safeSets(lang)]);
    if (briefs.length === 0) continue;

    const order = Array.from(sets.keys());
    const bySet = new Map<string, CardBrief[]>();
    for (const b of briefs) {
      const id = setIdOf(b.id);
      if (!bySet.has(id)) bySet.set(id, []);
      bySet.get(id)!.push(b);
    }

    let editions: EditionOption[] = Array.from(bySet.entries()).map(([id, list]) => ({
      ...(sets.get(id) ?? { id, name: id }),
      briefs: list,
    }));

    let exact = false;
    if (num) {
      const matching = editions
        .map((e) => ({ ...e, briefs: e.briefs.filter((b) => normalizeNumber(b.localId) === num) }))
        .filter((e) => e.briefs.length > 0);
      if (matching.length > 0) {
        editions = matching;
        exact = true;
      }
    }

    // Le total imprimé d'abord, puis les éditions les plus récentes.
    editions.sort(
      (a, b) =>
        Number(!!total && b.cardCount?.official === total) - Number(!!total && a.cardCount?.official === total) ||
        order.indexOf(b.id) - order.indexOf(a.id)
    );
    return { lang, editions, exact };
  }
  return { lang: 'fr', editions: [], exact: false };
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

// approx = prix d'une variante voisine, utilisé faute de prix exact pour celle-ci
type Price = { value: number; currency: 'EUR' | 'USD'; approx?: boolean };

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

// Champs plats de Cardmarket : les suffixes « -holo » (trend-holo, avg30-holo…)
// portent le prix de la version brillante, reverse comme holo.
function isFlatVariantKey(key: string, variant: CardVariant): boolean {
  const lk = key.toLowerCase().replace(/[\s_-]/g, '');
  if (variant === 'firstEdition') return lk.includes('1st');
  if (variant === 'reverse' || variant === 'holo') return lk.includes('holo') && !lk.includes('1st');
  return false;
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

  // 2) Champs plats (ex: "trend-holo", reverseHoloTrend), le plus représentatif d'abord
  const RANK = ['trend', 'market', 'avg30', 'avg7', 'avg1', 'avg', 'mid', 'sell', 'low'];
  const rankOf = (k: string) => {
    const lk = k.toLowerCase();
    const i = RANK.findIndex((r) => lk.includes(r));
    return i === -1 ? 99 : i;
  };
  const flat = Object.entries(block)
    .filter(([key, value]) => isFlatVariantKey(key, variant) && typeof value === 'number')
    .sort((a, b) => rankOf(a[0]) - rankOf(b[0]));
  if (flat.length > 0) return flat[0][1] as number;

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
const isFirstEdition = (v: VariantDetailed) =>
  !!v.stamp?.some((st) => st.toLowerCase().replace(/[\s_-]/g, '').includes('1stedition'));

function detailedMatches(v: VariantDetailed, variant: CardVariant): boolean {
  if (variant === 'firstEdition') return isFirstEdition(v);
  return v.type === variant && !isFirstEdition(v);
}

// Une carte sans version « normale » (ex. promo uniquement holo) : son prix
// Cardmarket est dans les champs génériques (trend, avg…), pas dans « -holo ».
function isSoleVariant(card: PokemonCard): boolean {
  if (card.variants) return card.variants.normal !== true;
  if (card.variants_detailed) return !card.variants_detailed.some((v) => v.type === 'normal');
  return false;
}

function priceFromBlocks(
  cardmarket: Record<string, any> | null | undefined,
  tcgplayer: Record<string, any> | null | undefined,
  variant: CardVariant,
  sole: boolean,
  own: boolean // true : bloc de cotes propre à cette version (variants_detailed)
): Price | null {
  // Champs génériques (trend, avg…) = prix de cette version seulement si elle est la
  // seule de la carte, ou si c'est une 1ère édition dotée de son propre produit.
  const genericOk = variant !== 'normal' && (sole || (own && variant === 'firstEdition'));

  let eur = findVariantPrice(cardmarket ?? undefined, variant);
  if (eur === undefined && genericOk) eur = extractNumericPrice(cardmarket ?? undefined);
  if (eur !== undefined) return { value: eur, currency: 'EUR' };

  let usd = findVariantPrice(tcgplayer ?? undefined, variant);
  if (usd === undefined && genericOk && tcgplayer) {
    for (const nested of Object.values(tcgplayer)) {
      const n = extractNumericPrice(nested);
      if (n !== undefined) {
        usd = n;
        break;
      }
    }
  }
  return usd !== undefined ? { value: usd, currency: 'USD' } : null;
}

function strictPrice(card: PokemonCard, variant: CardVariant): Price | null {
  const sole = isSoleVariant(card);

  // 1) La cote propre à cette version, publiée par TCGdex (variants_detailed)
  for (const v of card.variants_detailed ?? []) {
    if (!detailedMatches(v, variant)) continue;
    const price = priceFromBlocks(v.pricing?.cardmarket, v.pricing?.tcgplayer, variant, sole, true);
    if (price) return price;
  }
  // 2) La cote globale de la carte
  return priceFromBlocks(card.pricing?.cardmarket, card.pricing?.tcgplayer, variant, sole, false);
}

// Si la variante exacte n'a pas de prix, on prend la plus proche (marquée "approx")
// plutôt que de ne rien afficher : une cote approximative vaut mieux que « n.c. ».
const FALLBACK_ORDER: Record<CardVariant, CardVariant[]> = {
  normal: ['normal', 'reverse', 'holo', 'firstEdition'],
  reverse: ['reverse', 'holo', 'normal', 'firstEdition'],
  holo: ['holo', 'reverse', 'firstEdition', 'normal'],
  firstEdition: ['firstEdition'], // jamais le prix d'une autre version : l'écart est trop grand
};

export function getPriceForVariant(card: PokemonCard, variant: CardVariant): Price | null {
  const order = FALLBACK_ORDER[variant];
  for (let i = 0; i < order.length; i++) {
    const price = strictPrice(card, order[i]);
    if (price) return i === 0 ? price : { ...price, approx: true };
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
    const price = strictPrice(card, variant);
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

/** Recharge une fiche complète (cotes à jour, image) à partir de son identifiant. */
export async function fetchCardById(id: string): Promise<PokemonCard | null> {
  for (const lang of LANGS) {
    const card = await fetchDetail(lang, id, true);
    if (card) return withImage(card, lang);
  }
  return null;
}

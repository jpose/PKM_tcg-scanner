import { PokemonTCGCard } from '../types';

const BASE_URL = 'https://api.pokemontcg.io/v2/cards';

function buildHeaders(): HeadersInit {
  const key = process.env.NEXT_PUBLIC_POKEMONTCG_API_KEY;
  return key ? { 'X-Api-Key': key } : {};
}

/**
 * Recherche des cartes correspondant au nom (et optionnellement au numéro / extension)
 * identifiés par l'IA. Renvoie les meilleurs candidats.
 */
export async function searchPokemonCards(params: {
  name: string;
  cardNumber?: string | null;
  setName?: string | null;
}): Promise<PokemonTCGCard[]> {
  const { name, cardNumber, setName } = params;

  const queryParts: string[] = [`name:"${escapeLucene(name)}"`];

  const url = new URL(BASE_URL);
  url.searchParams.set('q', queryParts.join(' '));
  url.searchParams.set('pageSize', '20');
  url.searchParams.set('orderBy', '-set.releaseDate');

  const res = await fetch(url.toString(), { headers: buildHeaders() });
  if (!res.ok) {
    throw new Error(`Erreur API Pokémon TCG (${res.status})`);
  }
  const data = await res.json();
  let cards: PokemonTCGCard[] = data.data || [];

  // Affine le classement si on a un numéro ou un nom d'extension
  if (cardNumber) {
    const num = cardNumber.split('/')[0].trim();
    cards = [...cards].sort((a, b) => {
      const aMatch = a.number === num ? 1 : 0;
      const bMatch = b.number === num ? 1 : 0;
      return bMatch - aMatch;
    });
  }
  if (setName) {
    const setLower = setName.toLowerCase();
    cards = [...cards].sort((a, b) => {
      const aMatch = a.set.name.toLowerCase().includes(setLower) ? 1 : 0;
      const bMatch = b.set.name.toLowerCase().includes(setLower) ? 1 : 0;
      return bMatch - aMatch;
    });
  }

  return cards;
}

function escapeLucene(value: string): string {
  return value.replace(/["\\]/g, '\\$&');
}

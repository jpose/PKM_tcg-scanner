export interface IdentifiedCard {
  name: string;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface PokemonTCGCard {
  id: string;
  name: string;
  supertype: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  rarity?: string;
  number: string;
  set: {
    id: string;
    name: string;
    series: string;
    releaseDate: string;
    images: {
      symbol: string;
      logo: string;
    };
  };
  images: {
    small: string;
    large: string;
  };
  tcgplayer?: {
    url: string;
    prices?: Record<
      string,
      {
        low?: number;
        mid?: number;
        high?: number;
        market?: number;
      }
    >;
  };
}

export interface CollectionItem {
  id: string; // unique local id
  card: PokemonTCGCard;
  addedAt: number;
  quantity: number;
}

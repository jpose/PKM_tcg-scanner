export interface IdentifiedCard {
  name: string;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export type CardVariant = 'normal' | 'reverse' | 'holo' | 'firstEdition';

export const VARIANT_LABELS: Record<CardVariant, string> = {
  normal: 'Normale',
  reverse: 'Reverse',
  holo: 'Holo',
  firstEdition: '1ère édition',
};

// Format d'une carte tel que renvoyé par l'API TCGdex (api.tcgdex.net)
// Champs volontairement optionnels/larges : l'API évolue et tous les
// champs ne sont pas garantis sur toutes les cartes (Pokémon/Dresseur/Énergie).
// Une version précise de la carte (normale, reverse, holo…), avec sa propre cote.
export interface VariantDetailed {
  type: string;
  stamp?: string[];
  thirdParty?: { cardmarket?: number; tcgplayer?: number };
  pricing?: {
    cardmarket?: Record<string, any> | null;
    tcgplayer?: Record<string, any> | null;
  };
}

export interface PokemonCard {
  id: string;
  localId: string;
  name: string;
  category?: string;
  illustrator?: string;
  rarity?: string;
  hp?: number;
  types?: string[];
  // URL de base de l'image, sans extension : voir buildCardImageUrl()
  image?: string;
  set: {
    id: string;
    name: string;
    logo?: string;
    symbol?: string;
  };
  // Quelles variantes existent physiquement pour cette carte précise.
  variants?: Partial<Record<CardVariant, boolean>>;
  variants_detailed?: VariantDetailed[];
  pricing?: {
    cardmarket?: Record<string, any> | null;
    tcgplayer?: Record<string, any> | null;
  };
}

export interface CollectionItem {
  id: string; // identifiant local unique (carte + variante)
  card: PokemonCard;
  variant: CardVariant;
  addedAt: number;
  quantity: number;
  // Cote saisie à la main (en €), prioritaire sur celle des bases de données.
  customPrice?: number;
}

export interface IdentifiedCard {
  name: string;
  setName: string | null;
  cardNumber: string | null;
  rarity: string | null;
  confidence: 'high' | 'medium' | 'low';
}

// Format d'une carte tel que renvoyé par l'API TCGdex (api.tcgdex.net)
// Champs volontairement optionnels/larges : l'API évolue et tous les
// champs ne sont pas garantis sur toutes les cartes (Pokémon/Dresseur/Énergie).
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
  pricing?: {
    cardmarket?: Record<string, any>;
    tcgplayer?: Record<string, any>;
  };
}

export interface CollectionItem {
  id: string; // identifiant local unique
  card: PokemonCard;
  addedAt: number;
  quantity: number;
}

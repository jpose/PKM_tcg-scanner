'use client';

import Image from 'next/image';
import { PokemonTCGCard } from '../types';

interface Props {
  cards: PokemonTCGCard[];
  onAdd: (card: PokemonTCGCard) => void;
  onDismiss: () => void;
}

function formatPrice(card: PokemonTCGCard): string | null {
  const prices = card.tcgplayer?.prices;
  if (!prices) return null;
  const group = Object.values(prices)[0];
  const value = group?.market ?? group?.mid;
  if (!value) return null;
  return `${value.toFixed(2)} $`;
}

export default function CardResults({ cards, onAdd, onDismiss }: Props) {
  if (cards.length === 0) {
    return (
      <div className="w-full max-w-md mx-auto mt-6 text-center bg-white rounded-xl p-6 card-shadow">
        <p className="text-gray-600">
          Aucune carte correspondante trouvée. Essayez une photo plus nette, bien
          cadrée sur la carte entière.
        </p>
        <button
          onClick={onDismiss}
          className="mt-4 px-4 py-2 rounded-lg bg-poke-blue text-white text-sm"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto mt-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-lg">Résultats</h2>
        <button onClick={onDismiss} className="text-sm text-gray-500 underline">
          Fermer
        </button>
      </div>
      <div className="space-y-3">
        {cards.slice(0, 5).map((card) => (
          <div
            key={card.id}
            className="flex items-center gap-3 bg-white rounded-xl p-3 card-shadow"
          >
            <div className="relative w-16 h-22 flex-shrink-0">
              <Image
                src={card.images.small}
                alt={card.name}
                width={64}
                height={89}
                className="rounded-md object-contain"
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{card.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {card.set.name} · #{card.number}
              </p>
              {card.rarity && (
                <p className="text-xs text-gray-400 truncate">{card.rarity}</p>
              )}
              {formatPrice(card) && (
                <p className="text-xs font-semibold text-green-600 mt-0.5">
                  {formatPrice(card)}
                </p>
              )}
            </div>
            <button
              onClick={() => onAdd(card)}
              className="flex-shrink-0 px-3 py-2 rounded-lg bg-poke-yellow text-poke-dark text-sm font-semibold active:scale-95 transition-transform"
            >
              Ajouter
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

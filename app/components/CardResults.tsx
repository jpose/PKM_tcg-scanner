'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CardVariant, PokemonCard, VARIANT_LABELS } from '../types';
import { buildCardImageUrl, getAvailableVariants, getBestPrice } from '../lib/pokemonTcg';

interface Props {
  cards: PokemonCard[];
  onAdd: (card: PokemonCard, variant: CardVariant) => void;
  onDismiss: () => void;
}

function formatPrice(card: PokemonCard): string | null {
  const price = getBestPrice(card);
  if (!price) return null;
  return price.currency === 'EUR'
    ? `${price.value.toFixed(2)} €`
    : `$${price.value.toFixed(2)}`;
}

export default function CardResults({ cards, onAdd, onDismiss }: Props) {
  const [pickingVariantFor, setPickingVariantFor] = useState<string | null>(null);

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

  function handleAddClick(card: PokemonCard) {
    const variants = getAvailableVariants(card);
    if (variants.length <= 1) {
      onAdd(card, variants[0]);
      return;
    }
    setPickingVariantFor(card.id);
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
        {cards.slice(0, 5).map((card) => {
          const imageUrl = buildCardImageUrl(card, 'low', 'webp');
          const isPickingVariant = pickingVariantFor === card.id;
          const variants = getAvailableVariants(card);

          return (
            <div
              key={card.id}
              className="bg-white rounded-xl p-3 card-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="relative w-16 h-22 flex-shrink-0">
                  {imageUrl && (
                    <Image
                      src={imageUrl}
                      alt={card.name}
                      width={64}
                      height={89}
                      className="rounded-md object-contain"
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{card.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {card.set?.name} · #{card.localId}
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
                {!isPickingVariant && (
                  <button
                    onClick={() => handleAddClick(card)}
                    className="flex-shrink-0 px-3 py-2 rounded-lg bg-poke-yellow text-poke-dark text-sm font-semibold active:scale-95 transition-transform"
                  >
                    Ajouter
                  </button>
                )}
              </div>

              {isPickingVariant && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">Quelle version avez-vous ?</p>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((variant) => (
                      <button
                        key={variant}
                        onClick={() => {
                          onAdd(card, variant);
                          setPickingVariantFor(null);
                        }}
                        className="px-3 py-1.5 rounded-full bg-poke-blue/10 text-poke-blue text-xs font-medium hover:bg-poke-blue/20"
                      >
                        {VARIANT_LABELS[variant]}
                      </button>
                    ))}
                    <button
                      onClick={() => setPickingVariantFor(null)}
                      className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 text-xs"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

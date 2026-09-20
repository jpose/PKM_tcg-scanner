'use client';

import Image from 'next/image';
import { CollectionItem } from '../types';
import { buildCardImageUrl } from '../lib/pokemonTcg';

interface Props {
  items: CollectionItem[];
  onRemoveOne: (cardId: string) => void;
  onDelete: (cardId: string) => void;
}

export default function CollectionGrid({ items, onRemoveOne, onDelete }: Props) {
  if (items.length === 0) {
    return (
      <p className="text-center text-gray-500 mt-6">
        Votre collection est vide pour l’instant. Scannez une carte pour commencer !
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-6 max-w-3xl mx-auto px-2">
      {items.map((item) => {
        const imageUrl = buildCardImageUrl(item.card, 'low', 'webp');
        return (
          <div
            key={item.id}
            className="bg-white rounded-xl p-2 card-shadow flex flex-col items-center"
          >
            <div className="relative w-full aspect-[2/3]">
              {imageUrl && (
                <Image
                  src={imageUrl}
                  alt={item.card.name}
                  fill
                  className="object-contain rounded-md"
                  sizes="200px"
                />
              )}
              {item.quantity > 1 && (
                <span className="absolute top-1 right-1 bg-poke-red text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
                  x{item.quantity}
                </span>
              )}
            </div>
            <p className="text-sm font-medium mt-2 text-center truncate w-full">
              {item.card.name}
            </p>
            <p className="text-xs text-gray-400 truncate w-full text-center">
              {item.card.set?.name}
            </p>
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => onRemoveOne(item.card.id)}
                className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
              >
                -1
              </button>
              <button
                onClick={() => onDelete(item.card.id)}
                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100"
              >
                Suppr.
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

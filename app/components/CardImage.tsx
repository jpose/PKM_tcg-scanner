'use client';

import { useState } from 'react';
import Image from 'next/image';
import { PokemonCard } from '../types';
import { buildCardImageUrl } from '../lib/pokemonTcg';
import Pokeball from './Pokeball';

// Affiche l'image de la carte, ou un cadre de remplacement lisible quand TCGdex
// n'a pas (encore) de scan : la mise en page ne casse plus et la carte reste identifiable.
export default function CardImage({
  card,
  quality = 'low',
  rounded = 'rounded-[7px]',
  className = '',
}: {
  card: PokemonCard;
  quality?: 'low' | 'high';
  rounded?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = buildCardImageUrl(card, quality, 'webp');

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${card.name} : image indisponible`}
        className={`grid aspect-[63/88] w-full place-items-center border-2 border-dashed border-ink/30 bg-white p-1.5 text-center ${rounded} ${className}`}
      >
        <span className="flex flex-col items-center gap-1">
          <Pokeball size={26} muted />
          <span className="text-[11px] font-extrabold leading-tight">{card.name}</span>
          <span className="text-[10px] font-bold text-ink/55">Image indisponible</span>
        </span>
      </div>
    );
  }

  const [w, h] = quality === 'high' ? [600, 838] : [245, 342];
  return (
    <Image
      src={src}
      alt={card.name}
      width={w}
      height={h}
      unoptimized
      onError={() => setFailed(true)}
      className={`h-auto w-full ${rounded} ${className}`}
    />
  );
}

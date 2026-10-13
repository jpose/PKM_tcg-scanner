'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CardVariant, PokemonCard, VARIANT_LABELS } from '../types';
import { buildCardImageUrl, getAvailableVariants, getBestPrice } from '../lib/pokemonTcg';
import { formatPrice, typeStyle } from '../lib/ui';

interface Props {
  cards: PokemonCard[];
  identified: { name: string; cardNumber: string | null } | null;
  onAdd: (card: PokemonCard, variant: CardVariant) => void;
  onDismiss: () => void;
}

export default function CardResults({ cards, identified, onAdd, onDismiss }: Props) {
  const [picking, setPicking] = useState<string | null>(null);

  if (cards.length === 0) {
    return (
      <div className="panel mx-auto mt-6 max-w-sm p-5 text-center">
        <p className="font-display text-lg">Carte introuvable</p>
        <p className="mt-1 text-sm font-semibold text-ink/70">
          {identified
            ? `J’ai lu « ${identified.name} » mais rien ne correspond dans la base.`
            : 'Je n’ai pas reconnu de carte Pokémon sur cette image.'}{' '}
          Essayez avec plus de lumière, sans reflet.
        </p>
        <button onClick={onDismiss} className="btn-chunky mt-4 bg-pika">
          Scanner à nouveau
        </button>
      </div>
    );
  }

  function handleAdd(card: PokemonCard) {
    const variants = getAvailableVariants(card);
    if (variants.length === 1) onAdd(card, variants[0]);
    else setPicking(card.id);
  }

  return (
    <section className="mx-auto mt-6 w-full max-w-sm" aria-label="Cartes trouvées">
      <div className="mb-2 flex items-end justify-between px-1">
        <div>
          <p className="text-xs font-bold text-ink/60">Carte lue</p>
          <p className="font-display text-lg leading-tight">
            {identified?.name}
            {identified?.cardNumber && (
              <span className="ml-2 font-sans text-sm font-extrabold text-ink/60">{identified.cardNumber}</span>
            )}
          </p>
        </div>
        <button onClick={onDismiss} className="text-sm font-extrabold text-ink/60 underline">
          Fermer
        </button>
      </div>

      <ul className="space-y-3">
        {cards.slice(0, 5).map((card, index) => {
          const img = buildCardImageUrl(card, 'low', 'webp');
          const variants = getAvailableVariants(card);
          const price = formatPrice(getBestPrice(card));
          const type = card.types?.[0];
          const ts = typeStyle(type);

          return (
            <li key={card.id} className="panel p-3">
              <div className="flex items-center gap-3">
                <div className="w-[58px] shrink-0">
                  {img && (
                    <Image src={img} alt="" width={245} height={342} unoptimized className="h-auto w-full rounded-md" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {index === 0 && (
                    <span className="mb-1 inline-block rounded-md bg-dex px-1.5 py-0.5 text-[11px] font-extrabold text-white">
                      Meilleur résultat
                    </span>
                  )}
                  <p className="truncate font-extrabold leading-tight">{card.name}</p>
                  <p className="truncate text-xs font-semibold text-ink/65">
                    {card.set?.name} · n° {card.localId}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {type && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px] font-extrabold"
                        style={{ background: ts.bg, color: ts.fg }}
                      >
                        {type}
                      </span>
                    )}
                    {card.rarity && <span className="text-[11px] font-bold text-ink/55">{card.rarity}</span>}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {price && <span className="font-display text-sm">{price}</span>}
                  {picking !== card.id && (
                    <button onClick={() => handleAdd(card)} className="btn-chunky bg-pika">
                      Ajouter
                    </button>
                  )}
                </div>
              </div>

              {picking === card.id && (
                <div className="mt-3 border-t-2 border-dashed border-ink/15 pt-3">
                  <p className="mb-2 text-xs font-extrabold text-ink/65">Quelle version possédez-vous ?</p>
                  <div className="flex flex-wrap gap-2">
                    {variants.map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          onAdd(card, v);
                          setPicking(null);
                        }}
                        className="btn-chunky bg-white"
                      >
                        {VARIANT_LABELS[v]}
                      </button>
                    ))}
                    <button onClick={() => setPicking(null)} className="px-2 text-sm font-bold text-ink/55">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

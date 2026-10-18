'use client';

import { useEffect, useRef, useState } from 'react';
import CardImage from './CardImage';
import { CollectionItem, VARIANT_LABELS } from '../types';
import { getItemPrice } from '../lib/collection';
import { displayRarity, foilClass, formatPrice, typeStyle } from '../lib/ui';

interface Props {
  item: CollectionItem;
  onClose: () => void;
  onAddOne: (id: string) => void;
  onRemoveOne: (id: string) => void;
  onDelete: (id: string) => void;
  onSetPrice: (id: string, value: number | null) => void;
}

// Libellés des champs de prix. On reste volontairement tolérant : on n'affiche
// que les nombres reconnus, quelle que soit la forme exacte renvoyée par l'API.
const CARDMARKET_LABELS: [RegExp, string][] = [
  [/avg30/i, 'Moyenne 30 jours'],
  [/avg7/i, 'Moyenne 7 jours'],
  [/avg1(?!\d)/i, 'Moyenne 1 jour'],
  [/avg/i, 'Moyenne'],
  [/trend/i, 'Tendance'],
  [/low/i, 'Prix le plus bas'],
];
const TCGPLAYER_LABELS: Record<string, string> = {
  marketPrice: 'Marché',
  midPrice: 'Moyen',
  lowPrice: 'Bas',
  highPrice: 'Haut',
  directLowPrice: 'Direct bas',
};

function variantFromKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('1st')) return '1ère édition';
  if (k.includes('reverse')) return 'Reverse';
  if (k.includes('holo')) return 'Holo';
  return 'Normale';
}

function cardmarketRows(block?: Record<string, any> | null) {
  if (!block) return [];
  const rows: { label: string; value: number }[] = [];
  for (const [key, value] of Object.entries(block)) {
    if (typeof value !== 'number') continue;
    const hit = CARDMARKET_LABELS.find(([re]) => re.test(key));
    if (hit) rows.push({ label: hit[1] + (/holo/i.test(key) ? ' (holo / reverse)' : ''), value });
  }
  return rows;
}

function tcgplayerGroups(block?: Record<string, any> | null) {
  if (!block) return [];
  const groups: { title: string; rows: { label: string; value: number }[] }[] = [];
  for (const [key, value] of Object.entries(block)) {
    if (!value || typeof value !== 'object') continue;
    const rows = Object.entries(value as Record<string, unknown>)
      .filter(([k, v]) => typeof v === 'number' && TCGPLAYER_LABELS[k])
      .map(([k, v]) => ({ label: TCGPLAYER_LABELS[k], value: v as number }));
    if (rows.length > 0) groups.push({ title: variantFromKey(key), rows });
  }
  return groups;
}

const money = (n: number, cur: 'EUR' | 'USD') =>
  `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur === 'EUR' ? '€' : '$'}`;

function updatedLabel(block?: Record<string, any> | null): string | null {
  const d = block?.updated ? new Date(block.updated) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('fr-FR') : null;
}

export default function CardDetail({ item, onClose, onAddOne, onRemoveOne, onDelete, onSetPrice }: Props) {
  const { card, variant } = item;
  const [draft, setDraft] = useState(item.customPrice !== undefined ? String(item.customPrice).replace('.', ',') : '');
  const [draftError, setDraftError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const price = getItemPrice(item);
  const cm = card.pricing?.cardmarket;
  const tcg = card.pricing?.tcgplayer;
  const cmRows = cardmarketRows(cm);
  const tcgGroups = tcgplayerGroups(tcg);
  const type = card.types?.[0];
  const ts = typeStyle(type);

  function saveCustomPrice(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(draft.trim().replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(value) || value < 0 || value > 1_000_000) {
      setDraftError(true);
      return;
    }
    setDraftError(false);
    onSetPrice(item.id, Math.round(value * 100) / 100);
  }

  const facts: [string, string | number | undefined][] = [
    ['Édition', card.set?.name],
    ['Numéro', card.localId],
    ['Rareté', displayRarity(card.rarity)],
    ['Catégorie', card.category],
    ['PV', card.hp],
    ['Illustrateur', card.illustrator],
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/60 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Fiche de ${card.name}`}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[92svh] w-full max-w-md overflow-y-auto rounded-t-3xl border-2 border-ink bg-sleeve pb-[env(safe-area-inset-bottom)] sm:rounded-3xl"
      >
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Fermer la fiche"
          className="btn-chunky sticky right-0 top-3 z-10 float-right mr-3 mt-3 h-9 w-9 bg-white !p-0"
        >
          ✕
        </button>

        <div className="px-5 pb-6 pt-5">
          <div className={`mx-auto w-56 ${foilClass(variant)}`}>
            <CardImage card={card} quality="high" rounded="rounded-[10px]" />
          </div>

          <h2 className="mt-4 text-center font-display text-2xl leading-tight">{card.name}</h2>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5">
            {type && (
              <span className="rounded-full px-2.5 py-0.5 text-xs font-extrabold" style={{ background: ts.bg, color: ts.fg }}>
                {type}
              </span>
            )}
            <span className="rounded-full border-2 border-ink bg-white px-2.5 py-0.5 text-xs font-extrabold">
              {VARIANT_LABELS[variant]}
            </span>
          </div>

          {/* Votre exemplaire */}
          <div className="panel mt-5 p-4">
            <p className="text-xs font-extrabold text-ink/60">Votre exemplaire ({VARIANT_LABELS[variant]})</p>
            <p className="font-display text-3xl">{formatPrice(price) ?? 'Cote indisponible'}</p>
            {price?.approx && (
              <p className="text-xs font-semibold text-ink/60">Estimation : prix de la version la plus proche.</p>
            )}
            {price?.manual && <p className="text-xs font-semibold text-ink/60">Cote saisie par vous.</p>}
            {!price && (
              <p className="text-xs font-semibold text-ink/60">
                Aucune cote n’existe pour cette carte dans la base (fréquent pour les promos récentes). Vous pouvez saisir la vôtre.
              </p>
            )}
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex items-center rounded-lg border-2 border-ink/25 bg-white">
                <button
                  onClick={() => {
                    if (item.quantity > 1 || window.confirm('Retirer cette carte du classeur ?')) onRemoveOne(item.id);
                  }}
                  aria-label="Retirer un exemplaire"
                  className="grid h-9 w-10 place-items-center text-lg font-extrabold active:bg-ink/10"
                >
                  −
                </button>
                <span className="min-w-[2.5rem] text-center text-sm font-extrabold">×{item.quantity}</span>
                <button
                  onClick={() => onAddOne(item.id)}
                  aria-label="Ajouter un exemplaire"
                  className="grid h-9 w-10 place-items-center text-lg font-extrabold active:bg-ink/10"
                >
                  +
                </button>
              </div>
              {price && (
                <p className="text-right text-sm font-extrabold">
                  Total : {formatPrice({ ...price, value: price.value * item.quantity })}
                </p>
              )}
            </div>
            <form onSubmit={saveCustomPrice} className="mt-3 border-t-2 border-dashed border-ink/15 pt-3">
              <label htmlFor="custom-price" className="text-xs font-extrabold text-ink/60">
                {price && !price.manual ? 'Utiliser ma propre cote (€)' : 'Ma cote par exemplaire (€)'}
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="custom-price"
                  inputMode="decimal"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setDraftError(false);
                  }}
                  placeholder="ex. 3,50"
                  className="min-w-0 flex-1 rounded-xl border-2 border-ink bg-white px-3 py-1.5 text-sm font-bold placeholder:font-semibold placeholder:text-ink/40"
                />
                <button type="submit" className="btn-chunky bg-pika">
                  OK
                </button>
                {item.customPrice !== undefined && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetPrice(item.id, null);
                      setDraft('');
                      setDraftError(false);
                    }}
                    className="btn-chunky bg-white"
                  >
                    Effacer
                  </button>
                )}
              </div>
              {draftError && <p className="mt-1 text-xs font-extrabold text-dex-deep">Saisissez un nombre, par exemple 3,50.</p>}
            </form>
          </div>

          {/* Informations */}
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {facts
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs font-extrabold text-ink/55">{label}</dt>
                  <dd className="truncate font-bold">{value}</dd>
                </div>
              ))}
          </dl>

          {/* Cotes */}
          <h3 className="mt-6 font-display text-base">Cotes du marché</h3>
          {cmRows.length === 0 && tcgGroups.length === 0 ? (
            <p className="mt-1 text-sm font-semibold text-ink/65">Aucune cote disponible pour cette carte.</p>
          ) : (
            <div className="mt-2 space-y-3">
              {cmRows.length > 0 && (
                <div className="panel p-3">
                  <p className="text-xs font-extrabold text-ink/60">
                    Cardmarket (€){updatedLabel(cm) && ` · ${updatedLabel(cm)}`}
                  </p>
                  <ul className="mt-1 divide-y divide-ink/10 text-sm">
                    {cmRows.map((r) => (
                      <li key={r.label} className="flex justify-between py-1">
                        <span className="font-semibold">{r.label}</span>
                        <span className="font-extrabold">{money(r.value, 'EUR')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {tcgGroups.map((g) => (
                <div key={g.title} className="panel p-3">
                  <p className="text-xs font-extrabold text-ink/60">
                    TCGPlayer ($) · {g.title}
                    {updatedLabel(tcg) && ` · ${updatedLabel(tcg)}`}
                  </p>
                  <ul className="mt-1 divide-y divide-ink/10 text-sm">
                    {g.rows.map((r) => (
                      <li key={r.label} className="flex justify-between py-1">
                        <span className="font-semibold">{r.label}</span>
                        <span className="font-extrabold">{money(r.value, 'USD')}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs font-semibold text-ink/55">
            Cotes enregistrées au dernier scan ou à la dernière actualisation.
          </p>

          <button
            onClick={() => {
              if (window.confirm(`Retirer ${card.name} (${VARIANT_LABELS[variant]}) du classeur ?`)) onDelete(item.id);
            }}
            className="mt-5 w-full text-center text-sm font-extrabold text-dex-deep underline"
          >
            Retirer cette carte du classeur
          </button>
        </div>
      </div>
    </div>
  );
}

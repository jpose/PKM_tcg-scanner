import { CardVariant, CollectionItem, VARIANT_LABELS } from '../types';
import { getItemPrice } from './collection';

const VARIANTS: CardVariant[] = ['normal', 'reverse', 'holo', 'firstEdition'];
const IMAGE_HOST = 'https://assets.tcgdex.net/';

// Un fichier de sauvegarde vient de l'extérieur : on n'accepte comme image
// que les adresses du site officiel des visuels TCGdex.
const safeUrl = (u: unknown) => (typeof u === 'string' && u.startsWith(IMAGE_HOST) ? u : undefined);

export function buildJson(items: CollectionItem[]): string {
  return JSON.stringify(
    { app: 'pokescan', version: 2, exportedAt: new Date().toISOString(), items },
    null,
    2
  );
}

// CSV prévu pour Excel en français : séparateur « ; », virgule décimale, BOM UTF-8.
export function buildCsv(items: CollectionItem[]): string {
  const header = ['Nom', 'Édition', 'Numéro', 'Rareté', 'Variante', 'Quantité', 'Prix unitaire', 'Devise', 'Valeur totale', 'Nature du prix', 'Identifiant'];
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const money = (n: number) => n.toFixed(2).replace('.', ',');
  const rows = items.map((i) => {
    const p = getItemPrice(i);
    return [
      i.card.name,
      i.card.set?.name ?? '',
      i.card.localId,
      i.card.rarity ?? '',
      VARIANT_LABELS[i.variant],
      i.quantity,
      p ? money(p.value) : '',
      p ? p.currency : '',
      p ? money(p.value * i.quantity) : '',
      p?.manual ? 'saisi à la main' : p?.approx ? 'approximatif' : '',
      i.card.id,
    ];
  });
  return '\uFEFF' + [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

export function parseBackup(text: string): CollectionItem[] {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Ce fichier n’est pas une sauvegarde PokéScan valide.');
  }
  const list = Array.isArray(data) ? data : data?.items;
  if (!Array.isArray(list)) throw new Error('Ce fichier n’est pas une sauvegarde PokéScan valide.');

  const out: CollectionItem[] = [];
  for (const raw of list) {
    const card = raw?.card;
    if (!card || typeof card.id !== 'string' || typeof card.name !== 'string') continue;
    const variant: CardVariant = VARIANTS.includes(raw.variant) ? raw.variant : 'normal';
    const quantity = Math.max(1, Math.min(9999, Math.floor(Number(raw.quantity) || 1)));
    const rawPrice = raw.customPrice;
    const customPrice =
      rawPrice !== null && rawPrice !== undefined && rawPrice !== '' && Number.isFinite(Number(rawPrice)) &&
      Number(rawPrice) >= 0 && Number(rawPrice) <= 1_000_000
        ? Number(rawPrice)
        : undefined;
    out.push({
      id: `${card.id}::${variant}-${Date.now()}-${out.length}`,
      variant,
      quantity,
      addedAt: Number(raw.addedAt) || Date.now(),
      customPrice,
      card: {
        ...card,
        localId: String(card.localId ?? ''),
        image: safeUrl(card.image),
        set: {
          id: String(card.set?.id ?? ''),
          name: String(card.set?.name ?? 'Édition inconnue'),
          logo: safeUrl(card.set?.logo),
          symbol: safeUrl(card.set?.symbol),
        },
      },
    });
  }
  if (out.length === 0) throw new Error('Aucune carte trouvée dans ce fichier.');
  return out;
}

export function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

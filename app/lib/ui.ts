import { CardVariant } from '../types';

const TYPES: Record<string, { bg: string; fg: string }> = {};
function alias(names: string[], bg: string, fg = '#fff') {
  names.forEach((n) => (TYPES[n] = { bg, fg }));
}
alias(['plante', 'grass'], '#5DB94C');
alias(['feu', 'fire'], '#F2692B');
alias(['eau', 'water'], '#3C9BF0');
alias(['electrique', 'lightning'], '#FFCB05', '#1B2340');
alias(['psy', 'psychic'], '#D45FA8');
alias(['combat', 'fighting'], '#C0542B');
alias(['obscurite', 'darkness'], '#4F4268');
alias(['metal'], '#8A98A8');
alias(['dragon'], '#6C5CD6');
alias(['fee', 'fairy'], '#EF86BE', '#1B2340');
alias(['incolore', 'colorless'], '#B7BCC4', '#1B2340');

export function typeStyle(type?: string): { bg: string; fg: string } {
  const key = (type || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return TYPES[key] ?? { bg: '#B7BCC4', fg: '#1B2340' };
}

export function formatPrice(
  price: { value: number; currency: 'EUR' | 'USD' } | null
): string | null {
  if (!price) return null;
  const n = price.value.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return price.currency === 'EUR' ? `${n} €` : `${n} $`;
}

// L'effet holographique n'apparaît que sur les variantes qui brillent
// réellement : il renseigne sur la carte, il ne décore pas.
export function foilClass(variant: CardVariant): string {
  switch (variant) {
    case 'holo':
      return 'foil foil-holo';
    case 'reverse':
      return 'foil foil-reverse';
    case 'firstEdition':
      return 'foil foil-holo first-ed';
    default:
      return '';
  }
}

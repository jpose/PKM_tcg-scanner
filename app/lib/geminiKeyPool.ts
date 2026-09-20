/**
 * Pool de clés API Gemini avec répartition de charge (round-robin) et
 * bascule automatique en cas de quota atteint sur une clé.
 *
 * Configuration (dans .env.local ou les variables Vercel) :
 *   - GEMINI_API_KEYS="clé1,clé2"   (recommandé, autant de clés que voulu)
 * ou, si vous préférez des variables séparées :
 *   - GEMINI_API_KEY_1="clé1"
 *   - GEMINI_API_KEY_2="clé2"
 * L'ancienne variable GEMINI_API_KEY seule reste aussi supportée pour
 * ne rien casser si vous n'avez qu'une seule clé.
 */

// Compteur conservé en mémoire tant que l'instance serverless reste "chaude".
// Un décalage aléatoire au démarrage évite que toutes les instances
// commencent systématiquement par la même clé.
let roundRobinIndex = Math.floor(Math.random() * 1000);

export function getGeminiKeys(): string[] {
  const keys: string[] = [];

  const csv = process.env.GEMINI_API_KEYS;
  if (csv) {
    keys.push(...csv.split(',').map((k) => k.trim()).filter(Boolean));
  }

  // Variables séparées GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... GEMINI_API_KEY_10
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`];
    if (k) keys.push(k.trim());
  }

  // Compatibilité avec l'ancienne variable unique
  if (process.env.GEMINI_API_KEY) {
    keys.push(process.env.GEMINI_API_KEY.trim());
  }

  // Dédoublonnage tout en gardant l'ordre
  return Array.from(new Set(keys.filter(Boolean)));
}

/**
 * Renvoie les clés disponibles, ordonnées à partir d'un point de départ
 * tournant (round-robin), pour répartir la charge entre les appels.
 */
export function getKeysRoundRobinOrder(): string[] {
  const keys = getGeminiKeys();
  if (keys.length === 0) return [];

  const start = roundRobinIndex % keys.length;
  roundRobinIndex++;

  return [...keys.slice(start), ...keys.slice(0, start)];
}

export function isQuotaOrRateLimitError(err: any): boolean {
  const status = err?.status || err?.response?.status;
  const message: string = (err?.message || '').toLowerCase();
  return (
    status === 429 ||
    status === 403 ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('resource_exhausted') ||
    message.includes('exceeded')
  );
}

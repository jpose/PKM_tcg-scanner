export const config = {
  maxDuration: 30, // Sécurité pour Vercel
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' });

  try {
    const { image } = req.body;
    if (!image) return res.status(400).json({ error: 'Aucune image transmise.' });

    // Récupération des deux clés depuis les variables d'environnement
    const key1 = process.env.GEMINI_API_KEY_1;
    const key2 = process.env.GEMINI_API_KEY_2;
    const availableKeys = [key1, key2].filter(Boolean); // Ignore les clés nulles ou indéfinies

    if (availableKeys.length === 0) {
      return res.status(500).json({ error: 'Aucune clé API GEMINI configurée dans Vercel.' });
    }

    // Mélange aléatoire des clés (Load balancing 50/50)
    const shuffledKeys = availableKeys.sort(() => Math.random() - 0.5);

    const modelName = 'gemini-1.5-Parfait. Utiliser plusieurs clés d'API sur Vercel (qui fonctionne avec des fonctions Serverless ou Edge) nécessite une approche sans état (stateless). Puisque les variables globales ne sont pas partagées entre toutes les instances de vos fonctions, la meilleure optimisation combine **la sélection aléatoire** (pour répartir la charge) et un **système de repli (fallback)** en cas d'erreur de limite de quota (HTTP 429).

Voici comment structurer votre code pour exploiter ces deux clés de manière optimale.

### 1. Le gestionnaire de clés (Key Manager)
Ce script sélectionne une clé aléatoirement pour équilibrer la charge dès le départ.

```javascript
// utils/geminiKeys.js

// On filtre pour s'assurer que les clés existent bien dans l'environnement
const apiKeys = [
  process.env.GEMINI_API_KEY_1,
  process.env.GEMINI_API_KEY_2
].filter(Boolean);

if (apiKeys.length === 0) {
  throw new Error("Aucune clé Gemini n'est configurée dans Vercel.");
}

/**
 * Retourne une clé aléatoire pour faire du Load Balancing naturel
 */
export function getRandomGeminiKey() {
  const randomIndex = Math.floor(Math.random() * apiKeys.length);
  return apiKeys[randomIndex];
}

/**
 * Retourne l'autre clé si la première échoue
 */
export function getFallbackKey(currentKey) {
  // S'il n'y a qu'une seule clé valide, on la retourne quand même
  if (apiKeys.length === 1) return currentKey;
  
  // Trouve la clé qui N'EST PAS celle qui vient d'échouer
  return apiKeys.find(key => key !== currentKey) || apiKeys[0];
}

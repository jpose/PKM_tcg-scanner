export default async function handler(req, res) {
  // Config des en-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY absente dans Vercel' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { image } = body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image envoyée' });
    }

    // Utilisation stricte de gemini-3.6-flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte ni ponctuation." },
            { inline_data: { mime_type: "image/jpeg", data: image } }
          ]
        }]
      })
    });

    const data = await response.json();

    // 1. Détection spécifique du dépassement de quota / limite
    if (response.status === 429 || data.error?.status === 'RESOURCE_EXHAUSTED') {
      return res.status(429).json({
        limit_exceeded: true,
        error: 'Quota ou limite de requêtes dépassé (Rate Limit).',
        details: data.error?.message || 'Trop de requêtes envoyées à Gemini.'
      });
    }

    // 2. Erreurs Google standards (400, 403, 500, etc.)
    if (!response.ok || data.error) {
      return res.status(response.status || 500).json({
        limit_exceeded: false,
        error: data.error?.message || 'Erreur Gemini',
        status_code: response.status,
        details: data.error || data
      });
    }

    const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

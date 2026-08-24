export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY absente dans Vercel' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const { image, base64 } = body || {};
    let rawBase64 = base64 || image;

    if (!rawBase64) {
      return res.status(400).json({ error: 'Aucune image envoyée' });
    }

    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }

    // Uniquement des modèles officiels réels
    const GEMINI_MODELS = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash"
    ];

    let lastErrorDetails = null;

    for (const modelName of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte." },
                { inline_data: { mime_type: "image/jpeg", data: rawBase64 } }
              ]
            }]
          })
        });

        const data = await response.json();

        if (data.error) {
          lastErrorDetails = `[${modelName}] ${data.error.message || response.status}`;
          console.warn(lastErrorDetails);
          continue; // Tente le modèle suivant
        }

        const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (cardName) {
          return res.status(200).json({ name: cardName, modelUsed: modelName });
        }
      } catch (err) {
        lastErrorDetails = err.message;
        continue;
      }
    }

    // Affiche la VRAIE raison de l'erreur renvoyée par Google
    return res.status(400).json({
      error: "Impossible d'effectuer le scan.",
      details: lastErrorDetails
    });

  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur: " + err.message });
  }
}

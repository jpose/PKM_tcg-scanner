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

    // Appel vers le modèle Gemini Flash récent
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
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

    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'Erreur Gemini' });
    }

    const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
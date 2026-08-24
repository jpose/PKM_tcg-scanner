export default async function handler(req, res) {
  // Config CORS
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
    rawBase64 = rawBase64.replace(/(\r\n|\n|\r)/gm, "").trim();

    // Combinaisons d'endpoints et de modèles à tester
    const ENDPOINTS = [
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent",
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
    ];

    let lastGoogleError = null;

    for (const baseUrl of ENDPOINTS) {
      const targetUrl = `${baseUrl}?key=${apiKey}`;

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte." },
                {
                  inline_data: {
                    mime_type: "image/jpeg",
                    data: rawBase64
                  }
                }
              ]
            }]
          })
        });

        const data = await response.json();

        if (response.ok && !data.error) {
          const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (cardName) {
            return res.status(200).json({ name: cardName, endpointUsed: baseUrl });
          }
        }

        lastGoogleError = {
          url: baseUrl,
          status: response.status,
          response: data
        };

      } catch (err) {
        lastGoogleError = { url: baseUrl, error: err.message };
      }
    }

    // Si aucune des URLs n'a fonctionné, on renvoie le détail précis
    return res.status(400).json({
      error: "Toutes les tentatives d'URL ont échoué.",
      debug_details: lastGoogleError
    });

  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur Vercel", details: err.message });
  }
}

export default async function handler(req, res) {
  // Configuration des en-têtes CORS
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
      return res.status(500).json({ error: 'Variable GEMINI_API_KEY manquante sur Vercel' });
    }

    // Traitement du body de la requête
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Format JSON invalide' });
      }
    }

    const { image, base64 } = body || {};
    let rawBase64 = base64 || image;

    if (!rawBase64) {
      return res.status(400).json({ error: 'Aucune donnée d image reçue' });
    }

    // Nettoyage de la chaîne Base64
    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    rawBase64 = rawBase64.replace(/(\r\n|\n|\r|\s)/gm, "");

    // Modèles Google Gemini v1beta actifs
    const MODELS = [
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash'
    ];

    let lastGoogleError = null;

    for (const model of MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { 
                  text: "Analyse cette carte Pokémon. Lis attentivement le nom imprimé tout en haut de la carte. Réponds UNIQUEMENT par le nom officiel français de ce Pokémon, sans inclure les PV, le type, la ponctuation ou autre texte." 
                },
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

        if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const cardName = data.candidates[0].content.parts[0].text.trim();
          if (cardName) {
            return res.status(200).json({ name: cardName, modelUsed: model });
          }
        }

        if (data.error) {
          lastGoogleError = { model, code: response.status, message: data.error.message };
        }
      } catch (err) {
        lastGoogleError = { model, error: err.message };
      }
    }

    // Renvoi de la raison exacte du rejet Google
    return res.status(400).json({
      error: "Erreur lors de l analyse de l image.",
      details_google: lastGoogleError
    });

  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur : " + err.message });
  }
}

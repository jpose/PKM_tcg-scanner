export default async function handler(req, res) {
  // 1. Gestion des en-têtes CORS
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
      return res.status(500).json({ error: 'Variable GEMINI_API_KEY manquante dans Vercel' });
    }

    // 2. Traitement du corps de la requête
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

    // Nettoyage de l'en-tête base64 (data:image/jpeg;base64,...)
    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    rawBase64 = rawBase64.replace(/(\r\n|\n|\r)/gm, "").trim();

    // 3. Modèles officiels Gemini valides (dans l'ordre de priorité)
    const MODELS = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash'
    ];

    let lastErrorDetails = null;

    // 4. Boucle de secours sur les modèles
    for (const model of MODELS) {
      // Construction de l'URL officielle Google AI Studio (API v1beta)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte ni ponctuation." },
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
            return res.status(200).json({
              name: cardName,
              modelUsed: model
            });
          }
        }

        // Si l'API retourne une erreur spécifique, on la stocke
        if (data.error) {
          lastErrorDetails = `[${model}] ${data.error.message || response.status}`;
          console.warn(`Échec avec le modèle ${model}:`, lastErrorDetails);
        }

      } catch (err) {
        lastErrorDetails = `[${model}] Exception: ${err.message}`;
        console.warn(`Exception sur ${model}:`, err.message);
      }
    }

    // Si tous les modèles échouent, on retourne la dernière erreur capturée
    return res.status(400).json({
      error: "Impossible d analyser l image avec l API Gemini.",
      details: lastErrorDetails
    });

  } catch (globalErr) {
    return res.status(500).json({
      error: "Erreur serveur globale",
      details: globalErr.message
    });
  }
}

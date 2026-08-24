export default async function handler(req, res) {
  // 1. En-têtes CORS
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
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY absente dans les variables d\'environnement Vercel.' });
    }

    // 2. Traitement du corps de la requête (Body)
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ error: 'Corps JSON invalide' });
      }
    }

    const { image, base64 } = body || {};
    let rawBase64 = base64 || image;

    if (!rawBase64) {
      return res.status(400).json({ error: 'Aucune donnée d\'image fournie' });
    }

    // Nettoyage strict de la chaîne Base64 (retrait du header data:image/...)
    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    rawBase64 = rawBase64.trim().replace(/(\r\n|\n|\r)/gm, "");

    // 3. Modèles stables reconnus par la v1beta de l'API REST Google Gemini
    const GEMINI_MODELS = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro"
    ];

    let lastErrorDetails = "";

    // 4. Test des modèles
    for (const modelName of GEMINI_MODELS) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

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

        // Si l'API renvoie une erreur (400, 404, 429)
        if (data.error) {
          lastErrorDetails = `[${modelName}] ${data.error.message || ('Code HTTP ' + response.status)}`;
          console.warn(`[Scan API] ${lastErrorDetails}`);
          continue; // Tente le modèle suivant
        }

        const candidate = data.candidates?.[0];
        const cardName = candidate?.content?.parts?.[0]?.text?.trim();

        if (cardName) {
          return res.status(200).json({ 
            name: cardName, 
            modelUsed: modelName 
          });
        }
      } catch (err) {
        lastErrorDetails = `[${modelName}] Exception: ${err.message}`;
        console.warn(`[Scan API] ${lastErrorDetails}`);
        continue;
      }
    }

    // Si tous les modèles échouent, on retourne la précision exacte de l'erreur
    return res.status(400).json({
      error: "Impossible d'effectuer le scan.",
      details: lastErrorDetails
    });

  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur : " + err.message });
  }
}

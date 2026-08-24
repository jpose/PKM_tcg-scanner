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
    const { image, base64 } = body || {};

    let rawBase64 = base64 || image;
    if (!rawBase64) {
      return res.status(400).json({ error: 'Aucune image envoyée' });
    }

    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }

    // Liste des modèles à tester dans l'ordre en cas de quota dépassé
    const GEMINI_MODELS = [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro"
    ];

    let lastErrorMessage = "";

    // Boucle de secours sur la liste des modèles
    for (const modelName of GEMINI_MODELS) {
      try {
        console.log(`[Scan API] Essai avec : ${modelName}`);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte ni ponctuation." },
                { inline_data: { mime_type: "image/jpeg", data: rawBase64 } }
              ]
            }]
          })
        });

        const data = await response.json();

        // Si une erreur survient (quota 429, modèle introuvable, etc.)
        if (data.error) {
          lastErrorMessage = data.error.message || `Erreur HTTP ${response.status}`;
          console.warn(`[Scan API] Échec sur ${modelName} : ${lastErrorMessage}`);
          
          // Si c'est un problème de quota ou d'erreur temporaire, on essaie le modèle suivant
          continue;
        }

        const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

        if (cardName) {
          return res.status(200).json({ 
            name: cardName, 
            modelUsed: modelName 
          });
        }
      } catch (modelErr) {
        lastErrorMessage = modelErr.message;
        console.warn(`[Scan API] Erreur réseau/fetch sur ${modelName} :`, modelErr.message);
        continue;
      }
    }

    // Si tous les modèles de la liste ont échoué
    return res.status(429).json({ 
      error: "Tous les modèles Gemini ont dépassé leur quota. Réessaie dans une minute.",
      details: lastErrorMessage 
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

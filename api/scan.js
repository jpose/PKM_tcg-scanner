export default async function handler(req, res) {
  // En-têtes CORS
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
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY absente dans les variables Vercel' });
    }

    // Gestion robuste du Body sous Node 24
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Format JSON invalide dans le body' });
      }
    }

    const { image, base64 } = body || {};
    let rawBase64 = base64 || image;

    if (!rawBase64) {
      return res.status(400).json({ error: 'Aucune image envoyée dans la requête' });
    }

    // Nettoyage de l'en-tête Data URL si présent
    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }

    // Liste des modèles reconnus par l'API REST Google Gemini
    const GEMINI_MODELS = [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro"
    ];

    let lastErrorDetails = "Aucune réponse d'aucun modèle";

    // Parcours séquentiel des modèles
    for (let i = 0; i < GEMINI_MODELS.length; i++) {
      const modelName = GEMINI_MODELS[i];
      const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json' 
          },
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

        // Si Google renvoie une erreur (quota 429, modèle indisponible, etc.)
        if (data.error) {
          lastErrorDetails = data.error.message || `Code HTTP ${response.status}`;
          console.warn(`[Scan API] ${modelName} a échoué: ${lastErrorDetails}`);
          continue; // Essaye le modèle suivant
        }

        // Extraction sécurisée du résultat
        const candidate = data.candidates?.[0];
        const cardName = candidate?.content?.parts?.[0]?.text?.trim();

        if (cardName) {
          return res.status(200).json({ 
            name: cardName, 
            modelUsed: modelName 
          });
        }
      } catch (err) {
        lastErrorDetails = err.message || "Erreur réseau";
        console.warn(`[Scan API] Exception sur ${modelName}:`, lastErrorDetails);
        continue;
      }
    }

    // Si aucun modèle n'a fonctionné
    return res.status(429).json({
      error: "Tous les modèles Gemini ont dépassé leur quota. Réessaie dans une minute.",
      details: lastErrorDetails
    });

  } catch (globalError) {
    console.error("[Scan API] Erreur globale serveur:", globalError);
    return res.status(500).json({ error: "Erreur d'exécution serveur : " + globalError.message });
  }
}

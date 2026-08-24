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

    // Utilisation stricte de gemini-1.5-flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
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

    // 1. Erreur renvoyée directement par l'API Gemini (ex: clé invalide, quota dépassé)
    if (data.error) {
      return res.status(500).json({ 
        error: 'Erreur API Gemini', 
        details: data.error.message || data.error 
      });
    }

    // 2. Gestion du blocage lié à la sécurité ou au contenu de l'image
    const candidate = data.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      return res.status(422).json({ 
        error: `L'analyse a échoué (${candidate.finishReason})`, 
        safetyRatings: candidate.safetyRatings || [] 
      });
    }

    // 3. Extraction et vérification du résultat textuel
    const cardName = candidate?.content?.parts?.[0]?.text?.trim();

    if (!cardName) {
      return res.status(422).json({ 
        error: "L'IA n'a pas pu identifier la carte Pokémon sur cette image." 
      });
    }

    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Erreur interne du serveur' });
  }
}

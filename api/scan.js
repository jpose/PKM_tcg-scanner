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

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    let { image } = body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image envoyée' });
    }

    // Traitement et nettoyage de la chaîne Base64
    let mimeType = 'image/jpeg';
    let base64Data = image.trim();

    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(';base64,');
      mimeType = parts[0].replace('data:', '') || 'image/jpeg';
      base64Data = parts[1] || '';
    }

    // Conservation stricte de gemini-3.6-flash
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte ni ponctuation." },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }]
      })
    });

    const data = await response.json();

    // Erreur d'appel API Google (Quota, clé, routeur...)
    if (data.error || !response.ok) {
      return res.status(response.status || 500).json({
        error: 'Erreur API Google Gemini',
        status: response.status,
        details: data.error || data
      });
    }

    const candidate = data.candidates?.[0];
    const cardName = candidate?.content?.parts?.[0]?.text?.trim();

    // Échec lors du traitement de l'image par l'IA
    if (!cardName) {
      return res.status(422).json({
        error: 'Erreur d\'analyse IA',
        finishReason: candidate?.finishReason || 'RÉPONSE_VIDE',
        safetyRatings: candidate?.safetyRatings || [],
        rawGoogleResponse: data
      });
    }

    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur interne', message: err.message });
  }
}

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

    // 1. Détection automatique du MIME-type et extraction du Base64 propre
    let mimeType = 'image/jpeg';
    let base64Data = image.trim();

    if (base64Data.startsWith('data:')) {
      const parts = base64Data.split(';base64,');
      mimeType = parts[0].replace('data:', '') || 'image/jpeg';
      base64Data = parts[1] || '';
    }

    // Nettoyage des sauts de ligne / espaces accidentels
    base64Data = base64Data.replace(/[\r\n\s]/g, '');

    if (!base64Data) {
      return res.status(400).json({ error: 'Données Base64 invalides ou vides' });
    }

    // 2. Envoi à Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte ni ponctuation." },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const data = await response.json();

    if (data.error || !response.ok) {
      return res.status(response.status || 500).json({
        error: 'Erreur API Google',
        message: data.error?.message || 'Erreur Gemini',
        details: data.error
      });
    }

    const candidate = data.candidates?.[0];
    const cardName = candidate?.content?.parts?.[0]?.text?.trim();

    // 3. Retour explicite si l'analyse échoue
    if (!cardName) {
      return res.status(422).json({
        error: 'Erreur d\'analyse IA',
        diagnostic: {
          finishReason: candidate?.finishReason || 'RÉPONSE_VIDE',
          mimeDetected: mimeType,
          safetyRatings: candidate?.safetyRatings || [],
          rawResponse: data
        }
      });
    }

    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', message: err.message });
  }
}

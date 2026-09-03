export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image transmise.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans les variables Vercel.' });
    }

    // Modèle fixé sur gemini-3.6-flash
    const modelName = 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette carte Pokémon.
1. Identifie le nom de la carte en français et son nom en ANGLAIS.
2. Identifie le numéro imprimé en bas (ex: 4/102, 058/102, SWSH039).

Renvoie EXCLUSIVEMENT un JSON valide au format suivant :
{"cardNameFr": "Nom FR", "cardNameEn": "Nom EN", "cardNumber": "Numéro"}`;

    // Appel Gemini avec un délai d'expiration de 5 secondes
    let geminiRes;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: promptText },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }]
        }),
        signal: AbortSignal.timeout(5000)
      });
    } catch (err) {
      return res.status(504).json({ error: 'L\'analyse par Gemini 3.6 Flash a expiré (délai de 5s dépassé).' });
    }

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = geminiData.error?.message || 'Erreur Gemini';
      return res.status(geminiRes.status).json({ error: `Erreur Gemini (${modelName}) : ${msg}` });
    }

    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/gi, '').replace(/

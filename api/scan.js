export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image n\'a été fournie.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans les variables Vercel.' });
    }

    // 1. Préparation de l'image Base64
    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    // 2. URL de l'API REST Google avec gemini-3.6-flash
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiApiKey}`;

    const promptText = `Analyse cette image de carte Pokémon TCG.
Identifie le nom de la carte et son numéro (ex: 4/102 ou 058/102).
Renvoie UNIQUEMENT un objet JSON valide suivant ce format strict, sans aucun texte ni balise markdown autour :
{"cardName": "Nom de la carte", "cardNumber": "numéro"}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }
        ]
      })
    });

    const geminiData = await geminiResponse.json();

    if (!geminiResponse.ok) {
      return res.status(geminiResponse.status).json({
        error: `Erreur API Google Gemini (${geminiResponse.status}) : ` + (geminiData.error?.message || JSON.stringify(geminiData))
      });
    }

    // 3. Extraction de la réponse texte
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/

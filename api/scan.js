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

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const { image, base64 } = body || {};
    let rawBase64 = base64 || image;

    if (!rawBase64) {
      return res.status(400).json({ error: 'Aucune image reçue dans la requête' });
    }

    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    rawBase64 = rawBase64.replace(/(\r\n|\n|\r|\s)/gm, "");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son nom officiel en français, sans aucun autre texte." },
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

    // Si Google renvoie une erreur (400, 429, 403...), on transmet tout le détail
    if (!response.ok || data.error) {
      return res.status(response.status).json({
        http_code: response.status,
        message: "Erreur renvoyée par l'API Google",
        erreur_google: data.error || data
      });
    }

    const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur Vercel", details: err.message });
  }
}

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
      return res.status(400).json({ error: 'Aucune donnée d image reçue (champs base64/image vides)' });
    }

    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    rawBase64 = rawBase64.replace(/(\r\n|\n|\r)/gm, "").trim();

    // Test direct sur gemini-1.5-flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français." },
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

    // Renvoie la réponse brute de Google (avec son code d'erreur réel)
    if (!response.ok || data.error) {
      return res.status(response.status || 400).json({
        error: "Erreur brute renvoyée par Google Gemini",
        google_http_status: response.status,
        google_response: data
      });
    }

    const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({ error: "Erreur d exécution Vercel", details: err.message });
  }
}

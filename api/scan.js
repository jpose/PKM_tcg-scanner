export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Clé GEMINI_API_KEY absente dans Vercel' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const { image, base64 } = body || {};
    let rawBase64 = base64 || image;

    if (!rawBase64) return res.status(400).json({ error: 'Aucune image reçue' });

    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    rawBase64 = rawBase64.replace(/(\r\n|\n|\r|\s)/gm, "");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Quel est le nom de cette carte Pokémon ? Donne juste le nom." },
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

    // On extrait le texte brut sans filtre agressif
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (rawText) {
      // Nettoyage basique du résultat
      const cleanedName = rawText.trim().replace(/^["']|["']$/g, '');
      return res.status(200).json({ name: cleanedName, raw_response: rawText });
    }

    // Si vraiment rien n'est extrait, on renvoie la réponse brute de Google pour débugger
    return res.status(400).json({
      error: "Google n'a renvoyé aucun texte",
      google_payload: data
    });

  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur Vercel", details: err.message });
  }
}

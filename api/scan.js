export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY absente sur Vercel' });
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) {}
    }

    const { image, base64 } = body || {};
    let rawBase64 = base64 || image;

    if (!rawBase64) {
      return res.status(400).json({ error: 'Aucune image reçue dans le body' });
    }

    // Nettoyage de la chaîne Base64
    if (rawBase64.includes(',')) {
      rawBase64 = rawBase64.split(',')[1];
    }
    rawBase64 = rawBase64.replace(/(\r\n|\n|\r|\s)/gm, "");

    // Appel direct au modèle standard actuel
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const googleResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son nom officiel en français." },
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

    const data = await googleResponse.json();

    // Renvoie la réponse intégrale de Google au navigateur
    return res.status(googleResponse.status).json({
      http_status_google: googleResponse.status,
      reponse_brute_google: data
    });

  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur Vercel", details: err.message });
  }
}

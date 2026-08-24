const https = require('https');

module.exports = async (req, res) => {
  // Activer le CORS au cas où
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante sur Vercel' });
  }

  const { image } = req.body || {};
  if (!image) {
    return res.status(400).json({ error: 'Aucune image fournie' });
  }

  const payload = JSON.stringify({
    contents: [{
      parts: [
        { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français. Réponds par le nom uniquement, sans rien d'autre." },
        { inline_data: { mime_type: "image/jpeg", data: image } }
      ]
    }]
  });

  const options = {
    hostname: 'generativelanguage.googleapis.com',
    path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let responseData = '';
    apiRes.on('data', (chunk) => { responseData += chunk; });
    apiRes.on('end', () => {
      try {
        const data = JSON.parse(responseData);
        if (data.error) {
          return res.status(500).json({ error: data.error.message });
        }
        const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        return res.status(200).json({ name: cardName });
      } catch (e) {
        return res.status(500).json({ error: 'Erreur parsing réponse Gemini' });
      }
    });
  });

  apiReq.on('error', (e) => {
    return res.status(500).json({ error: e.message });
  });

  apiReq.write(payload);
  apiReq.end();
};
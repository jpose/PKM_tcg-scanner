module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Clé API GEMINI_API_KEY non configurée dans Vercel.' });
    }

    if (!image) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français. Réponds par le nom uniquement, sans rien d'autre." },
            { inline_data: { mime_type: "image/jpeg", data: image } }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'Erreur API Gemini' });
    }

    const cardName = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    return res.status(200).json({ name: cardName });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
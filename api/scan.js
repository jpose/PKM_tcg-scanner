export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY absente dans Vercel" });
  }

  try {
    // Interrogation directe des modèles autorisés sur cette clé
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        erreur: "Clé rejetée ou service désactivé",
        google: data
      });
    }

    // Filtrage des modèles supportant la génération de contenu
    const availableModels = (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace('models/', ''));

    return res.status(200).json({
      succes: true,
      modeles_disponibles_sur_ta_cle: availableModels
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

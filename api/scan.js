export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Variable GEMINI_API_KEY introuvable sur Vercel" });
  }

  // Test 1 : Vérification de la clé API auprès de Google
  try {
    const checkKey = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const keyData = await checkKey.json();

    if (!checkKey.ok) {
      return res.status(400).json({
        erreur: "La clé API est rejetée par Google",
        status_http: checkKey.status,
        reponse_google: keyData
      });
    }

    // Test 2 : Envoi d'une requête minimale sans image
    const testModel = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Bonjour" }] }]
      })
    });
    const modelData = await testModel.json();

    return res.status(200).json({
      cle_valide: true,
      model_status: testModel.status,
      model_response: modelData
    });

  } catch (err) {
    return res.status(500).json({ erreur_reseau: err.message });
  }
}

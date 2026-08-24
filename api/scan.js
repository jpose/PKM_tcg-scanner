export default async function handler(req, res) {
  // Config des en-têtes CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'Configuration serveur', 
        message: 'Clé GEMINI_API_KEY absente dans Vercel' 
      });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { image } = body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image envoyée' });
    }

    // Appel à l'API Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Identifie cette carte Pokémon. Donne uniquement son NOM officiel en français, sans aucun autre texte ni ponctuation." },
            { inline_data: { mime_type: "image/jpeg", data: image } }
          ]
        }]
      })
    });

    const data = await response.json();

    // 1. GESTION DES ERREURS D'API GOOGLE (Quotas, Clés invalides, Serveur, etc.)
    if (data.error || !response.ok) {
      const statusCode = response.status || data.error?.code || 500;
      const statusReason = data.error?.status || '';
      const errorMessage = data.error?.message || 'Erreur API Google Gemini';

      // Détection de dépassement de quota / limite de fréquence (Rate Limit)
      if (statusCode === 429 || statusReason === 'RESOURCE_EXHAUSTED') {
        return res.status(429).json({
          error: 'Quota dépassé',
          message: 'Le quota de requêtes Gemini ou la limite par minute (RPM/TPM) a été atteint.',
          type: 'RESOURCE_EXHAUSTED',
          details: errorMessage
        });
      }

      // Clé d'API invalide ou non autorisée
      if (statusCode === 400 || statusCode === 403) {
        return res.status(statusCode).json({
          error: 'Accès / Clé API invalide',
          message: 'Problème avec la clé d\'API Gemini ou les autorisations.',
          type: statusReason,
          details: errorMessage
        });
      }

      // Autre erreur API
      return res.status(statusCode).json({
        error: 'Erreur API Gemini',
        type: statusReason || 'API_ERROR',
        details: errorMessage
      });
    }

    // 2. GESTION DU BLOCAGE DE CONTENU OU DU DÉPASSEMENT DE JETONS PAR L'IA
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason && finishReason !== 'STOP') {
      let causeText = 'L\'analyse a été interrompue.';
      
      if (finishReason === 'SAFETY') causeText = 'Image bloquée par les filtres de sécurité.';
      if (finishReason === 'RECITATION') causeText = 'Réponse bloquée pour droits d\'auteur / récitation.';
      if (finishReason === 'MAX_TOKENS') causeText = 'Nombre maximal de jetons atteint.';

      return res.status(422).json({
        error: 'Analyse incomplète',
        reason: finishReason,
        message: causeText,
        safetyRatings: candidate?.safetyRatings || []
      });
    }

    // 3. VÉRIFICATION DU RÉSULTAT
    const cardName = candidate?.content?.parts?.[0]?.text?.trim();

    if (!cardName) {
      return res.status(422).json({
        error: 'Résultat vide',
        message: 'L\'IA n\'a pas renvoyé de nom pour cette carte.'
      });
    }

    // Réponse valide
    return res.status(200).json({ name: cardName });

  } catch (err) {
    return res.status(500).json({
      error: 'Erreur interne',
      message: err.message || 'Une erreur inattendue est survenue.'
    });
  }
}

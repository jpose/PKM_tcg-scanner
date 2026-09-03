export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image n\'a été fournie.' });
    }

    // Traitement / Analyse d'image
    return res.status(200).json({
      success: true,
      message: 'Scan effectué avec succès.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ error: 'Erreur lors du traitement de l\'image.' });
  }
}

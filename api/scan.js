export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image n\'a été fournie.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans les variables Vercel.' });
    }

    // 1. Récupération de la liste des modèles disponibles
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`;
    const listResponse = await fetch(listUrl);
    const listData = await listResponse.json();

    if (!listResponse.ok) {
      return res.status(listResponse.status).json({
        error: `Impossible de lister les modèles Gemini (${listResponse.status}) : ` + (listData.error?.message || JSON.stringify(listData))
      });
    }

    const availableModels = listData.models || [];

    // Sélection ordonnée des modèles à tenter en cas de surcharge
    const primaryModel = availableModels.find(m => m.name.includes('gemini-3.6-flash')) ||
                         availableModels.find(m => m.name.includes('3.6'));
    
    const fallbackModels = availableModels.filter(m => 
      m.supportedGenerationMethods?.includes('generateContent') && m.name !== primaryModel?.name
    );

    // File d'attente de test : Priorité au modèle choisi, puis replis
    const candidates = [primaryModel, ...fallbackModels].filter(Boolean);

    if (candidates.length === 0) {
      return res.status(404).json({ error: 'Aucun modèle disponible sur cette clé API.' });
    }

    // 2. Nettoyage de l'image Base64
    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette image de carte Pokémon TCG.
Identifie le nom de la carte et son numéro (ex: 4/102 ou 058/102).
Renvoie UNIQUEMENT un objet JSON valide suivant ce format strict, sans aucun texte autour ni balises markdown :
{"cardName": "Nom de la carte", "cardNumber": "numéro"}`;

    let geminiData = null;
    let usedModelName = '';
    let lastErrorDetails = '';

    // 3. Boucle de tentative avec gestion de la surcharge (503 / 429)
    for (const modelObj of candidates) {
      const modelName = modelObj.name.replace('models/', '');
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: promptText },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ]
        })
      });

      const data = await response.json();

      if (response.ok) {
        geminiData = data;
        usedModelName = modelName;
        break; // Succès !
      }

      // Si le modèle est surchargé (503) ou en limite de quota (429), on essaye le suivant
      if (response.status === 503 || response.status === 429) {
        lastErrorDetails = `Modèle ${modelName} surchargé (${response.status})`;
        continue;
      } else {
        // Autre erreur fatale
        return res.status(response.status).json({
          error: `Erreur Gemini avec ${modelName} (${response.status}) : ` + (data.error?.message || JSON.stringify(data))
        });
      }
    }

    if (!geminiData) {
      return res.status(503).json({
        error: `Tous les modèles Gemini sont actuellement surchargés. Veuillez réentreprendre l'analyse dans quelques instants. (${lastErrorDetails})`
      });
    }

    // 4. Extraction du texte nettoyé
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedInfo;
    try {
      parsedInfo = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Erreur de décodage JSON : ' + rawText });
    }

    const { cardName, cardNumber } = parsedInfo;

    // 5. Interrogation de l'API Pokémon TCG
    let searchQuery = `name:"${cardName}"`;
    if (cardNumber) {
      const cleanNum = cardNumber.split('/')[0].trim();
      searchQuery += ` number:"${cleanNum}"`;
    }

    const tcgResponse = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(searchQuery)}`);
    const tcgData = await tcgResponse.json();

    const matchedCard = tcgData.data && tcgData.data.length > 0 ? tcgData.data[0] : null;

    // 6. Extraction du prix
    let price = 0;
    if (matchedCard?.cardmarket?.prices?.averageSellPrice) {
      price = matchedCard.cardmarket.prices.averageSellPrice;
    } else if (matchedCard?.tcgplayer?.prices?.holofoil?.market) {
      price = matchedCard.tcgplayer.prices.holofoil.market;
    } else if (matchedCard?.tcgplayer?.prices?.normal?.market) {
      price = matchedCard.tcgplayer.prices.normal.market;
    }

    return res.status(200).json({
      success: true,
      cardName: matchedCard ? matchedCard.name : (cardName || 'Carte inconnue'),
      setName: matchedCard ? `${matchedCard.set.name} (${matchedCard.number}/${matchedCard.set.printedTotal})` : 'Extension non trouvée',
      estimatedPrice: price || 0,
      imageUrl: matchedCard ? matchedCard.images.large : '',
      modelUsed: usedModelName
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erreur serveur : ' + error.message 
    });
  }
}

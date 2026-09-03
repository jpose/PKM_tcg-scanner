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

    // 1. Préparation de l'image Base64
    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette image de carte Pokémon TCG.
Identifie le nom de la carte et son numéro (ex: 4/102 ou 058/102).
Renvoie UNIQUEMENT un objet JSON valide suivant ce format strict, sans aucun texte autour ni balises markdown :
{"cardName": "Nom de la carte", "cardNumber": "numéro"}`;

    // 2. Modèle unique imposé : gemini-3.6-flash
    const modelName = 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    let geminiData = null;
    let lastError = '';
    const maxRetries = 3;

    // 3. Boucle de retry uniquement sur le 3.6 en cas de surcharge temporaire (503 / 429)
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
        break;
      }

      lastError = data.error?.message || JSON.stringify(data);

      // Si le serveur est surchargé (503 ou 429), on attend 1.5s avant de réessayer
      if ((response.status === 503 || response.status === 429) && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        continue;
      } else {
        return res.status(response.status).json({
          error: `Erreur Gemini (${response.status}) : ${lastError}`
        });
      }
    }

    if (!geminiData) {
      return res.status(503).json({
        error: `Le modèle ${modelName} est très sollicité. Réessaie dans un instant. (${lastError})`
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
      modelUsed: modelName
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erreur serveur : ' + error.message 
    });
  }
}

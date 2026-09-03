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
Identifie le nom exact de la carte et son numéro imprimé en bas (ex: 4/102, 058/102 ou 58).
Renvoie UNIQUEMENT un objet JSON valide suivant ce format strict, sans markdown :
{"cardName": "Nom", "cardNumber": "Numéro"}`;

    const modelName = 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    let geminiData = null;
    let lastError = '';
    const maxRetries = 3;

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
        error: `Le modèle ${modelName} est très sollicité. Réessaie dans un instant.`
      });
    }

    // 2. Extraction du texte nettoyé
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedInfo;
    try {
      parsedInfo = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Erreur de décodage JSON : ' + rawText });
    }

    const { cardName, cardNumber } = parsedInfo;

    // 3. Normalisation du numéro (ex: "058/102" -> "58", "4/102" -> "4")
    let cleanNumber = '';
    if (cardNumber) {
      const rawNum = cardNumber.split('/')[0].trim();
      cleanNumber = rawNum.replace(/^0+/, '') || rawNum; // Enlève les zéros au début
    }

    // 4. Recherche sur l'API Pokémon TCG
    let matchedCard = null;

    // Étape A : Recherche ciblée avec nom + numéro
    if (cleanNumber && cardName) {
      const strictQuery = `name:"${cardName}" number:"${cleanNumber}"`;
      const tcgRes = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(strictQuery)}`);
      const tcgData = await tcgRes.json();

      if (tcgData.data && tcgData.data.length > 0) {
        matchedCard = tcgData.data[0];
      }
    }

    // Étape B : Si introuvable, recherche assouplie par numéro uniquement
    if (!matchedCard && cleanNumber) {
      const numQuery = `number:"${cleanNumber}"`;
      const tcgRes = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(numQuery)}`);
      const tcgData = await tcgRes.json();

      if (tcgData.data && tcgData.data.length > 0) {
        // Sélectionne la carte dont le nom se rapproche le plus
        matchedCard = tcgData.data.find(c => 
          c.name.toLowerCase().includes(cardName.toLowerCase()) || 
          cardName.toLowerCase().includes(c.name.toLowerCase())
        ) || tcgData.data[0];
      }
    }

    // 5. Extraction du prix et des métadonnées
    let price = 0;
    if (matchedCard) {
      const prices = matchedCard.cardmarket?.prices || {};
      const tcgPrices = matchedCard.tcgplayer?.prices || {};

      price = prices.averageSellPrice || 
              prices.lowPrice || 
              tcgPrices.normal?.market || 
              tcgPrices.holofoil?.market || 
              tcgPrices.reverseHolofoil?.market || 0;
    }

    // 6. Réponse finale
    return res.status(200).json({
      success: true,
      cardName: matchedCard ? matchedCard.name : (cardName || 'Carte inconnue'),
      setName: matchedCard ? `${matchedCard.set.name} (${matchedCard.number}/${matchedCard.set.printedTotal})` : 'Extension non trouvée',
      estimatedPrice: Number(price.toFixed(2)),
      imageUrl: matchedCard ? matchedCard.images.large : '', // Renvoie l'image TCG si trouvée
      modelUsed: modelName
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erreur serveur : ' + error.message 
    });
  }
}

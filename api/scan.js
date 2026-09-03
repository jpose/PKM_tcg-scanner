export default async function handler(req, res) {
  // Garantit un retour au format JSON même en cas d'erreur
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

    // 1. Préparation de l'image
    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette image de carte Pokémon TCG.
Identifie le nom exact de la carte et son numéro imprimé en bas (ex: 4/102, 058/102 ou 58).
Renvoie UNIQUEMENT un objet JSON valide suivant ce format strict, sans balises markdown :
{"cardName": "Nom", "cardNumber": "Numéro"}`;

    // Utilisation d'un modèle Gemini standard
    const modelName = 'gemini-2.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    // 2. Appel à Gemini
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }]
      })
    });

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = geminiData.error?.message || 'Erreur Gemini inconnue';
      return res.status(geminiRes.status).json({ error: `Erreur API Gemini : ${msg}` });
    }

    // 3. Extraction et nettoyage du JSON Gemini
    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedInfo = {};
    try {
      parsedInfo = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Erreur de décodage du résultat d\'analyse : ' + rawText });
    }

    const cardName = parsedInfo.cardName || '';
    const cardNumber = parsedInfo.cardNumber || '';

    // Nettoyage du numéro de carte (ex: "058/102" -> "58")
    let cleanNumber = '';
    if (cardNumber) {
      const rawNum = cardNumber.split('/')[0].trim();
      cleanNumber = rawNum.replace(/^0+/, '') || rawNum;
    }

    // 4. Recherche sur l'API Pokémon TCG avec try/catch sécurisé
    let matchedCard = null;

    try {
      if (cleanNumber && cardName) {
        const query = `name:"${cardName}" number:"${cleanNumber}"`;
        const tcgRes = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}`);
        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          if (tcgData.data && tcgData.data.length > 0) {
            matchedCard = tcgData.data[0];
          }
        }
      }

      // Recherche de secours par numéro seul
      if (!matchedCard && cleanNumber) {
        const query = `number:"${cleanNumber}"`;
        const tcgRes = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}`);
        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          if (tcgData.data && tcgData.data.length > 0) {
            matchedCard = tcgData.data.find(c => 
              c.name.toLowerCase().includes(cardName.toLowerCase()) || 
              cardName.toLowerCase().includes(c.name.toLowerCase())
            ) || tcgData.data[0];
          }
        }
      }
    } catch (tcgErr) {
      // Si l'API TCG échoue, on continue quand même sans bloquer l'application
      console.error('Erreur API TCG:', tcgErr);
    }

    // 5. Calcul de la côte
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

    // 6. Réponse finale toujours formatée
    return res.status(200).json({
      success: true,
      cardName: matchedCard ? matchedCard.name : (cardName || 'Carte inconnue'),
      setName: matchedCard ? `${matchedCard.set.name} (${matchedCard.number}/${matchedCard.set.printedTotal})` : 'Extension introuvable',
      estimatedPrice: Number(price.toFixed(2)),
      imageUrl: matchedCard ? matchedCard.images.large : ''
    });

  } catch (error) {
    // Intercepte tout crash global pour renvoyer du JSON propre
    return res.status(500).json({ 
      error: 'Erreur interne du serveur : ' + error.message 
    });
  }
}

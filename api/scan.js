export const config = {
  maxDuration: 15, // Indique à Vercel d'autoriser jusqu'à 15s d'exécution
};

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image transmise.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans Vercel.' });
    }

    const modelName = 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    // Prompt court et direct pour maximiser la rapidité d'exécution
    const promptText = `Analyse cette carte Pokémon.
Extraits :
1. cardNameFr (Nom FR)
2. cardNameEn (Nom EN)
3. cardNumber (Ex: 025/185 ou 25)
Renvoie uniquement un JSON : {"cardNameFr":"", "cardNameEn":"", "cardNumber":""}`;

    let geminiRes;
    try {
      geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: promptText },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.1,      // Réponse plus directe et rapide
            maxOutputTokens: 120   // Empêche le modèle de générer trop de texte
          }
        }),
        signal: AbortSignal.timeout(8000) // Intercepte le timeout à 8s avant la limite Vercel
      });
    } catch (err) {
      return res.status(504).json({ error: 'L\'analyse de l\'image prend trop de temps. Réessayez avec une photo plus nette et bien cadrée.' });
    }

    const rawResponseBody = await geminiRes.text();
    let geminiData;

    try {
      geminiData = JSON.parse(rawResponseBody);
    } catch (e) {
      return res.status(500).json({ 
        error: `Réponse serveur non-JSON : ${rawResponseBody.slice(0, 100)}` 
      });
    }

    if (!geminiRes.ok) {
      const msg = geminiData.error?.message || 'Erreur inconnue';
      return res.status(geminiRes.status).json({ error: `Erreur API Google (${modelName}) : ${msg}` });
    }

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsedInfo = {};
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      parsedInfo = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: `Impossible de lire la réponse : ${rawText.slice(0, 100)}` });
    }

    const cardNameFr = parsedInfo.cardNameFr || parsedInfo.cardNameEn || 'Carte inconnue';
    const cardNameEn = parsedInfo.cardNameEn || parsedInfo.cardNameFr || '';
    const cardNumber = parsedInfo.cardNumber || '';

    let cleanNumber = '';
    if (cardNumber) {
      const rawNum = cardNumber.split('/')[0].trim();
      cleanNumber = rawNum.replace(/^0+/, '') || rawNum;
    }

    let matchedCard = null;

    if (cardNameEn || cardNameFr || cleanNumber) {
      try {
        let queryParts = [];
        if (cleanNumber) queryParts.push(`number:"${cleanNumber}"`);
        if (cardNameEn) queryParts.push(`name:"*${cardNameEn}*"`);

        const queryStr = queryParts.join(' ');
        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryStr)}`,
          { signal: AbortSignal.timeout(3000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const cards = tcgData.data || [];

          if (cards.length > 0) {
            matchedCard = cards.find(c => 
              c.number === cleanNumber || 
              c.name.toLowerCase() === cardNameEn.toLowerCase()
            ) || cards[0];
          }
        }
      } catch (tcgErr) {
        console.warn('API TCG hors délai');
      }
    }

    let price = 0;
    if (matchedCard) {
      const cm = matchedCard.cardmarket?.prices || {};
      price = cm.averageSellPrice || cm.trendPrice || cm.lowPrice || 0;
      
      if (!price && matchedCard.tcgplayer?.prices) {
        const tcg = matchedCard.tcgplayer.prices;
        const marketPrice = tcg.normal?.market || tcg.holofoil?.market || tcg.reverseHolofoil?.market;
        if (marketPrice) {
          price = marketPrice * 0.92;
        }
      }
    }

    return res.status(200).json({
      success: true,
      cardName: matchedCard ? `${cardNameFr} (${matchedCard.name})` : cardNameFr,
      setName: matchedCard ? `${matchedCard.set.name} — ${matchedCard.number}/${matchedCard.set.printedTotal}` : 'Extension non identifiée',
      estimatedPrice: Number(price.toFixed(2)),
      imageUrl: matchedCard?.images?.large || image
    });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur interne : ' + error.message });
  }
}

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

    // Modèle fixé explicitement sur gemini-3.6-flash selon la consigne Google
    const modelName = 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette carte Pokémon.
Identifie le nom de la carte en français (cardNameFr), son nom en anglais (cardNameEn) et son numéro imprimé en bas (cardNumber).
Renvoie uniquement un objet JSON valide avec les clés cardNameFr, cardNameEn et cardNumber.`;

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
            response_mime_type: 'application/json'
          }
        }),
        // Timeout augmenté à 10s
        signal: AbortSignal.timeout(10000)
      });
    } catch (err) {
      return res.status(504).json({ error: 'Délai dépassé lors de l\'appel à Gemini 3.6 Flash (10s).' });
    }

    const rawResponseBody = await geminiRes.text();
    let geminiData;

    // Protection contre l'erreur 'Unexpected token' si l'API renvoie du texte au lieu d'un JSON
    try {
      geminiData = JSON.parse(rawResponseBody);
    } catch (e) {
      return res.status(500).json({ 
        error: `Réponse serveur non-JSON de Gemini 3.6 Flash : ${rawResponseBody.slice(0, 100)}` 
      });
    }

    if (!geminiRes.ok) {
      const msg = geminiData.error?.message || 'Erreur inconnue';
      return res.status(geminiRes.status).json({ error: `Erreur API Google (${modelName}) : ${msg}` });
    }

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Extraction sécurisée du JSON
    let parsedInfo = {};
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedInfo = JSON.parse(jsonMatch[0]);
      } else {
        parsedInfo = JSON.parse(rawText);
      }
    } catch (e) {
      return res.status(500).json({ error: `Impossible de lire le JSON renvoyé par le modèle : ${rawText.slice(0, 100)}` });
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

    if (cleanNumber) {
      try {
        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=number:"${cleanNumber}"`,
          { signal: AbortSignal.timeout(3000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const cards = tcgData.data || [];

          if (cards.length === 1) {
            matchedCard = cards[0];
          } else if (cards.length > 1) {
            matchedCard = cards.find(c =>
              c.name.toLowerCase().includes(cardNameEn.toLowerCase()) ||
              cardNameEn.toLowerCase().includes(c.name.toLowerCase()) ||
              c.name.toLowerCase().includes(cardNameFr.toLowerCase())
            ) || cards[0];
          }
        }
      } catch (tcgErr) {
        console.warn('API TCG indisponible ou hors délai.');
      }
    }

    let price = 0;
    if (matchedCard) {
      const cm = matchedCard.cardmarket?.prices || {};
      const tcg = matchedCard.tcgplayer?.prices || {};

      const potentialPrices = [
        cm.averageSellPrice,
        cm.trendPrice,
        cm.lowPrice,
        tcg.normal?.market,
        tcg.holofoil?.market,
        tcg.reverseHolofoil?.market
      ].filter(p => typeof p === 'number' && p > 0);

      if (potentialPrices.length > 0) {
        price = potentialPrices[0];
      }
    }

    return res.status(200).json({
      success: true,
      cardName: matchedCard ? `${cardNameFr} (${matchedCard.name})` : cardNameFr,
      setName: matchedCard ? `${matchedCard.set.name} — ${matchedCard.number}/${matchedCard.set.printedTotal}` : 'Extension non trouvée',
      estimatedPrice: Number(price.toFixed(2)),
      imageUrl: matchedCard ? matchedCard.images.large : ''
    });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur interne : ' + error.message });
  }
}

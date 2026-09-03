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

    const promptText = `Analyse cette carte Pokémon.
Identifie :
1. Le nom de la carte en français (cardNameFr)
2. Le nom de la carte en anglais (cardNameEn)
3. Le numéro imprimé en bas à gauche/droite (cardNumber), par exemple "025/185" ou "25"
Renvoie uniquement un objet JSON avec les clés : cardNameFr, cardNameEn, cardNumber.`;

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
        signal: AbortSignal.timeout(10000)
      });
    } catch (err) {
      return res.status(504).json({ error: 'Délai dépassé lors de l\'analyse Gemini (10s).' });
    }

    const rawResponseBody = await geminiRes.text();
    let geminiData;

    try {
      geminiData = JSON.parse(rawResponseBody);
    } catch (e) {
      return res.status(500).json({ 
        error: `Réponse serveur non-JSON de Gemini : ${rawResponseBody.slice(0, 100)}` 
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
      return res.status(500).json({ error: `Impossible de lire le JSON Gemini : ${rawText.slice(0, 100)}` });
    }

    const cardNameFr = parsedInfo.cardNameFr || parsedInfo.cardNameEn || 'Carte inconnue';
    const cardNameEn = parsedInfo.cardNameEn || parsedInfo.cardNameFr || '';
    const cardNumber = parsedInfo.cardNumber || '';

    // Extraction propre du numéro (ex: "025/185" -> "25")
    let cleanNumber = '';
    if (cardNumber) {
      const rawNum = cardNumber.split('/')[0].trim();
      cleanNumber = rawNum.replace(/^0+/, '') || rawNum;
    }

    let matchedCard = null;

    // Recherche dans la base Pokémon TCG
    if (cardNameEn || cardNameFr || cleanNumber) {
      try {
        let queryParts = [];
        if (cleanNumber) queryParts.push(`number:"${cleanNumber}"`);
        if (cardNameEn) queryParts.push(`name:"*${cardNameEn}*"`);

        const queryStr = queryParts.join(' ');
        const tcgRes = await fetch(
          `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(queryStr)}`,
          { signal: AbortSignal.timeout(4000) }
        );

        if (tcgRes.ok) {
          const tcgData = await tcgRes.json();
          const cards = tcgData.data || [];

          if (cards.length > 0) {
            // Sélection de la meilleure carte correspondante
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

    // Récupération stricte de la cote Cardmarket (EUR)
    let price = 0;
    if (matchedCard) {
      const cm = matchedCard.cardmarket?.prices || {};
      
      // On privilégie la valeur moyenne ou la valeur de tendance en euros
      price = cm.averageSellPrice || cm.trendPrice || cm.lowPrice || 0;
      
      // Si aucune valeur Cardmarket, secours maîtrisé sur TCGPlayer
      if (!price && matchedCard.tcgplayer?.prices) {
        const tcg = matchedCard.tcgplayer.prices;
        const marketPrice = tcg.normal?.market || tcg.holofoil?.market || tcg.reverseHolofoil?.market;
        if (marketPrice) {
          price = marketPrice * 0.92; // Conversion approximative USD -> EUR
        }
      }
    }

    return res.status(200).json({
      success: true,
      cardName: matchedCard ? `${cardNameFr} (${matchedCard.name})` : cardNameFr,
      setName: matchedCard ? `${matchedCard.set.name} — ${matchedCard.number}/${matchedCard.set.printedTotal}` : 'Extension non identifiée',
      estimatedPrice: Number(price.toFixed(2)),
      // Image officielle si disponible, sinon renvoie l'image scannée
      imageUrl: matchedCard?.images?.large || image
    });

  } catch (error) {
    return res.status(500).json({ error: 'Erreur interne : ' + error.message });
  }
}

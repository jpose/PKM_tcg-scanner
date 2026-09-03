export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée. Utilisez POST.' });
  }

  try {
    const { image } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'Aucune image fournie.' });
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans Vercel.' });
    }

    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette carte Pokémon.
1. Identifie le nom de la carte en français et son équivalent exact en ANGLAIS.
2. Identifie le numéro de la carte imprimé en bas (ex: 4/102, 058/102, SWSH039).

Renvoie EXCLUSIVEMENT un JSON valide au format suivant, sans balises markdown :
{"cardNameFr": "Nom FR", "cardNameEn": "Nom EN", "cardNumber": "Numéro"}`;

    const modelName = 'gemini-3.6-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`;

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
      const msg = geminiData.error?.message || 'Erreur API Gemini';
      return res.status(geminiRes.status).json({ error: `Gemini: ${msg}` });
    }

    let rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedInfo = {};
    try {
      parsedInfo = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Format JSON invalide renvoyé par Gemini : ' + rawText });
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
        const tcgRes = await fetch(`https://api.pokemontcg.io/v2/cards?q=number:"${cleanNumber}"`);
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

        if (!matchedCard && cardNameEn) {
          const tcgResName = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:"${cardNameEn}"`);
          if (tcgResName.ok) {
            const tcgDataName = await tcgResName.json();
            if (tcgDataName.data && tcgDataName.data.length > 0) {
              matchedCard = tcgDataName.data[0];
            }
          }
        }
      } catch (tcgErr) {
        console.error('Erreur API TCG:', tcgErr);
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
        tcg.reverseHolofoil?.market,
        tcg.unlimitedHolofoil?.market,
        tcg['1stEditionHolofoil']?.market
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
    return res.status(500).json({ error: 'Erreur serveur : ' + error.message });
  }
}

import { GoogleGenAI } from '@google/genai';

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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Clé GEMINI_API_KEY manquante dans les variables Vercel.' });
    }

    // 1. Initialisation SDK Gemini
    const ai = new GoogleGenAI({ apiKey });

    const base64Data = image.split(',')[1] || image;
    const mimeType = image.split(';')[0].split(':')[1] || 'image/jpeg';

    const promptText = `Analyse cette image de carte Pokémon TCG.
Identifie le nom de la carte et son numéro (ex: 4/102 ou 058/102).
Renvoie UNIQUEMENT un objet JSON valide suivant ce format strict, sans aucun texte autour :
{"cardName": "Nom de la carte", "cardNumber": "numéro"}`;

    // 2. Appel Gemini via le SDK officiel
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data,
          },
        },
        promptText,
      ],
    });

    let rawText = response.text || '';
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedInfo;
    try {
      parsedInfo = JSON.parse(rawText);
    } catch (e) {
      return res.status(500).json({ error: 'Réponse Gemini illisible : ' + rawText });
    }

    const { cardName, cardNumber } = parsedInfo;

    // 3. Appel API Pokémon TCG
    let searchQuery = `name:"${cardName}"`;
    if (cardNumber) {
      const cleanNum = cardNumber.split('/')[0].trim();
      searchQuery += ` number:"${cleanNum}"`;
    }

    const tcgResponse = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(searchQuery)}`);
    const tcgData = await tcgResponse.json();

    const matchedCard = tcgData.data && tcgData.data.length > 0 ? tcgData.data[0] : null;

    // 4. Extraction du prix
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
      imageUrl: matchedCard ? matchedCard.images.large : ''
    });

  } catch (error) {
    return res.status(500).json({ 
      error: 'Erreur serveur : ' + error.message 
    });
  }
}

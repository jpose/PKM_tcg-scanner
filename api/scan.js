export const config = {
  maxDuration: 30,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode POST requise.' });
  }

  try {
    const { image } = req.body || {};
    if (!image) {
      return res.status(400).json({ error: 'Aucune image transmise.' });
    }

    const key1 = process.env.GEMINI_API_KEY_1;
    const key2 = process.env.GEMINI_API_KEY_2;
    const availableKeys = [key1, key2].filter(Boolean);

    if (availableKeys.length === 0) {
      return res.status(500).json({ error: 'Aucune clé GEMINI configurée dans Vercel.' });
    }

    const apiKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    // Demande précise à Gemini pour obtenir le nom exact et le numéro de série
    const prompt = `Tu es un expert Pokémon TCG. Identifie la carte sur cette photo.
    Renvoie EXCLUSIVEMENT un objet JSON valide (sans markdown) avec :
    - "fr": Le nom de la carte en français.
    - "en": Le nom exact du Pokémon en anglais (ex: "Rattata").
    - "num": Le numéro exact de la carte sous le format simple (ex: "19" ou "019" ou "SWSH039"). Doit exclure le total.
    - "set_hint": Le nom de l'extension si visible (ex: "Base Set", "Scarlet & Violet", etc.), sinon "".`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } }
          ]
        }],
        generationConfig: {
          response_mime_type: 'application/json',
          temperature: 0.1
        }
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return res.status(502).json({ error: `Erreur Gemini : ${errText.slice(0, 100)}` });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(500).json({ error: 'Aucune donnée renvoyée par l\'IA.' });
    }

    const cardData = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());
    const nomEn = (cardData.en || '').trim();
    const nomFr = (cardData.fr || nomEn).trim();
    const num = (cardData.num || '').split('/')[0].replace(/^0+/, '').trim();

    if (!nomEn) {
      return res.status(400).json({ error: 'Nom de carte illisible. Reprenez une photo plus nette.' });
    }

    // Interdiction stricte de chercher si ce n'est pas Dracaufeu
    const isCharizard = nomEn.toLowerCase().includes('charizard') || nomFr.toLowerCase().includes('dracaufeu');

    // Requête TCG sécurisée
    let query = `name:"${nomEn}"`;
    if (num) {
      query += ` number:"${num}"`;
    }

    const tcgRes = await fetch(
      `https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(query)}&pageSize=10`,
      { signal: AbortSignal.timeout(6000) }
    );

    let candidates = [];

    if (tcgRes.ok) {
      const tcgData = await tcgRes.json();
      const rawCards = tcgData.data || [];

      // FILTRE DE SÉCURITÉ : on écarte TOUTE carte qui ne contient pas le nom détecté
      const validCards = rawCards.filter(c => {
        const cName = c.name.toLowerCase();
        const searchName = nomEn.toLowerCase();
        
        // Si ce n'est pas un Dracaufeu scanné, rejeter Charizard
        if (!isCharizard && cName.includes('charizard')) return false;

        return cName.includes(searchName);
      });

      candidates = validCards.slice(0, 6).map(c => {
        let price = 0;
        if (c.cardmarket?.prices) {
          const cm = c.cardmarket.prices;
          price = cm.trendPrice || cm.avg1 || cm.avg7 || cm.averageSellPrice || cm.lowPrice || 0;
        } else if (c.tcgplayer?.prices) {
          const tp = c.tcgplayer.prices;
          const variant = tp.normal || tp.holofoil || tp.reverseHolofoil || tp.unlimited || {};
          const usdPrice = variant.market || variant.mid || 0;
          price = usdPrice * 0.92;
        }

        return {
          id: c.id,
          cardName: `${nomFr} (${c.name})`,
          setName: `${c.set.name} — ${c.number}/${c.set.printedTotal}`,
          number: c.number,
          price: Number(price.toFixed(2)),
          imageUrl: c.images?.large || c.images?.small
        };
      });
    }

    // Si la recherche TCG n'a rien renvoyé ou a été filtrée
    if (candidates.length === 0) {
      return res.status(404).json({
        error: `L'IA a détecté "${nomFr}" (N°${num || '?'}), mais aucune carte correspondante n'a été trouvée sur l'API.`
      });
    }

    return res.status(200).json({
      detectedName: nomFr,
      detectedNum: num,
      candidates: candidates
    });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur : ' + err.message });
  }
}

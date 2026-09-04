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

    // 1. CLÉS API GEMINI
    const key1 = process.env.GEMINI_API_KEY_1;
    const key2 = process.env.GEMINI_API_KEY_2;
    const availableKeys = [key1, key2].filter(Boolean);

    if (availableKeys.length === 0) {
      return res.status(500).json({ error: 'Aucune clé GEMINI configurée.' });
    }

    const keysToTry = availableKeys.sort(() => Math.random() - 0.5);

    // 2. MODÈLES GEMINI
    // "gemini-2.0-flash" est arrêté depuis le 01/06/2026 : il ne répondra plus.
    // Vérifiez la liste à jour sur https://ai.google.dev/gemini-api/docs/models
    // avant de déployer, ces identifiants changent souvent.
    const modelsToTry = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite'
    ];

    const base64 = image.split(',')[1] || image;
    const mimeType = image.match(/data:(.*?);/)?.[1] || 'image/jpeg';

    const prompt = `Analyse cette image d'une carte Pokémon. Regarde attentivement les petites mentions imprimées en bas de la carte : le numéro de la carte (souvent sous la forme "23/102"), et le nom ou symbole de l'extension.

Renvoie UNIQUEMENT un objet JSON valide, sans Markdown, au format :
{"fr": "NomFrançais", "en": "NomAnglais", "num": "NuméroTelQueImprimé", "set_name": "NomExtension"}

Règles importantes :
- Si le numéro est affiché sous forme de fraction (ex: "23/102"), renvoie-le tel quel dans "num" (ne renvoie pas seulement "23").
- Si tu n'es pas certain du nom exact de l'extension, laisse "set_name" vide ("") plutôt que d'inventer une valeur approximative : une fausse extension fait échouer la recherche de la carte.`;

    let rawResultText = null;
    let lastFailureReason = null;

    // 3. APPEL IA
    keyLoop: for (const apiKey of keysToTry) {
      for (const model of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
                temperature: 0.1,
                thinkingConfig: { thinkingBudget: 0 }
              }
            }),
            signal: AbortSignal.timeout(15000)
          });

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            rawResultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (rawResultText) break keyLoop;
            // Réponse HTTP 200 mais pas de texte exploitable (ex: image bloquée
            // par les filtres de sécurité de Gemini -> finishReason "SAFETY").
            const finishReason = geminiData.candidates?.[0]?.finishReason;
            lastFailureReason = `Réponse vide du modèle ${model} (finishReason: ${finishReason || 'inconnu'})`;
            console.error('[scan.js] ' + lastFailureReason, JSON.stringify(geminiData).slice(0, 500));
          } else {
            const errBody = await geminiRes.text().catch(() => '');
            lastFailureReason = `HTTP ${geminiRes.status} sur le modèle ${model}`;
            console.error('[scan.js] ' + lastFailureReason, errBody.slice(0, 500));
          }
        } catch (err) {
          lastFailureReason = `Exception sur le modèle ${model} : ${err.message}`;
          console.error('[scan.js] ' + lastFailureReason);
        }
      }
    }

    if (!rawResultText) {
      console.error('[scan.js] Échec total. Dernière raison : ' + lastFailureReason);
      return res.status(502).json({
        error: 'L\'IA n\'a pas pu analyser l\'image.',
        detail: lastFailureReason || undefined
      });
    }

    // 4. PARSING RÉPONSE IA
    let cardData = {};
    try {
      const cleanJson = rawResultText.replace(/```json/g, '').replace(/```/g, '').trim();
      cardData = JSON.parse(cleanJson);
    } catch (err) {
      return res.status(502).json({ error: 'Réponse IA illisible, réessayez avec une photo plus nette.' });
    }

    const detectedName = cardData.fr || cardData.en || 'Inconnu';
    const detectedNameEn = cardData.en || cardData.fr || '';
    const detectedSet = cardData.set_name || '';
    const detectedNum = cardData.num || '';

    // 5. RECHERCHE DES CANDIDATS SUR TCGDEX
    // Doc: https://tcgdex.dev/rest/filtering-sorting-pagination
    // "name=<valeur>" fait une recherche "contient" (non sensible à la casse).
    let candidates = [];
    let searchDebugNote = null;
    try {
      const result = await searchTcgdexCandidates(detectedName, detectedNameEn, detectedNum, detectedSet);
      candidates = result.candidates;
      searchDebugNote = result.debugNote;
    } catch (err) {
      // On ne bloque pas le scan si TCGdex est indisponible : on retombe sur
      // le mode "carte non trouvée" plus bas côté front.
      candidates = [];
      searchDebugNote = 'Erreur recherche TCGdex : ' + err.message;
    }

    return res.status(200).json({
      candidates,
      detectedName,
      detectedSet,
      detectedNum,
      debugNote: searchDebugNote || undefined
    });

  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur inattendue : ' + err.message });
  }
}

// Extrait le numéro local et le total d'une chaîne du type "23/102", "023", ou "23".
function parseCardNumber(rawNum) {
  if (!rawNum) return { local: '', total: '' };
  const fraction = String(rawNum).match(/(\d+)\s*\/\s*(\d+)/);
  if (fraction) return { local: fraction[1], total: fraction[2] };
  const onlyDigits = String(rawNum).match(/\d+/);
  return { local: onlyDigits ? onlyDigits[0] : '', total: '' };
}

// Compare deux numéros de carte en ignorant les zéros de tête ("023" === "23").
function localIdsMatch(a, b) {
  if (!a || !b) return false;
  if (String(a) === String(b)) return true;
  const aN = parseInt(a, 10);
  const bN = parseInt(b, 10);
  return !isNaN(aN) && !isNaN(bN) && aN === bN;
}

function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// --- Recherche de cartes correspondantes sur TCGdex (API publique, sans clé) ---
// Stratégie : le numéro imprimé sur la carte est bien plus fiable que le nom de
// l'extension deviné par l'IA. On filtre donc d'abord par nom + numéro exact
// côté API, puis on classe les résultats restants par pertinence (numéro,
// total de cartes du set, proximité du nom d'extension) avant de les renvoyer.
async function searchTcgdexCandidates(nameFr, nameEn, numRaw, setNameHint) {
  const { local, total } = parseCardNumber(numRaw);
  // TCGdex stocke les localId sans zéros de tête (ex: "99", pas "099"), alors
  // que le numéro imprimé sur la carte en a souvent. On normalise avant de
  // filtrer côté API, sinon "eq:099" ne matchera jamais "99".
  const localForQuery = /^\d+$/.test(local) ? String(parseInt(local, 10)) : local;
  const controller = AbortSignal.timeout(10000);
  const results = new Map();

  async function fetchNameSearch(withLocalIdFilter) {
    for (const [lang, name] of [['fr', nameFr], ['en', nameEn]]) {
      if (!name) continue;
      const params = new URLSearchParams({ name });
      if (withLocalIdFilter && localForQuery) params.set('localId', `eq:${localForQuery}`);
      try {
        const r = await fetch(`https://api.tcgdex.net/v2/${lang}/cards?${params.toString()}`, { signal: controller });
        if (!r.ok) continue;
        const list = await r.json();
        for (const item of list) {
          if (!results.has(item.id)) results.set(item.id, item);
        }
      } catch (err) {
        // on ignore et on tente la langue/requête suivante
      }
    }
  }

  // 1) Recherche stricte : nom + numéro exact (le plus fiable).
  if (local) await fetchNameSearch(true);

  // 2) Si l'OCR du numéro était faux ou absent, on retombe sur le nom seul.
  if (results.size === 0) await fetchNameSearch(false);

  // On garde une marge de candidats pour pouvoir les trier avant de couper à 6.
  const briefs = Array.from(results.values()).slice(0, 15);

  const detailed = await Promise.all(
    briefs.map(async (brief) => {
      try {
        const r = await fetch(`https://api.tcgdex.net/v2/fr/cards/${brief.id}`, { signal: controller });
        if (!r.ok) throw new Error('detail fetch failed');
        const full = await r.json();
        const price = full.pricing?.cardmarket?.avg ?? full.pricing?.cardmarket?.trend ?? 0;
        return {
          id: full.id,
          cardName: full.name,
          setName: full.set?.name || 'Extension inconnue',
          setTotal: full.set?.cardCount?.official || full.set?.cardCount?.total || null,
          number: full.localId,
          price: Number(price) || 0,
          imageUrl: full.image ? `${full.image}/high.webp` : ''
        };
      } catch (err) {
        // Détails indisponibles : on garde une entrée minimale à partir du brief.
        return {
          id: brief.id,
          cardName: brief.name,
          setName: 'Extension inconnue',
          setTotal: null,
          number: brief.localId,
          price: 0,
          imageUrl: brief.image ? `${brief.image}/high.webp` : ''
        };
      }
    })
  );

  // Score de pertinence, du plus fort au plus faible indice :
  //   - numéro imprimé identique (+3)
  //   - total de cartes de l'extension identique (+2)
  //   - nom de l'extension détecté par l'IA proche du vrai nom du set (+2)
  const setHint = normalizeText(setNameHint);
  const totalAsNumber = total ? parseInt(total, 10) : null;
  const scored = detailed.map(c => {
    const localMatch = localIdsMatch(c.number, local);
    const totalMatch = !!(totalAsNumber && c.setTotal && parseInt(c.setTotal, 10) === totalAsNumber);
    const nameMatch = !!(setHint && normalizeText(c.setName).includes(setHint));
    let score = 0;
    if (localMatch) score += 3;
    if (totalMatch) score += 2;
    if (nameMatch) score += 2;
    return { card: c, score, localMatch, totalMatch, nameMatch };
  });

  scored.sort((a, b) => b.score - a.score);

  // Le numéro imprimé sur la carte est le SEUL signal totalement fiable (il est
  // lu directement sur la carte, contrairement au nom d'extension qui est
  // déduit par l'IA et peut coïncider avec une autre édition du même Pokémon).
  // On exige donc explicitement sa correspondance quand un numéro a pu être
  // détecté ; le nom d'extension seul ne suffit plus à qualifier un candidat
  // (cas vécu : "Rattatac" n°099 absent de TCGdex, mais le n°061 de la même
  // extension remontait à tort juste parce que le nom du set correspondait).
  const relevant = local
    ? scored.filter(s => s.localMatch)
    : scored.filter(s => s.totalMatch || s.nameMatch);

  // Trace de debug systématique (toujours calculée pendant la mise au point) :
  // liste des meilleurs candidats bruts avec leur score et leur localId TEL
  // QUE STOCKÉ PAR TCGDEX.
  const debugNote = scored.slice(0, 8).map(s =>
    `${s.card.cardName} [id:${s.card.id}] localId:"${s.card.number}" set:"${s.card.setName}" score:${s.score}`
  ).join(' | ') || null;

  if (relevant.length === 0 && scored.length > 0) {
    console.error('[scan.js] Candidats trouvés mais aucun retenu (local=' + local + ', total=' + total + ', setHint="' + setNameHint + '") -> ' + debugNote);
  } else {
    console.log('[scan.js] Recherche (local=' + local + ', total=' + total + ', setHint="' + setNameHint + '") -> ' + debugNote);
  }

  return {
    candidates: relevant.slice(0, 6).map(({ card }) => {
      const { setTotal, ...publicFields } = card;
      return publicFields;
    }),
    debugNote
  };
}

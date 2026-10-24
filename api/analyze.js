// ============================================================
//  Capilario : analyse capillaire par IA
//  Fonction serverless (Vercel). Reçoit la photo + le questionnaire,
//  demande une analyse à Claude, renvoie un JSON propre au site.
//  La clé API reste côté serveur (variable d'environnement) :
//  elle n'est JAMAIS visible dans le navigateur.
// ============================================================

const SYSTEM = `Tu es l'assistant d'analyse capillaire de Capilario.
À partir d'une photo et des réponses d'un questionnaire, tu produis une ANALYSE COSMÉTIQUE ET DE SOIN, jamais un diagnostic médical, jamais un nom de pathologie.

Règles:
- Décris uniquement ce qui est observable sur la photo (densité apparente, zones plus clairsemées, ligne d'implantation, état visible du cuir chevelu).
- Reste factuel et bienveillant. N'affirme jamais de certitude médicale. Les valeurs chiffrées sont des ESTIMATIONS INDICATIVES, pas des mesures.
- Adapte l'analyse aux réponses du questionnaire (zone, ancienneté, âge, type de cheveu, objectif).
- Si la photo est inexploitable (floue, aucun cheveu visible), renvoie verdict="Photo inexploitable" et des champs neutres.

Réponds STRICTEMENT en JSON valide, sans texte autour, sans balises Markdown, avec exactement ce schéma (dans cet ordre) :
{
  "observation": "2 à 3 phrases factuelles sur ce que tu VOIS sur la photo de la zone : cuir chevelu visible ou non, ligne d'implantation, finesse des cheveux, régularité. Écris-les AVANT de noter.",
  "mesures": {
    "cuirVisible": entier 0-10,
    "couverture": entier 0-10,
    "recul": entier 0-10,
    "epaisseur": entier 0-10,
    "uniformite": entier 0-10
  },
  "verdict": "titre court du phénomène observé (ex: 'Recul fronto-temporal débutant')",
  "subtitle": "une phrase encourageante et orientée soin",
  "zone": "zone analysée en clair",
  "stage": "Précoce | Précoce à modéré | Modéré | Installé",
  "hairType": "Raides | Ondulés | Bouclés | Crépus",
  "follicles": nombre entier (estimation indicative de follicules dans le cadre),
  "indicators": [
    { "k": "libellé court de l'indicateur", "v": "valeur courte" }
  ],
  "analysis": "UN paragraphe d'analyse réel et personnalisé (3 à 5 phrases), rédigé à partir de CE qui est visible sur la photo ET des réponses du questionnaire (zone, ancienneté, âge, type, objectif). Concret, bienveillant, orienté soin. Sans promesse de repousse ni terme médical."
}

LES 5 MESURES (obligatoires). Note-les d'après la PHOTO SEULE, sur la zone analysée. N'en tiens PAS compte du questionnaire (ancienneté, antécédents, objectif) : il sert uniquement à rédiger l'analyse.
- cuirVisible : la peau du crâne qu'on voit À TRAVERS les cheveux, entre les cheveux. Le front et les tempes sans cheveux ne comptent PAS ici.
  0-2 = on ne voit pas la peau sous les cheveux ; 3-4 = on la devine par endroits ; 5-6 = clairement visible sur une partie de la zone ; 7-8 = bien visible sur la plupart de la zone ; 9-10 = zone presque dégarnie.
- couverture : quantité de cheveux qui couvre la zone. 9-10 = chevelure pleine ; 7-8 = bien couverte avec quelques zones plus fines ; 5-6 = couverture partielle ; 3-4 = clairsemée ; 0-2 = presque plus de cheveux.
- recul : position de la ligne d'implantation (front et tempes). 0-2 = ligne basse et droite ; 3-4 = golfes légers, courants chez l'adulte ; 5-6 = golfes nets, forme en M visible ; 7-8 = golfes profonds ; 9-10 = front dégarni jusqu'au sommet. Si la zone est le sommet du crâne ou la densité générale, note l'éclaircissement de cette zone avec la même échelle.
- epaisseur : diamètre apparent des cheveux. 9-10 = épais ; 6-8 = normaux ; 4-5 = plutôt fins ; 0-3 = très fins.
- uniformite : 9-10 = densité homogène ; 6-8 = légères différences ; 3-5 = différences nettes ; 0-2 = très irrégulière.
Sois juste : une chevelure épaisse avec des golfes légers n'est PAS une zone clairsemée. Le score de densité sur 100 est calculé à partir de ces 5 notes : ne le donne pas.

Donne 4 à 6 "indicators" pertinents (ex: Densité apparente, Ligne d'implantation, État du cuir chevelu, Uniformité, Texture, Zone la plus marquée) avec des valeurs courtes et parlantes. Pour « Densité apparente », mets "à calculer" : la valeur sera remplacée.

IMPORTANT, langue de réponse : rédige TOUTES les valeurs de texte (observation, verdict, subtitle, zone, stage, hairType, indicators, analysis) dans la langue demandée par l'utilisateur (voir "Langue :" dans le message). "fr" = français, "en" = anglais, "es" = espagnol, "de" = allemand.
TYPOGRAPHIE : n'utilise JAMAIS de tiret long ni de tiret moyen dans les textes. Fais des phrases courtes, avec des virgules, des points ou des deux-points.`;

// Pas de tiret long ni moyen dans les textes générés : ça fait « texte d'IA ».
function noDash(v) {
  if (typeof v === 'string') return v
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/,\s*([.,;:!?])/g, '$1')
    .replace(/^,\s*/, '');
  if (Array.isArray(v)) return v.map(noDash);
  if (v && typeof v === 'object') { Object.keys(v).forEach(k => { v[k] = noDash(v[k]); }); return v; }
  return v;
}

// Indice de densité calculé à partir des 5 mesures de l'IA (0-10 chacune).
// Une note globale demandée directement retombe presque toujours sur la même valeur ;
// des mesures concrètes et séparées donnent un résultat qui suit vraiment la photo.
function densityFromMeasures(m) {
  if (!m || typeof m !== 'object') return null;
  const n = k => { const v = Number(m[k]); return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : null; };
  const cv = n('cuirVisible'), co = n('couverture'), re = n('recul'), ep = n('epaisseur'), un = n('uniformite');
  if ([cv, co, re, ep, un].some(x => x === null)) return null;
  // la densité repose surtout sur la peau visible et la couverture ; le recul a son propre indicateur
  const s = 0.35 * (10 - cv) + 0.35 * co + 0.10 * (10 - re) + 0.12 * ep + 0.08 * un;   // sur 10
  return Math.max(5, Math.min(98, Math.round(s * 10)));
}
const SEVERITY = {
  fr: ['Légère', 'Modérée', 'Marquée'], en: ['Mild', 'Moderate', 'Marked'],
  es: ['Leve', 'Moderada', 'Marcada'], de: ['Leicht', 'Mäßig', 'Ausgeprägt']
};
const DENS_LABEL = { fr: 'Densité apparente', en: 'Apparent density', es: 'Densidad aparente', de: 'Sichtbare Dichte' };

const STAGE_HINT = {
  fr: 'Précoce | Précoce à modéré | Modéré | Installé',
  en: 'Early | Early to moderate | Moderate | Established',
  es: 'Inicial | Inicial a moderado | Moderado | Establecido',
  de: 'Früh | Früh bis mäßig | Mäßig | Fortgeschritten'
};

module.exports = async (req, res) => {
  // Autorise l'appel (utile si le site est servi depuis un autre domaine un jour)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { answers = {}, photo = '', lang = 'fr' } = req.body || {};
    const L = ['fr','en','es','de'].includes(lang) ? lang : 'fr';

    // Sépare le type d'image et les données base64 depuis la "data URL" envoyée par le site
    let media = 'image/jpeg';
    let data = photo;
    const m = /^data:(.+?);base64,(.*)$/s.exec(photo);
    if (m) { media = m[1]; data = m[2]; }
    if (!data) return res.status(400).json({ error: 'Photo manquante' });

    const userText =
      'Langue : ' + L + ' (valeurs "stage" attendues : ' + STAGE_HINT[L] + ')\n\n' +
      'Réponses du questionnaire (JSON):\n' +
      JSON.stringify(answers, null, 2) +
      '\n\nAnalyse la photo ci-jointe selon tes règles et renvoie UNIQUEMENT le JSON du schéma, avec tous les textes dans la langue "' + L + '".';

    // Appel au modèle de vision
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',   // rapide + pas cher pour le volume gratuit
        max_tokens: 1000,
        temperature: 0.2,                     // une même photo donne (presque) la même note
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data } },
            { type: 'text', text: userText }
          ]
        }]
      })
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return res.status(502).json({ error: 'Erreur du modèle IA', detail });
    }

    const out = await apiRes.json();
    let text = (out.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const s = text.indexOf('{');
      const en = text.lastIndexOf('}');
      parsed = JSON.parse(text.slice(s, en + 1));
    }

    // garde-fous de type
    parsed = noDash(parsed);
    const unusable = /inexploitable|unusable|not usable|inutilizable|no utilizable|unbrauchbar/i.test(String(parsed.verdict || ''));
    const fromM = unusable ? 0 : densityFromMeasures(parsed.mesures);
    parsed.densityIndex = fromM !== null ? fromM : Math.max(0, Math.min(100, parseInt(parsed.densityIndex, 10) || 0));
    if (unusable) parsed.severity = '';
    // sévérité toujours cohérente avec l'indice (même grille partout)
    const di = parsed.densityIndex, sv = SEVERITY[L];
    if (di > 0) parsed.severity = di >= 70 ? sv[0] : (di >= 50 ? sv[1] : sv[2]);
    console.log('analyze', JSON.stringify({ zone: answers.zone, duree: answers.duree, mesures: parsed.mesures || null, densityIndex: di }));
    delete parsed.mesures; delete parsed.observation;
    parsed.follicles = parseInt(parsed.follicles, 10) || 0;
    if (!Array.isArray(parsed.indicators)) parsed.indicators = [];
    parsed.indicators = parsed.indicators.filter(x => x && x.k && x.v).slice(0, 6);
    // l'indicateur « Densité apparente » affiche toujours l'indice calculé
    if (parsed.densityIndex > 0) {
      const i = parsed.indicators.findIndex(x => /densit|density|dichte/i.test(x.k));
      const item = { k: i >= 0 ? parsed.indicators[i].k : DENS_LABEL[L], v: parsed.densityIndex + ' / 100' };
      if (i >= 0) parsed.indicators[i] = item; else parsed.indicators.unshift(item);
      parsed.indicators = parsed.indicators.slice(0, 6);
    }
    if (typeof parsed.analysis !== 'string') parsed.analysis = '';
    if (typeof parsed.severity !== 'string') parsed.severity = '';

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};

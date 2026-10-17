// ============================================================
//  Capilario — Génération du rapport complet (après paiement)
//  Reçoit { session_id }. Vérifie AUPRÈS DE STRIPE que la session
//  est bien payée, puis génère le bilan complet à partir des
//  données rangées dans la session. Verrou anti-fraude : sans
//  paiement confirmé, aucun rapport n'est renvoyé.
// ============================================================

// Catalogue de produits (vraies marques tendance) — l'IA choisit PARMI ceux-ci, par id.
// Cadrage cosmétique. Liens fiables (recherche marchande / site marque), éditables.
// "img" = photo du produit (laisse vide => illustration automatique).
//   Pour mettre une vraie photo : soit une URL (flux d'affiliation / CDN),
//   soit dépose le fichier dans /img/ et mets img:'/img/ricin.jpg'.
//   Si une image casse, le site retombe tout seul sur l'illustration.
const CATALOG = [
  { id:'ricin', name:'Huile de ricin', brand:'', type:'oil', url:'https://www.amazon.fr/s?k=huile+de+ricin+bio+cheveux', img:'' },
  { id:'romarin', name:'Huile de romarin', brand:'', type:'leaf', url:'https://www.amazon.fr/s?k=huile+romarin+cheveux', img:'' },
  { id:'derma', name:'Derma roller 0,5 mm', brand:'', type:'roller', url:'https://www.amazon.fr/s?k=derma+roller+cuir+chevelu+0.5mm', img:'' },
  { id:'ordinary-peptide', name:'Multi-Peptide Serum', brand:'The Ordinary', type:'serum', url:'https://www.amazon.fr/s?k=the+ordinary+multi+peptide+hair+density+serum', img:'' },
  { id:'horace', name:'Soin densité cheveux', brand:'Horace', type:'serum', url:'https://www.horace.co', img:'' },
  { id:'nioxin', name:'Système densité', brand:'Nioxin', type:'shampoo', url:'https://www.amazon.fr/s?k=nioxin+system', img:'' },
  { id:'kerastase-genesis', name:'Genesis sérum', brand:'Kérastase', type:'serum', url:'https://www.amazon.fr/s?k=kerastase+genesis+serum', img:'' },
  { id:'alpecin', name:'Shampoing caféine', brand:'Alpecin', type:'shampoo', url:'https://www.amazon.fr/s?k=alpecin+caffeine+shampoing', img:'' },
  { id:'sulfate-free', name:'Shampoing doux sans sulfates', brand:'', type:'shampoo', url:'https://www.amazon.fr/s?k=shampoing+doux+sans+sulfate', img:'' },
  { id:'biotine', name:'Complément biotine & zinc', brand:'', type:'mask', url:'https://www.amazon.fr/s?k=complement+biotine+zinc+cheveux', img:'' },
  { id:'scalp-serum', name:'Sérum fortifiant cuir chevelu', brand:'', type:'serum', url:'https://www.amazon.fr/s?k=serum+fortifiant+cuir+chevelu', img:'' },
  { id:'masque', name:'Masque nourrissant intense', brand:'', type:'mask', url:'https://www.amazon.fr/s?k=masque+capillaire+nourrissant', img:'' }
];

const SYSTEM = `Tu es l'expert soin capillaire de Capilario. Tu génères un BILAN CAPILLAIRE COMPLET, cosmétique et de soin — JAMAIS médical, jamais de nom de pathologie, AUCUNE promesse de guérison ni de "repousse garantie". Tu parles d'aspect, de densité apparente, d'entretien, de fibre capillaire et de cuir chevelu sain.
Personnalise FORTEMENT selon la zone, l'ancienneté, l'âge, le type de cheveu et l'objectif. Emploie un vocabulaire précis et crédible (fibre capillaire, cuir chevelu, ligne d'implantation, densité apparente, microcirculation, sébum, kératine, cycle pilaire) SANS jamais poser de diagnostic.

PRODUITS : tu choisis UNIQUEMENT parmi le CATALOGUE fourni, par leur "id". Sélectionne 3 à 5 produits réellement pertinents pour CE profil précis et explique, pour chacun, POURQUOI ce produit pour CETTE personne.

Réponds STRICTEMENT en JSON valide (minifié, une seule ligne, pas de guillemets doubles dans les textes, pas de virgule finale), schéma:
{
 "summary":"5 à 7 phrases d'analyse détaillée, précise et personnalisée (ce qui est observé, ce que ça implique côté soin, et l'approche recommandée)",
 "keyPoints":[{"title":"titre très court (2-4 mots)","text":"1 phrase clé percutante et personnalisée"}],
 "scores":[{"label":"Densité apparente","value":72},{"label":"Uniformité","value":60},{"label":"État du cuir chevelu","value":80},{"label":"Ligne d'implantation","value":65},{"label":"Qualité de la fibre","value":70}],
 "planning":[{"day":"Lundi","action":"geste du jour, court et concret"},{"day":"Mardi","action":"..."},{"day":"Mercredi","action":"..."},{"day":"Jeudi","action":"..."},{"day":"Vendredi","action":"..."},{"day":"Samedi","action":"..."},{"day":"Dimanche","action":"..."}],
 "routine":[{"phase":"Semaines 1-4","steps":["...","..."]},{"phase":"Semaines 5-8","steps":["...","..."]},{"phase":"Semaines 9-12","steps":["...","..."]}],
 "products":[{"id":"id du catalogue uniquement","why":"pourquoi ce produit pour cette personne (1 phrase)","how":"conseil d'usage court"}],
 "dos":["bonne habitude courte et concrète","..."],
 "donts":["habitude à éviter, courte et concrète (ex: casquette trop serrée au quotidien, lavage tous les jours avec un shampoing agressif)","..."],
 "cautions":["point de vigilance court","..."],
 "outlook":"1 à 2 phrases réalistes orientées soin et entretien (jamais de promesse de repousse)"
}
Donne EXACTEMENT 3 keyPoints, 4 à 6 scores (entiers 0-100), EXACTEMENT 7 jours de planning (lun→dim, un geste réaliste par jour, avec des jours plus légers), 3 phases de routine, 3 à 5 produits (ids du catalogue uniquement), 4 à 6 "dos", 4 à 6 "donts", 2 à 4 points de vigilance. Les conseils dos/donts doivent être personnalisés au profil (zone, type de cheveu, mode de vie) et rester cosmétiques.

Format OBLIGATOIRE : JSON minifié sur une seule ligne, pas de guillemets doubles à l'intérieur des textes, pas de virgule finale, rien d'autre que le JSON.

LANGUE : rédige TOUT (summary, keyPoints, scores.label, planning.day + planning.action, phases, steps, why, how, dos, donts, cautions, outlook) dans la langue demandée (fr = français, en = anglais, es = espagnol, de = allemand). Traduis les libellés de jour (Lundi→Monday/Lunes/Montag) et de phase.`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { session_id = '' } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'Session manquante' });

    // 1) Vérifier le paiement auprès de Stripe
    const sRes = await fetch(
      'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(session_id),
      { headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY } }
    );
    const session = await sRes.json();
    if (!sRes.ok) return res.status(502).json({ error: 'Erreur Stripe', detail: JSON.stringify(session) });
    // 'paid' = payé ; 'no_payment_required' = code promo 100% (accès gratuit)
    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return res.status(402).json({ error: 'Paiement non confirmé' });
    }

    // 2) Récupérer les données rangées à la création de la session
    let answers = {}, result = {};
    try { answers = JSON.parse(session.metadata?.a || '{}'); } catch (e) {}
    try { result = JSON.parse(session.metadata?.r || '{}'); } catch (e) {}
    const L = ['fr','en','es','de'].includes(session.metadata?.l) ? session.metadata.l : 'fr';

    // 3) Générer le bilan complet
    const catalogForAI = CATALOG.map(p => ({
      id: p.id,
      nom: (p.brand ? p.brand + ' — ' : '') + p.name,
      type: p.type
    }));
    const userText =
      'Langue : ' + L + ' (rédige tout le bilan dans cette langue)\n' +
      'Analyse (teaser): ' + JSON.stringify(result) +
      '\nRéponses du questionnaire: ' + JSON.stringify(answers) +
      '\n\nCATALOGUE DISPONIBLE (choisis 3 à 5 produits UNIQUEMENT via leur "id") :\n' +
      JSON.stringify(catalogForAI) +
      '\n\nGénère le bilan complet selon le schéma, entièrement en langue "' + L + '". ' +
      'Dans "products", ne mets que des objets {id, why, how} où "id" existe dans le catalogue ci-dessus.';

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',   // rapport payant → modèle plus qualitatif
        max_tokens: 2800,
        system: SYSTEM,
        messages: [{ role: 'user', content: userText }]
      })
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return res.status(502).json({ error: 'Erreur du modèle IA', detail });
    }

    const out = await apiRes.json();
    let rawText = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');

    // --- lecture robuste du JSON ---
    function extractJson(text){
      let t = String(text || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s >= 0 && e > s) t = t.slice(s, e + 1);
      t = t.replace(/,(\s*[}\]])/g, '$1'); // vire les virgules en trop avant } ou ]
      return t;
    }
    function tryParse(text){
      try { return JSON.parse(text); } catch (e) {}
      try { return JSON.parse(extractJson(text)); } catch (e) {}
      return null;
    }

    let report = tryParse(rawText);

    // Si le JSON est cassé, on demande au modèle de le réparer (rapide, une fois)
    if (!report) {
      try {
        const fixRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1400,
            system: 'On te donne un texte censé être du JSON mais invalide. Renvoie UNIQUEMENT le même contenu en JSON strictement valide et minifié, sans aucun texte autour.',
            messages: [{ role: 'user', content: rawText }]
          })
        });
        if (fixRes.ok) {
          const fj = await fixRes.json();
          const ft = (fj.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
          report = tryParse(ft);
        }
      } catch (e) {}
    }

    if (!report) {
      return res.status(502).json({ error: 'Format de bilan invalide', detail: rawText.slice(0, 300) });
    }

    // --- Normalisation / garde-fous ---
    const asStrArr = (a, n) => (Array.isArray(a) ? a : [])
      .filter(x => typeof x === 'string' && x.trim()).slice(0, n);

    // keyPoints : [{title, text}]
    if (!Array.isArray(report.keyPoints)) report.keyPoints = [];
    report.keyPoints = report.keyPoints
      .filter(k => k && (k.title || k.text))
      .map(k => ({ title: String(k.title || ''), text: String(k.text || '') }))
      .slice(0, 4);

    // planning : [{day, action}]
    if (!Array.isArray(report.planning)) report.planning = [];
    report.planning = report.planning
      .filter(p => p && (p.day || p.action))
      .map(p => ({ day: String(p.day || ''), action: String(p.action || '') }))
      .slice(0, 7);

    // dos / donts
    report.dos = asStrArr(report.dos, 6);
    report.donts = asStrArr(report.donts, 6);

    // Scores : tableau d'objets {label, value 0-100}
    if (!Array.isArray(report.scores)) report.scores = [];
    report.scores = report.scores
      .filter(s => s && typeof s.label === 'string')
      .map(s => {
        let v = parseInt(s.value, 10);
        if (isNaN(v)) v = 0;
        v = Math.max(0, Math.min(100, v));
        return { label: s.label, value: v };
      })
      .slice(0, 6);

    // Produits : on remappe les id choisis vers le vrai produit du catalogue
    const byId = {};
    CATALOG.forEach(p => { byId[p.id] = p; });
    if (!Array.isArray(report.products)) report.products = [];
    const seen = {};
    report.products = report.products
      .map(p => {
        if (!p) return null;
        // l'IA peut renvoyer {id,...} ; on retrouve le produit réel
        const base = byId[p.id] || byId[(p.type || '').toLowerCase()];
        if (!base) return null;
        if (seen[base.id]) return null;
        seen[base.id] = 1;
        return {
          id: base.id,
          name: base.name,
          brand: base.brand || '',
          type: base.type || 'serum',
          url: base.url,
          img: base.img || '',
          why: typeof p.why === 'string' ? p.why : '',
          how: typeof p.how === 'string' ? p.how : ''
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    // Filet de sécurité : si l'IA n'a renvoyé aucun produit exploitable,
    // on propose un petit socle neutre plutôt qu'une section vide.
    if (report.products.length === 0) {
      report.products = ['sulfate-free', 'scalp-serum', 'masque']
        .map(id => byId[id])
        .map(b => ({ id: b.id, name: b.name, brand: b.brand || '', type: b.type, url: b.url, img: b.img || '', why: '', how: '' }));
    }

    // on renvoie aussi le teaser + la langue pour l'affichage
    report._teaser = result;
    report._lang = L;
    return res.status(200).json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};

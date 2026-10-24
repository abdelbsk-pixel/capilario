// ============================================================
//  Capilario : génération du rapport complet (après paiement)
//  Reçoit { session_id }. Vérifie AUPRÈS DE STRIPE que la session
//  est bien payée, puis génère le bilan complet à partir des
//  données rangées dans la session. Verrou anti-fraude : sans
//  paiement confirmé, aucun rapport n'est renvoyé.
// ============================================================

// Catalogue de produits (vraies marques tendance) : l'IA choisit PARMI ceux-ci, par id.
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

const SYSTEM = `Tu es l'expert soin capillaire de Capilario. Tu génères un BILAN CAPILLAIRE COMPLET, cosmétique et de soin, JAMAIS médical, jamais de nom de pathologie, AUCUNE promesse de guérison ni de "repousse garantie". Tu parles d'aspect, de densité apparente, d'entretien, de fibre capillaire et de cuir chevelu sain.
Personnalise FORTEMENT selon la zone, l'ancienneté, l'âge, le type de cheveu et l'objectif. Emploie un vocabulaire précis et crédible (fibre capillaire, cuir chevelu, ligne d'implantation, densité apparente, microcirculation, sébum, kératine, cycle pilaire) SANS jamais poser de diagnostic.

PRODUITS : tu choisis UNIQUEMENT parmi le CATALOGUE fourni, par leur "id". Sélectionne 3 à 5 produits réellement pertinents pour CE profil précis et explique, pour chacun, POURQUOI ce produit pour CETTE personne.

Réponds STRICTEMENT en JSON valide (minifié, une seule ligne, pas de guillemets doubles dans les textes, pas de virgule finale), schéma:
{
 "summary":"5 à 7 phrases d'analyse détaillée, précise et personnalisée (ce qui est observé, ce que ça implique côté soin, et l'approche recommandée)",
 "keyPoints":[{"title":"titre très court (2-4 mots)","text":"1 phrase clé percutante et personnalisée"}],
 "scores":[{"label":"Densité apparente","value":"<densityIndex de l'analyse>"},{"label":"Uniformité","value":"<entier 0-100>"},{"label":"État du cuir chevelu","value":"<entier 0-100>"},{"label":"Ligne d'implantation","value":"<entier 0-100>"},{"label":"Qualité de la fibre","value":"<entier 0-100>"}],
 "planning":[{"day":"Lundi","action":"geste du jour, court et concret"},{"day":"Mardi","action":"..."},{"day":"Mercredi","action":"..."},{"day":"Jeudi","action":"..."},{"day":"Vendredi","action":"..."},{"day":"Samedi","action":"..."},{"day":"Dimanche","action":"..."}],
 "routine":[{"phase":"Semaines 1-4","steps":["...","..."]},{"phase":"Semaines 5-8","steps":["...","..."]},{"phase":"Semaines 9-12","steps":["...","..."]}],
 "products":[{"id":"id du catalogue uniquement","why":"pourquoi ce produit pour cette personne (1 phrase)","how":"conseil d'usage court"}],
 "dos":["bonne habitude courte et concrète","..."],
 "donts":["habitude à éviter, courte et concrète (ex: casquette trop serrée au quotidien, lavage tous les jours avec un shampoing agressif)","..."],
 "cautions":["point de vigilance court","..."],
 "outlook":"1 à 2 phrases réalistes orientées soin et entretien (jamais de promesse de repousse)"
}
SCORES : le premier score « Densité apparente » vaut EXACTEMENT le densityIndex de l'analyse (teaser). Les autres scores sont des entiers que tu estimes à partir de l'analyse (indicateurs, sévérité, zone) et du questionnaire, cohérents entre eux, sur toute l'échelle 0-100 (pas de valeurs par défaut ni répétées). Un indicateur décrit comme « reculé », « clairsemé » ou « marqué » doit avoir un score plus bas qu'un indicateur « sain » ou « bon ».
Donne EXACTEMENT 3 keyPoints, 4 à 6 scores (entiers 0-100), EXACTEMENT 7 jours de planning (lun→dim, un geste réaliste par jour, avec des jours plus légers), 3 phases de routine, 3 à 5 produits (ids du catalogue uniquement), 4 à 6 "dos", 4 à 6 "donts", 2 à 4 points de vigilance. Les conseils dos/donts doivent être personnalisés au profil (zone, type de cheveu, mode de vie) et rester cosmétiques.

Format OBLIGATOIRE : JSON minifié sur une seule ligne, pas de guillemets doubles à l'intérieur des textes, pas de virgule finale, rien d'autre que le JSON.

LANGUE : rédige TOUT (summary, keyPoints, scores.label, planning.day + planning.action, phases, steps, why, how, dos, donts, cautions, outlook) dans la langue demandée (fr = français, en = anglais, es = espagnol, de = allemand). Traduis les libellés de jour (Lundi→Monday/Lunes/Montag) et de phase.
TYPOGRAPHIE : n'utilise JAMAIS de tiret long ni de tiret moyen dans les textes. Fais des phrases courtes, avec des virgules, des points ou des deux-points.`;

// ============================================================
//  Email du bilan complet (envoyé une seule fois après paiement)
// ============================================================
const EMF = {
  fr:{ subject:'Votre bilan capillaire complet | Capilario', title:'Votre bilan capillaire complet',
    intro:'Merci pour votre confiance. Voici votre bilan complet, à garder sous la main.',
    zone:'Zone', stage:'Stade', key:'À retenir', scores:'Votre profil en détail', planning:'Votre semaine type',
    routine:'Votre routine sur 90 jours', reco:'Produits recommandés', see:'Voir le produit', dos:'À faire', donts:'À éviter',
    cautions:'Points de vigilance', outlook:'Évolution probable', back:'Revoir mon bilan en ligne',
    disclaimer:'Analyse cosmétique à visée de soin. Ne constitue pas un avis médical.' },
  en:{ subject:'Your full hair report | Capilario', title:'Your full hair report',
    intro:'Thank you for your trust. Here is your full report, to keep at hand.',
    zone:'Area', stage:'Stage', key:'Key takeaways', scores:'Your profile in detail', planning:'Your typical week',
    routine:'Your 90-day routine', reco:'Recommended products', see:'View product', dos:'Do', donts:'Avoid',
    cautions:'Points of caution', outlook:'Likely evolution', back:'View my report online',
    disclaimer:'Cosmetic care analysis. Not a medical opinion.' },
  es:{ subject:'Su informe capilar completo | Capilario', title:'Su informe capilar completo',
    intro:'Gracias por su confianza. Aquí tiene su informe completo, para tenerlo a mano.',
    zone:'Zona', stage:'Etapa', key:'Para recordar', scores:'Su perfil en detalle', planning:'Su semana tipo',
    routine:'Su rutina de 90 días', reco:'Productos recomendados', see:'Ver el producto', dos:'Hacer', donts:'Evitar',
    cautions:'Puntos de atención', outlook:'Evolución probable', back:'Ver mi informe en línea',
    disclaimer:'Análisis cosmético de cuidado. No constituye una opinión médica.' },
  de:{ subject:'Ihre vollständige Haar-Analyse | Capilario', title:'Ihre vollständige Haar-Analyse',
    intro:'Danke für Ihr Vertrauen. Hier ist Ihre vollständige Analyse zum Aufbewahren.',
    zone:'Zone', stage:'Stadium', key:'Zum Merken', scores:'Ihr Profil im Detail', planning:'Ihre typische Woche',
    routine:'Ihre 90-Tage-Routine', reco:'Empfohlene Produkte', see:'Produkt ansehen', dos:'Empfohlen', donts:'Vermeiden',
    cautions:'Hinweise', outlook:'Wahrscheinliche Entwicklung', back:'Analyse online ansehen',
    disclaimer:'Kosmetische Pflege-Analyse. Keine medizinische Beratung.' }
};
const escH = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const maskMail = m => { const [u, d] = String(m || '').split('@'); return d ? (u.slice(0, 1) + '•••@' + d) : ''; };

function buildFullEmail(rep, teaser, L, link) {
  const t = EMF[L] || EMF.fr, tz = teaser || {};
  const C = { ink:'#14201A', text:'#25302A', muted:'#56625B', euca:'#45685A', gold:'#B0884C', clay:'#B0603F', line:'#E3E8E0', bg:'#F3F5F0' };
  const serif = "Georgia,'Times New Roman',serif", sans = 'Arial,Helvetica,sans-serif';
  const h2 = s => `<tr><td style="padding:28px 0 10px;font-family:${serif};font-size:20px;color:${C.ink}">${escH(s)}</td></tr>`;
  const row = html => `<tr><td style="font-family:${sans};font-size:14px;line-height:1.55;color:${C.text}">${html}</td></tr>`;
  let b = '';
  b += `<tr><td style="font-family:${serif};font-size:26px;line-height:1.15;color:${C.ink};padding-bottom:10px">${escH(tz.verdict || t.title)}</td></tr>`;
  if (rep.summary) b += row(`<p style="margin:0">${escH(rep.summary)}</p>`);
  b += `<tr><td style="padding-top:16px"><table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.line};border-bottom:1px solid ${C.line}"><tr>
    <td width="50%" style="padding:10px 0;font-family:${sans};font-size:12px;color:${C.muted}">${escH(t.zone)}<br><b style="font-size:14px;color:${C.ink}">${escH(tz.zone || '-')}</b></td>
    <td width="50%" style="padding:10px 0 10px 14px;border-left:1px solid ${C.line};font-family:${sans};font-size:12px;color:${C.muted}">${escH(t.stage)}<br><b style="font-size:14px;color:${C.ink}">${escH(tz.stage || '-')}</b></td></tr></table></td></tr>`;
  if ((rep.keyPoints || []).length) {
    b += h2(t.key);
    rep.keyPoints.forEach(k => { b += row(`<p style="margin:0 0 10px"><span style="color:${C.gold}">●</span> <b style="color:${C.ink}">${escH(k.title)}</b><br><span style="color:${C.muted}">${escH(k.text)}</span></p>`); });
  }
  if ((rep.scores || []).length) {
    b += h2(t.scores);
    rep.scores.forEach(s => {
      const v = Math.max(0, Math.min(100, parseInt(s.value, 10) || 0)), w = Math.max(2, Math.min(98, v));
      const col = v >= 70 ? C.euca : v >= 45 ? C.gold : C.clay;
      b += `<tr><td style="padding:0 0 12px"><table width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="font-family:${sans};font-size:14px;color:${C.ink}">${escH(s.label)}</td>
        <td align="right" style="font-family:${sans};font-size:14px;font-weight:bold;color:${C.ink}">${v}<span style="font-weight:normal;color:${C.muted};font-size:12px">/100</span></td></tr></table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px"><tr>
        <td width="${w}%" style="background:${col};height:6px;font-size:0;line-height:0">&nbsp;</td>
        <td width="${100 - w}%" style="background:${C.line};height:6px;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>`;
    });
  }
  if ((rep.planning || []).length) {
    b += h2(t.planning);
    b += `<tr><td><table width="100%" cellpadding="0" cellspacing="0">` + rep.planning.map(p =>
      `<tr><td width="90" style="padding:9px 0;border-top:1px solid ${C.line};font-family:${serif};font-size:15px;color:${C.ink};vertical-align:top">${escH(p.day)}</td>
       <td style="padding:9px 0;border-top:1px solid ${C.line};font-family:${sans};font-size:14px;color:${C.text}">${escH(p.action)}</td></tr>`).join('') + `</table></td></tr>`;
  }
  if ((rep.routine || []).length) {
    b += h2(t.routine);
    rep.routine.forEach((ph, i) => {
      b += row(`<p style="margin:0 0 4px"><b style="color:${C.ink}">${i + 1}. ${escH(ph.phase)}</b></p><ul style="margin:0 0 14px;padding-left:20px">${(ph.steps || []).map(s => `<li style="margin:3px 0">${escH(s)}</li>`).join('')}</ul>`);
    });
  }
  if ((rep.products || []).length) {
    b += h2(t.reco);
    rep.products.forEach(p => {
      b += `<tr><td style="padding:0 0 12px"><table width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid ${C.line};border-radius:12px"><tr><td style="padding:14px 16px;font-family:${sans};font-size:14px;line-height:1.5;color:${C.text}">
        ${p.brand ? `<span style="color:${C.gold};font-size:12px;font-weight:bold">${escH(p.brand)}</span><br>` : ''}
        <span style="font-family:${serif};font-size:17px;color:${C.ink}">${escH(p.name)}</span>
        ${p.why ? `<br>${escH(p.why)}` : ''}${p.how ? `<br><span style="color:${C.euca}">${escH(p.how)}</span>` : ''}
        ${p.url && p.url !== '#' ? `<br><a href="${escH(p.url)}" style="display:inline-block;margin-top:8px;color:${C.ink};font-weight:bold;text-decoration:underline">${escH(t.see)}</a>` : ''}
      </td></tr></table></td></tr>`;
    });
  }
  const list = (arr, mark, col) => (arr || []).map(x => `<li style="margin:4px 0;list-style:none"><span style="color:${col};font-weight:bold">${mark}</span> ${escH(x)}</li>`).join('');
  if ((rep.dos || []).length || (rep.donts || []).length) {
    b += h2(t.dos + ' / ' + t.donts);
    if ((rep.dos || []).length) b += row(`<p style="margin:0 0 4px"><b style="color:${C.euca}">${escH(t.dos)}</b></p><ul style="margin:0 0 12px;padding:0">${list(rep.dos, '✓', C.euca)}</ul>`);
    if ((rep.donts || []).length) b += row(`<p style="margin:0 0 4px"><b style="color:${C.clay}">${escH(t.donts)}</b></p><ul style="margin:0;padding:0">${list(rep.donts, '✕', C.clay)}</ul>`);
  }
  if ((rep.cautions || []).length) { b += h2(t.cautions); b += row(`<ul style="margin:0;padding-left:20px">${rep.cautions.map(c => `<li style="margin:4px 0">${escH(c)}</li>`).join('')}</ul>`); }
  if (rep.outlook) {
    b += `<tr><td style="padding-top:24px"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0D1512;border-radius:14px"><tr><td style="padding:18px 20px">
      <div style="font-family:${sans};font-size:12px;color:#D2B07A">${escH(t.outlook)}</div>
      <div style="font-family:${serif};font-size:16px;line-height:1.5;color:#F3F5F0;margin-top:6px">${escH(rep.outlook)}</div></td></tr></table></td></tr>`;
  }
  return `<!DOCTYPE html><html><body style="margin:0;background:${C.bg}">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px">
    <tr><td style="padding:0 4px 16px;font-family:${serif};font-size:20px;color:${C.ink}">Capilario</td></tr>
    <tr><td style="background:#FBFCF9;border-radius:18px;padding:26px 24px;border:1px solid ${C.line}">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-family:${sans};font-size:13px;color:${C.muted};padding-bottom:14px">${escH(t.intro)}</td></tr>
        ${b}
        ${link ? `<tr><td style="padding-top:24px"><a href="${escH(link)}" style="display:inline-block;background:${C.ink};color:#F3F5F0;text-decoration:none;font-family:${sans};font-size:14px;font-weight:bold;padding:13px 20px;border-radius:12px">${escH(t.back)}</a></td></tr>` : ''}
      </table>
    </td></tr>
    <tr><td style="padding:16px 4px;font-family:${sans};font-size:11px;line-height:1.5;color:${C.muted};text-align:center">${escH(t.disclaimer)}<br>Capilario · capilario.com</td></tr>
  </table></td></tr></table></body></html>`;
}

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
      nom: (p.brand ? p.brand + ' · ' : '') + p.name,
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
    report = noDash(report);
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
    {
      const di = parseInt(result && result.densityIndex, 10);
      if (!isNaN(di) && di > 0) {
        const v = Math.max(0, Math.min(100, di));
        const i = report.scores.findIndex(s => /densit|density|dichte/i.test(s.label));
        if (i >= 0) report.scores[i].value = v;
      }
    }

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

    // --- Envoi du bilan complet par email (une seule fois par paiement) ---
    const to = (session.customer_details && session.customer_details.email) || session.customer_email || '';
    if (to) {
      report._mail = { to: maskMail(to) };
      if (session.metadata?.m !== '1') {
        try {
          const site = process.env.SITE_URL || 'https://www.capilario.com';
          const link = site + '/?paid=1&session_id=' + encodeURIComponent(session_id);
          const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 7000);
          const mRes = await fetch('https://api.resend.com/emails', {
            method: 'POST', signal: ctrl.signal,
            headers: { 'Authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: process.env.MAIL_FROM || 'Capilario <onboarding@resend.dev>',
              to: [to],
              subject: (EMF[L] || EMF.fr).subject,
              html: buildFullEmail(report, result, L, link)
            })
          });
          clearTimeout(timer);
          if (mRes.ok) {
            // on note dans la session Stripe que l'email est parti (évite les doublons au rechargement)
            const up = new URLSearchParams(); up.append('metadata[m]', '1');
            await fetch('https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(session_id), {
              method: 'POST',
              headers: { 'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
              body: up.toString()
            }).catch(() => {});
          } else {
            report._mail.failed = true;
            report._mail.detail = (await mRes.text()).slice(0, 300);
          }
        } catch (e) { report._mail.failed = true; report._mail.detail = String(e).slice(0, 200); }
      }
    }
    return res.status(200).json(report);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};

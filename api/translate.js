// ============================================================
//  Capilario : traduction d'un bilan déjà généré (changement de langue)
//  Reçoit { data, lang } et renvoie { data } avec les mêmes champs :
//  seuls les textes sont traduits. Les chiffres, liens, identifiants
//  et noms de produits / marques ne bougent pas.
// ============================================================

const LANGS = { fr: 'français', en: 'anglais', es: 'espagnol', de: 'allemand' };

// champs jamais traduits (le sous-arbre entier est ignoré)
const SKIP = new Set(['id', 'url', 'img', 'type', 'brand', 'name', 'value', '_lang', '_mail',
  'densityIndex', 'follicles', 'session_id']);

const MAX_STR = 2000;     // longueur max d'un texte
const MAX_TOTAL = 18000;  // volume max d'un bilan
const MAX_ITEMS = 240;    // nombre max de textes
const CHUNK = 2600;       // taille d'un lot envoyé à l'IA (lots traduits en parallèle)

const hasLetters = s => /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(s);

// parcours identique pour lire puis réécrire les textes, dans le même ordre
function walk(v, key, fn) {
  if (key && SKIP.has(key)) return v;
  if (typeof v === 'string') return hasLetters(v) ? fn(v) : v;
  if (Array.isArray(v)) return v.map(x => walk(x, key, fn));
  if (v && typeof v === 'object') {
    const o = {};
    Object.keys(v).forEach(k => { o[k] = walk(v[k], k, fn); });
    return o;
  }
  return v;
}

// Pas de tiret long ni moyen (signature de texte IA)
function noDash(s) {
  return String(s)
    .replace(/(\d)\s*[–—]\s*(\d)/g, '$1-$2')
    .replace(/\s*[–—]\s*/g, ', ')
    .replace(/,\s*([.,;:!?])/g, '$1')
    .replace(/^,\s*/, '');
}

function system(L) {
  return `Tu traduis les textes d'un bilan capillaire cosmétique (service Capilario) vers le ${LANGS[L]}.
Tu reçois un tableau JSON de chaînes. Réponds UNIQUEMENT avec un tableau JSON de chaînes : même nombre d'éléments, même ordre, chaque élément traduit.
Règles :
- Sens exact, ton bienveillant et professionnel, vocabulaire cosmétique et de soin. Jamais de terme médical ni de nom de pathologie.
- Ne traduis pas les noms de marques ni de produits. Garde les chiffres, les unités et les symboles.
- Les libellés courts (jours, titres, valeurs) restent courts.
- Si un texte est déjà dans la bonne langue, recopie-le tel quel.
- N'utilise jamais de tiret long ni de tiret moyen.
- Le résultat doit être du JSON valide : échappe les guillemets doubles à l'intérieur des textes.`;
}

async function translateChunk(arr, L) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',   // rapide et peu coûteux
      max_tokens: 4000,
      system: system(L),
      messages: [{ role: 'user', content: JSON.stringify(arr) }]
    })
  });
  if (!r.ok) throw new Error('IA ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const out = await r.json();
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('')
    .replace(/```json/g, '').replace(/```/g, '').trim();
  let res;
  try { res = JSON.parse(text); }
  catch (e) { res = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)); }
  if (!Array.isArray(res) || res.length !== arr.length) throw new Error('nombre de textes différent');
  return res.map((x, i) => (typeof x === 'string' && x.trim() ? noDash(x) : arr[i]));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { data, lang } = req.body || {};
    const L = LANGS[lang] ? lang : null;
    if (!L) return res.status(400).json({ error: 'Langue inconnue' });
    if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Bilan manquant' });

    // 1) on récupère les textes à traduire
    const texts = [];
    walk(data, '', s => { texts.push(s); return s; });
    if (!texts.length) return res.status(200).json({ data });
    const total = texts.reduce((n, s) => n + s.length, 0);
    if (texts.length > MAX_ITEMS || total > MAX_TOTAL || texts.some(s => s.length > MAX_STR)) {
      return res.status(413).json({ error: 'Bilan trop long à traduire' });
    }

    // 2) découpage en lots, traduits en parallèle (une nouvelle tentative par lot)
    const chunks = [];
    let cur = [], size = 0;
    texts.forEach(s => {
      if (cur.length && size + s.length > CHUNK) { chunks.push(cur); cur = []; size = 0; }
      cur.push(s); size += s.length;
    });
    if (cur.length) chunks.push(cur);
    const done = await Promise.all(chunks.map(c =>
      translateChunk(c, L).catch(() => translateChunk(c, L))));
    const flat = [].concat(...done);

    // 3) on réécrit les textes au même endroit
    let i = 0;
    const out = walk(data, '', () => flat[i++]);
    return res.status(200).json({ data: out });
  } catch (err) {
    return res.status(502).json({ error: 'Traduction indisponible', detail: String(err).slice(0, 300) });
  }
};

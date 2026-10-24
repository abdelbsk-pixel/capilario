// ============================================================
//  Capilario : générateur de scripts TikTok (faceless)
//  Reçoit { angle, count } et renvoie une liste de scripts prêts
//  à tourner : hook, texte à l'écran (scène par scène), voix off, CTA.
//  Cadrage STRICT : soin/analyse, aucune allégation santé, aucun
//  faux avant/après, aucune promesse de repousse.
// ============================================================

const SYSTEM = `Tu es le créateur de contenu de Capilario, un outil d'ANALYSE capillaire par IA (l'utilisateur prend une photo, une IA estime l'état de ses cheveux et propose une routine de soin + des produits cosmétiques).

Tu écris des scripts de vidéos TikTok "faceless" (sans visage, voix off + visuels/b-roll IA + texte à l'écran), format vertical 9:16, 15 à 30 secondes.

RÈGLES DE SÉCURITÉ ABSOLUES (ne jamais enfreindre) :
- JAMAIS de promesse de repousse, de guérison ou de résultat garanti.
- JAMAIS de faux avant/après, ni de faux témoignage.
- JAMAIS de diagnostic médical ni de nom de maladie présenté comme certain.
- On parle d'ANALYSE, de COMPRENDRE, de SOIN et d'ENTRETIEN cosmétique. On peut expliquer honnêtement des ingrédients (ex: huile de ricin) sans leur prêter de miracle.
- Le produit vedette, c'est l'OUTIL : "une IA qui analyse tes cheveux en 30 secondes". La démo du scan est le meilleur visuel.

RÈGLES D'EFFICACITÉ :
- Le hook (2 premières secondes) fait 80% du travail : accrocheur, curiosité, jamais racoleur-santé.
- CTA simple orienté "analyse gratuite, lien en bio".
- Varie les structures d'une vidéo à l'autre (l'algo bride si tout se ressemble).

Réponds STRICTEMENT en JSON valide, sans texte autour ni Markdown, avec ce schéma :
{
  "scripts": [
    {
      "titre": "nom court de la vidéo",
      "hook": "la phrase des 2 premières secondes",
      "scenes": [
        { "visuel": "ce qu'on voit / b-roll IA à générer (description courte)", "texte_ecran": "texte affiché", "voix_off": "ce que dit la voix" }
      ],
      "cta": "appel à l'action final",
      "hashtags": ["#...", "#..."],
      "idee_broll": "mots-clés pour trouver/générer les visuels"
    }
  ]
}
Donne 4 à 6 scènes par script. Réponds en français, ton naturel et direct. N'utilise jamais de tiret long ni de tiret moyen : des phrases courtes, avec des virgules ou des points.`;

const ANGLES = {
  demo: "Angle DÉMO DE L'OUTIL : on montre l'IA qui scanne les cheveux et sort un résultat. Curiosité + effet tech.",
  curiosite: "Angle CURIOSITY GAP : 'à quel stade es-tu vraiment ?', l'IA te le dit. On titille sans faire peur.",
  educ: "Angle ÉDUCATION HONNÊTE : expliquer un ingrédient ou un mécanisme (ex: huile de ricin, densité) sans promesse.",
  routine: "Angle ROUTINE/SOIN : montrer une routine simple et réaliste, orientée entretien.",
  mix: "Mélange varié des angles ci-dessus, une structure différente par script."
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { angle = 'mix', count = 3 } = req.body || {};
    const n = Math.max(1, Math.min(6, parseInt(count, 10) || 3));
    const angleText = ANGLES[angle] || ANGLES.mix;

    const userText = `${angleText}\n\nGénère ${n} scripts de vidéos TikTok différents pour Capilario, en respectant toutes les règles. Varie les hooks et les structures.`;

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 2500,
        system: SYSTEM,
        messages: [{ role: 'user', content: userText }]
      })
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return res.status(502).json({ error: 'Erreur du modèle IA', detail });
    }

    const out = await apiRes.json();
    let text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');

    function extractJson(t){
      t = String(t || '').replace(/```json/gi, '').replace(/```/g, '').trim();
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s >= 0 && e > s) t = t.slice(s, e + 1);
      return t.replace(/,(\s*[}\]])/g, '$1');
    }
    let data;
    try { data = JSON.parse(text); } catch (e) { data = JSON.parse(extractJson(text)); }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};

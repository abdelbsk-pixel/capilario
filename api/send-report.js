// ============================================================
//  Capilario : envoi du bilan gratuit par email (via Resend)
//  Reçoit { email, result } depuis le site et envoie un récap.
//  Clés côté serveur uniquement (variables d'environnement).
// ============================================================

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const EM = {
  fr: { subject:'Votre bilan capillaire Capilario', title:'Votre bilan capillaire', fallbackVerdict:'Analyse capillaire',
    zone:'Zone analysée', density:'Indice de densité', stage:'Stade estimé', type:'Type de cheveu',
    ctaTitle:'Allez plus loin avec le bilan complet',
    ctaDesc:'Analyse détaillée, routine sur 90 jours et produits ciblés adaptés à votre cas.',
    ctaBtn:'Débloquer mon bilan complet · 3,99 €',
    disclaimer:'Analyse cosmétique à visée de soin. Ne constitue pas un avis médical.' },
  en: { subject:'Your Capilario hair report', title:'Your hair report', fallbackVerdict:'Hair analysis',
    zone:'Analyzed area', density:'Density index', stage:'Estimated stage', type:'Hair type',
    ctaTitle:'Go further with the full report',
    ctaDesc:'Detailed analysis, a 90-day routine and targeted products matched to your case.',
    ctaBtn:'Unlock my full report · €3.99',
    disclaimer:'Cosmetic care analysis. Not a medical opinion.' },
  es: { subject:'Su informe capilar Capilario', title:'Su informe capilar', fallbackVerdict:'Análisis capilar',
    zone:'Zona analizada', density:'Índice de densidad', stage:'Etapa estimada', type:'Tipo de cabello',
    ctaTitle:'Vaya más lejos con el informe completo',
    ctaDesc:'Análisis detallado, rutina de 90 días y productos específicos adaptados a su caso.',
    ctaBtn:'Desbloquear mi informe completo · 3,99 €',
    disclaimer:'Análisis cosmético de cuidado. No constituye una opinión médica.' },
  de: { subject:'Ihre Capilario Haar-Analyse', title:'Ihre Haar-Analyse', fallbackVerdict:'Haaranalyse',
    zone:'Analysierte Zone', density:'Dichte-Index', stage:'Geschätztes Stadium', type:'Haartyp',
    ctaTitle:'Gehen Sie weiter mit der vollständigen Analyse',
    ctaDesc:'Detaillierte Analyse, 90-Tage-Routine und gezielte, auf Ihren Fall abgestimmte Produkte.',
    ctaBtn:'Vollständige Analyse freischalten · 3,99 €',
    disclaimer:'Kosmetische Pflege-Analyse. Keine medizinische Beratung.' }
};

function buildHtml(result, siteUrl, L) {
  const t = EM[L] || EM.fr;
  const r = result || {};
  const row = (k, v) => `
    <tr>
      <td style="padding:10px 0;color:#8C857A;font-size:14px;">${esc(k)}</td>
      <td style="padding:10px 0;text-align:right;font-weight:700;color:#2E2A24;font-size:14px;">${esc(v)}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html><body style="margin:0;background:#F5EFE4;font-family:Arial,Helvetica,sans-serif;color:#2E2A24;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#2E2A24;border-radius:16px;padding:22px 24px;">
      <div style="color:#D6B39F;font-weight:800;letter-spacing:2px;font-size:13px;">CAPILARIO</div>
      <div style="color:#F5EFE4;font-size:22px;font-weight:700;margin-top:8px;">${esc(t.title)}</div>
    </div>

    <div style="background:#ffffff;border-radius:16px;padding:22px 24px;margin-top:14px;">
      <div style="font-size:20px;font-weight:700;">${esc(r.verdict || t.fallbackVerdict)}</div>
      <div style="color:#8C857A;font-size:15px;margin-top:6px;">${esc(r.subtitle || '')}</div>

      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        ${row(t.zone, r.zone || '-')}
        ${row(t.density, (r.densityIndex != null ? r.densityIndex + '/100' : '-'))}
        ${row(t.stage, r.stage || '-')}
        ${row(t.type, r.hairType || '-')}
      </table>

      <div style="background:#F3ECDD;border-radius:12px;padding:16px;margin-top:18px;">
        <div style="font-weight:700;font-size:15px;">🔒 ${esc(t.ctaTitle)}</div>
        <div style="color:#8C857A;font-size:14px;margin-top:6px;">${esc(t.ctaDesc)}</div>
        <a href="${esc(siteUrl)}" style="display:inline-block;margin-top:14px;background:#556053;color:#ffffff;
          text-decoration:none;font-weight:700;font-size:15px;padding:12px 22px;border-radius:100px;">
          ${esc(t.ctaBtn)}
        </a>
      </div>
    </div>

    <div style="color:#9aa89e;font-size:12px;line-height:1.5;margin-top:16px;text-align:center;">
      ${esc(t.disclaimer)}<br>
      Capilario · ${esc(siteUrl)}
    </div>
  </div>
</body></html>`;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée' });

  try {
    const { email = '', result = {}, lang = 'fr' } = req.body || {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    const L = ['fr','en','es','de'].includes(lang) ? lang : 'fr';

    const from = process.env.MAIL_FROM || 'Capilario <onboarding@resend.dev>';
    const siteUrl = process.env.SITE_URL || 'https://capilario.vercel.app';

    const apiRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: email,
        subject: (EM[L] || EM.fr).subject,
        html: buildHtml(result, siteUrl, L)
      })
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text();
      return res.status(502).json({ error: 'Envoi impossible', detail });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erreur serveur', detail: String(err) });
  }
};

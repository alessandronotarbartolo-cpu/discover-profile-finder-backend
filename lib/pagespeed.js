const axios = require('axios');

/**
 * Recupera i Core Web Vitals e il punteggio Performance da Google
 * PageSpeed Insights (strategia "mobile", coerente con Discover che è
 * quasi interamente un'esperienza mobile).
 *
 * L'API PageSpeed Insights è gratuita. Senza una API key ha una quota
 * limitata condivisa per IP; se disponibile, impostare la variabile
 * d'ambiente GOOGLE_PAGESPEED_API_KEY (ottenibile gratis da Google Cloud
 * Console, nessun costo) alza notevolmente il limite di richieste.
 */
async function getCoreWebVitals(origin) {
  try {
    const params = {
      url: origin,
      strategy: 'mobile',
      category: 'performance',
    };
    if (process.env.GOOGLE_PAGESPEED_API_KEY) {
      params.key = process.env.GOOGLE_PAGESPEED_API_KEY;
    }

    const { data } = await axios.get(
      'https://www.googleapis.com/pagespeedonline/v5/runPagespeed',
      { params, timeout: 20000 }
    );

    const audits = data?.lighthouseResult?.audits || {};
    const metrics = data?.loadingExperience?.metrics || {};

    const performanceScore = data?.lighthouseResult?.categories?.performance?.score;

    // Preferiamo i dati "field" (utenti reali, CrUX) quando disponibili;
    // altrimenti usiamo la stima "lab" di Lighthouse.
    const lcp =
      metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile ??
      (audits['largest-contentful-paint']?.numericValue
        ? Math.round(audits['largest-contentful-paint'].numericValue)
        : null);

    const cls =
      metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile != null
        ? metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100
        : audits['cumulative-layout-shift']?.numericValue ?? null;

    const inp = metrics.INTERACTION_TO_NEXT_PAINT?.percentile ?? null;

    return {
      available: true,
      performanceScore: performanceScore != null ? Math.round(performanceScore * 100) : null,
      lcpMs: lcp,
      cls,
      inpMs: inp,
      source: metrics.LARGEST_CONTENTFUL_PAINT_MS ? 'field' : 'lab',
    };
  } catch (err) {
    return { available: false, error: true };
  }
}

module.exports = { getCoreWebVitals };

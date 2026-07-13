const probe = require('probe-image-size');

// Google raccomanda immagini larghe almeno 1200px per le card grandi in
// Google Discover; sotto questa soglia l'immagine può non qualificarsi
// per l'anteprima grande anche con max-image-preview:large attivo.
const DISCOVER_MIN_WIDTH = 1200;

/**
 * Rileva le dimensioni reali dell'immagine principale (tipicamente
 * og:image) senza scaricarla per intero: legge solo l'header necessario
 * a determinare larghezza/altezza, per qualsiasi formato comune
 * (JPEG, PNG, GIF, WebP, ecc.).
 */
async function checkImageSize(imageUrl) {
  if (!imageUrl) {
    return { checked: false, width: null, height: null, meetsDiscoverMinimum: false };
  }

  try {
    const result = await probe(imageUrl, { timeout: 8000 });
    return {
      checked: true,
      width: result.width,
      height: result.height,
      meetsDiscoverMinimum: result.width >= DISCOVER_MIN_WIDTH,
    };
  } catch (err) {
    return { checked: false, width: null, height: null, meetsDiscoverMinimum: false, error: true };
  }
}

module.exports = { checkImageSize, DISCOVER_MIN_WIDTH };

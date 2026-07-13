/**
 * Genera l'ID del profilo Google Discover a partire da un dominio,
 * secondo lo schema:
 *
 *   inner = 0x0A + varint(byte_length(domain)) + ASCII(domain)
 *   outer = 0x12 + varint(byte_length(inner))  + inner
 *   id    = base64url(outer)  (senza padding "=")
 *
 * Questo è uno schema di serializzazione a due campi "length-delimited"
 * (stile protobuf: tag 0x0A = campo 1 wiretype 2, tag 0x12 = campo 2
 * wiretype 2), con outer che avvolge inner.
 */

/**
 * Estrae e normalizza il dominio da un URL o stringa dominio.
 * - minuscolo
 * - rimuove "www."
 * - rimuove protocollo, path, query, fragment
 */
function normalizeDomain(input) {
  let d = String(input).trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, ''); // rimuove protocollo (es. https://)
  d = d.split(/[/?#]/)[0]; // rimuove path, query, fragment
  d = d.replace(/^www\./, ''); // rimuove prefisso www.
  d = d.replace(/:\d+$/, ''); // rimuove eventuale porta
  return d;
}

/**
 * Codifica un intero non negativo come varint stile protobuf (LEB128).
 * Per domini "normali" (< 128 byte) risulta in un singolo byte,
 * ma la funzione è generale per sicurezza.
 */
function encodeVarint(n) {
  const bytes = [];
  let value = n;
  while (value > 0x7f) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value & 0x7f);
  return Buffer.from(bytes);
}

/**
 * Converte un Buffer in Base64URL (senza padding), come richiesto:
 * "+" -> "-", "/" -> "_", rimozione di eventuali "=" finali.
 */
function toBase64Url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Genera l'ID del profilo Google Discover per un dominio normalizzato.
 */
function generateProfileId(domain) {
  const domainBytes = Buffer.from(domain, 'utf8'); // ASCII/UTF-8 del dominio

  const inner = Buffer.concat([
    Buffer.from([0x0a]),
    encodeVarint(domainBytes.length),
    domainBytes,
  ]);

  const outer = Buffer.concat([
    Buffer.from([0x12]),
    encodeVarint(inner.length),
    inner,
  ]);

  return toBase64Url(outer);
}

/**
 * Funzione di alto livello: da un URL (o dominio) grezzo genera
 * { domain, profileUrl }.
 */
function generateProfileLink(rawUrl) {
  const domain = normalizeDomain(rawUrl);
  const id = generateProfileId(domain);
  return {
    domain,
    profileUrl: `https://profile.google.com/cp/${id}`,
  };
}

module.exports = { normalizeDomain, encodeVarint, toBase64Url, generateProfileId, generateProfileLink };

const axios = require('axios');

/**
 * Recupera la data di registrazione di un dominio tramite RDAP
 * (Registration Data Access Protocol), il protocollo standard che ha
 * sostituito il WHOIS testuale ed è disponibile via HTTPS/JSON per la
 * maggior parte dei TLD (gTLD e molti ccTLD, incluso .it).
 *
 * Usa il servizio bootstrap pubblico rdap.org, che instrada automaticamente
 * la richiesta al registro corretto in base al TLD del dominio.
 */
async function getDomainAge(domain) {
  try {
    const { data } = await axios.get(`https://rdap.org/domain/${domain}`, {
      timeout: 6000,
      headers: { Accept: 'application/rdap+json' },
    });

    const events = data.events || [];
    const registrationEvent = events.find(
      (e) => e.eventAction === 'registration'
    );

    if (!registrationEvent?.eventDate) {
      return { found: false, registeredOn: null, ageYears: null, ageDays: null };
    }

    const registeredOn = new Date(registrationEvent.eventDate);
    const now = new Date();
    const ageDays = Math.floor((now - registeredOn) / (1000 * 60 * 60 * 24));
    const ageYears = Math.floor(ageDays / 365.25);

    return {
      found: true,
      registeredOn: registeredOn.toISOString().split('T')[0],
      ageYears,
      ageDays,
    };
  } catch (err) {
    // Dominio non trovato via RDAP, registro non supportato, o timeout.
    return { found: false, registeredOn: null, ageYears: null, ageDays: null, error: true };
  }
}

module.exports = { getDomainAge };

const soap = require('soap');

const WSDL_URL_FILO = 'https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx?wsdl';
const SOAP_METHOD_HAT_KONUM = 'GetHatOtoKonum_json';
const RESPONSE_KEY_HAT_KONUM = 'GetHatOtoKonum_jsonResult';

async function fetchBusLocationsForLine(hatKodu) {
    if (!hatKodu) {
        console.error('Hat kodu girilmedi.');
        return null;
    }

    const args = { HatKodu: hatKodu };

    try {
        console.log(`İBB API'sinden ${hatKodu} hattı için otobüs konumları çekiliyor...`);
        const client = await soap.createClientAsync(WSDL_URL_FILO);
        const result = await client[SOAP_METHOD_HAT_KONUM + 'Async'](args);

        if (!result || !result[0] || !result[0][RESPONSE_KEY_HAT_KONUM]) {
            console.error('SOAP Yanıtında Beklenen Anahtar Bulunamadı (Hat Bazlı Konum):', RESPONSE_KEY_HAT_KONUM, 'Alınan yanıt:', result);
            throw new Error('SOAP servisinden geçersiz yanıt formatı alındı (Hat Bazlı Konum)');
        }

        const busLocationsRaw = result[0][RESPONSE_KEY_HAT_KONUM];
        const busLocations = JSON.parse(busLocationsRaw);

        if (busLocations && !Array.isArray(busLocations)) {
            return [busLocations]; 
        }
        
        console.log(`${hatKodu} hattı için ${busLocations ? busLocations.length : 0} adet otobüs konumu alındı.`);
        return busLocations;

    } catch (error) {
        console.error(`Otobüs konumlarını (${hatKodu}) çekerken hata oluştu:`, error.message);
        if (error.root && error.root.Envelope && error.root.Envelope.Body && error.root.Envelope.Body.Fault) {
            console.error('SOAP Fault Detayı:', error.root.Envelope.Body.Fault);
        }
        return null;
    }
}

if (require.main === module) {
    (async () => {
        const ornekHatKodu = 'HT29'; 
        const konumlar = await fetchBusLocationsForLine(ornekHatKodu);
        if (konumlar) {
            console.log(`Test: ${ornekHatKodu} hattındaki otobüsler:`, JSON.stringify(konumlar, null, 2));
        } else {
            console.log(`Test: ${ornekHatKodu} hattı için konum bilgisi alınamadı.`);
        }
    })();
}

module.exports = fetchBusLocationsForLine; 
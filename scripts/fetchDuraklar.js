const soap = require('soap');
const fs = require('fs');
const path = require('path');

const WSDL_URL_TUM_DURAKLAR = 'https://api.ibb.gov.tr/iett/UlasimAnaVeri/HatDurakGuzergah.asmx?wsdl';
const SOAP_METHOD_TUM_DURAKLAR = 'GetDurak_json'; // Boş DurakKodu ile tüm durakları verir
const RESPONSE_KEY_TUM_DURAKLAR = 'GetDurak_jsonResult';

const CACHE_DIR = path.join(__dirname, '..', 'data');
const DURAKLAR_CACHE_FILE = path.join(CACHE_DIR, 'duraklar_cache.json');
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 saat

// Cache dizininin var olduğundan emin ol
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`Cache dizini oluşturuldu: ${CACHE_DIR}`);
}

async function fetchAndCacheDuraklar() {
    try {
        // Cache kontrolü
        if (fs.existsSync(DURAKLAR_CACHE_FILE)) {
            const stats = fs.statSync(DURAKLAR_CACHE_FILE);
            const lastModifiedTime = new Date(stats.mtime).getTime();
            const currentTime = new Date().getTime();

            if ((currentTime - lastModifiedTime) < CACHE_DURATION_MS) {
                console.log('Duraklar cache üzerinden yüklendi.');
                const cachedData = fs.readFileSync(DURAKLAR_CACHE_FILE, 'utf-8');
                return JSON.parse(cachedData);
            } else {
                console.log('Cache süresi dolmuş, duraklar yeniden çekilecek.');
            }
        } else {
            console.log('Cache dosyası bulunamadı, duraklar ilk kez çekilecek.');
        }

        console.log('İBB API\'sinden duraklar çekiliyor...');
        const client = await soap.createClientAsync(WSDL_URL_TUM_DURAKLAR);
        
        // GetDurak_json metodu için argümanı { DurakKodu: '' } olarak güncelliyoruz.
        const result = await client[SOAP_METHOD_TUM_DURAKLAR + 'Async']({ DurakKodu: '' });

        if (!result || !result[0] || !result[0][RESPONSE_KEY_TUM_DURAKLAR]) {
            console.error('SOAP Yanıtında Beklenen Anahtar Bulunamadı:', RESPONSE_KEY_TUM_DURAKLAR, 'Alınan yanıt:', result);
            throw new Error('SOAP servisinden geçersiz yanıt formatı alındı');
        }

        const duraklarRaw = result[0][RESPONSE_KEY_TUM_DURAKLAR];
        const duraklar = JSON.parse(duraklarRaw);

        fs.writeFileSync(DURAKLAR_CACHE_FILE, JSON.stringify(duraklar, null, 2), 'utf-8');
        console.log(`Duraklar başarıyla çekildi ve ${DURAKLAR_CACHE_FILE} dosyasına kaydedildi.`);
        
        return duraklar;

    } catch (error) {
        console.error('Durakları çekerken veya cache\'lerken hata oluştu:', error.message);
        if (error.root && error.root.Envelope && error.root.Envelope.Body && error.root.Envelope.Body.Fault) {
            console.error('SOAP Fault Detayı:', error.root.Envelope.Body.Fault);
        }
        // Hata durumunda, eğer varsa eski cache'i kullanmayı deneyebilir veya null dönebiliriz.
        // Şimdilik null dönelim.
        if (fs.existsSync(DURAKLAR_CACHE_FILE)) {
            console.warn('Hata nedeniyle eski cache kullanılıyor (eğer varsa).');
            const cachedData = fs.readFileSync(DURAKLAR_CACHE_FILE, 'utf-8');
            return JSON.parse(cachedData);
        }
        return null;
    }
}

// Script doğrudan çalıştırıldığında fonksiyonu çağır
if (require.main === module) {
    (async () => {
        const duraklar = await fetchAndCacheDuraklar();
        if (duraklar) {
            console.log(`Toplam ${duraklar.length} durak bilgisi işlendi.`);
            // İsterseniz burada durakların ilk birkaçını gösterebilirsiniz.
            // console.log('İlk 5 durak:', duraklar.slice(0, 5));
        } else {
            console.log('Durak bilgisi alınamadı veya işlenemedi.');
        }
    })();
}

module.exports = fetchAndCacheDuraklar; 
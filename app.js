const express = require('express');
const path = require('path');
const fs = require('fs');
const soap = require('soap'); // SOAP kütüphanesini ekleyelim

const app = express();
const PORT = process.env.PORT || 3000;

let hatlarGeojsonData = null;
const hatlarGeojsonPath = path.join(__dirname, 'data', 'hatlar.geojson');

console.log("🌀 data/hatlar.geojson yükleniyor... Lütfen bekleyin.");
fs.readFile(hatlarGeojsonPath, 'utf8', (err, data) => {
    if (err) {
        console.error("❌ data/hatlar.geojson dosyası okunamadı:", err);
        console.warn("Güzergah gösterme özelliği çalışmayacak.");
    } else {
        try {
            hatlarGeojsonData = JSON.parse(data);
            console.log("✅ data/hatlar.geojson başarıyla yüklendi ve parse edildi.");
        } catch (parseErr) {
            console.error("❌ data/hatlar.geojson parse edilirken hata:", parseErr);
            hatlarGeojsonData = null;
            console.warn("Güzergah gösterme özelliği çalışmayacak.");
        }
    }
});

// Public klasörünü statik dosyalar için sun
app.use(express.static(path.join(__dirname, 'public')));

// Tüm Durak verilerini sunmak için bir endpoint
app.get('/api/duraklar', (req, res) => {
    const duraklarFilePath = path.join(__dirname, 'data', 'duraklar_cache.json');
    fs.readFile(duraklarFilePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Duraklar cache dosyası okunurken hata:", err);
            return res.status(500).json({ error: 'Durak verileri sunucudan okunamadı.' });
        }
        try {
            const duraklarJson = JSON.parse(data);
            res.json(duraklarJson);
        } catch (parseError) {
            console.error("Duraklar cache JSON parse hatası:", parseError);
            return res.status(500).json({ error: 'Durak verileri sunucuda parse edilemedi.' });
        }
    });
});

// Belirli bir hattaki otobüs konumlarını sunmak için yeni endpoint
app.get('/api/hat/:hatKodu/konumlar', async (req, res) => {
    const { hatKodu } = req.params;
    if (!hatKodu) {
        return res.status(400).json({ error: 'Hat kodu gerekli.' });
    }
    // fetchBusLocationsForLine fonksiyonu yerine doğrudan SOAP çağrısı yapacağız.
    // Bu kısım, fetchBusLocations.js'deki mantığı buraya taşımayı gerektirir.
    // Şimdilik fetchBusLocationsForLine'ı yerinde bırakıyorum, 
    // ama idealde bu da app.js içine veya ayrı bir service modülüne alınmalı.
    // TODO: fetchBusLocationsForLine içeriğini buraya taşı veya yeniden düzenle.
    // Geçici olarak eski scripti çağıracak şekilde bırakıyorum:
    let fetchBusLocationsForLine;
    try {
        fetchBusLocationsForLine = require('./scripts/fetchBusLocations.js');
    } catch (e) {
        console.error("fetchBusLocations.js yüklenemedi, /api/hat/:hatKodu/konumlar endpoint'i çalışmayabilir.", e);
        return res.status(500).json({ error: 'Otobüs konum servisi yapılandırma hatası.' });
    }

    try {
        const busLocations = await fetchBusLocationsForLine(hatKodu.toUpperCase());
        if (busLocations) {
            res.json(busLocations);
        } else {
            res.status(404).json({ error: `${hatKodu} hattı için otobüs konumu bulunamadı veya API hatası.` });
        }
    } catch (error) {
        console.error(`${hatKodu} hattı için konumlar getirilirken sunucu hatası:`, error);
        res.status(500).json({ error: 'Sunucu tarafında bir hata oluştu.' });
    }
});

// Belirli güzergah kodlarına ait güzergahları döndüren yeni endpoint
app.get('/api/guzergahlar', (req, res) => {
    const { kodlari } = req.query; // kodlari=GKOD1,GKOD2,GKOD3 gibi

    if (!hatlarGeojsonData) {
        console.warn("/api/guzergahlar isteği geldi ama hatlar.geojson henüz yüklenmedi veya yüklenemedi.");
        return res.status(503).json({ error: 'Güzergah verisi sunucuda henüz hazır değil. Lütfen biraz bekleyip tekrar deneyin.' });
    }
    if (!kodlari) {
        return res.status(400).json({ error: 'Güzergah kodları (kodlari) query parametresi gerekli.' });
    }

    const guzergahKodListesi = kodlari.toUpperCase().split(',').map(k => k.trim()).filter(k => k);

    if (guzergahKodListesi.length === 0) {
        return res.status(400).json({ error: 'Geçerli güzergah kodu sağlanmadı.' });
    }

    try {
        const features = hatlarGeojsonData.features.filter(f => 
            f.properties && 
            f.properties.GUZERGAH_K && 
            guzergahKodListesi.includes(f.properties.GUZERGAH_K.toUpperCase())
        );

        if (features && features.length > 0) {
            const gonderilecekData = features.map(f => ({
                geometry: f.geometry, 
                properties: { 
                    HAT_KODU: f.properties.HAT_KODU,
                    HAT_ADI: f.properties.HAT_ADI,
                    YON: f.properties.YON,
                    GUZERGAH_K: f.properties.GUZERGAH_K,
                    GUZERGAH_A: f.properties.GUZERGAH_A
                }
            }));
            res.json(gonderilecekData);
        } else {
            res.status(404).json({ error: `Belirtilen güzergah kodları (${kodlari}) için güzergah bulunamadı.` });
        }
    } catch (e) {
        console.error("Güzergah API'sinde (/api/guzergahlar) beklenmedik hata:", e);
        res.status(500).json({ error: "Güzergah işlenirken sunucuda bir hata oluştu." });
    }
});

// Bir hattın ilk ve son duraklarını ve tüm durak detaylarını getiren endpoint
app.get('/api/hat/:hatKodu/durakdetaylari', async (req, res) => {
    const { hatKodu } = req.params;
    if (!hatKodu) {
        return res.status(400).json({ error: 'Hat kodu gerekli.' });
    }
    console.log(`[APP.JS] /api/hat/${hatKodu}/durakdetaylari isteği alındı.`);

    const wsdlUrl = 'https://api.ibb.gov.tr/iett/ibb/ibb.asmx?wsdl';
    const args = { hat_kodu: hatKodu.toUpperCase() };

    try {
        const client = await soap.createClientAsync(wsdlUrl);
        console.log(`[APP.JS] DurakDetay_GYY (${hatKodu}) SOAP client oluşturuldu.`);
        const result = await client.DurakDetay_GYYAsync(args);
        console.log(`[APP.JS] DurakDetay_GYY (${hatKodu}) SOAP yanıtı alındı (ilk 500 karakter):`, JSON.stringify(result)?.substring(0, 500));

        let duraklarRaw = null;
        if (result && result[0] && result[0].DurakDetay_GYYResult && result[0].DurakDetay_GYYResult.NewDataSet && Array.isArray(result[0].DurakDetay_GYYResult.NewDataSet.Table)) {
            duraklarRaw = result[0].DurakDetay_GYYResult.NewDataSet.Table;
            console.log("[APP.JS] Duraklar 'DurakDetay_GYYResult.NewDataSet.Table' (dizi) yapısından alındı.");
        } else if (result && result[0] && result[0].DurakDetay_GYYResult && result[0].DurakDetay_GYYResult.NewDataSet && typeof result[0].DurakDetay_GYYResult.NewDataSet.Table === 'object' && result[0].DurakDetay_GYYResult.NewDataSet.Table !== null) {
            duraklarRaw = [result[0].DurakDetay_GYYResult.NewDataSet.Table];
            console.log("[APP.JS] Duraklar 'DurakDetay_GYYResult.NewDataSet.Table' (tek nesne) yapısından alındı ve diziye çevrildi.");
        } else if (result && result[0] && result[0].DurakDetay_GYYResult && result[0].DurakDetay_GYYResult.diffgram && result[0].DurakDetay_GYYResult.diffgram.NewDataSet && Array.isArray(result[0].DurakDetay_GYYResult.diffgram.NewDataSet.Table)) {
            duraklarRaw = result[0].DurakDetay_GYYResult.diffgram.NewDataSet.Table;
            console.log("[APP.JS] Duraklar 'diffgram.NewDataSet.Table' (dizi) yapısından alındı.");
        } else if (result && result[0] && result[0].DurakDetay_GYYResult && Array.isArray(result[0].DurakDetay_GYYResult.Durak)) {
            duraklarRaw = result[0].DurakDetay_GYYResult.Durak;
            console.log("[APP.JS] Duraklar 'DurakDetay_GYYResult.Durak' dizisinden alındı.");
        } else if (result && result[0] && Array.isArray(result[0].DurakDetay_GYYResult)) {
            duraklarRaw = result[0].DurakDetay_GYYResult;
            console.log("[APP.JS] Duraklar 'DurakDetay_GYYResult' dizisinden alındı.");
        } else if (result && Array.isArray(result[0])) {
             duraklarRaw = result[0];
             console.log("[APP.JS] Duraklar doğrudan 'result[0]' dizisinden alındı.");
        } else {
            console.warn(`[APP.JS] DurakDetay_GYY (${hatKodu}) servisinden beklenmedik yanıt yapısı veya boş Table. Dönen sonuç:`, JSON.stringify(result));
             duraklarRaw = [];
        }
        console.log(`[APP.JS] Ham durak sayısı (duraklarRaw): ${Array.isArray(duraklarRaw) ? duraklarRaw.length : (duraklarRaw ? 1 : 0)}`);

        const duraklar = Array.isArray(duraklarRaw) ? duraklarRaw : (duraklarRaw ? [duraklarRaw] : []);
        if (duraklar.length > 0) {
            console.log("[APP.JS] İlk işlenmiş durak örneği:", JSON.stringify(duraklar[0]));
        }

        if (duraklar.length === 0) {
            console.log(`[APP.JS] ${hatKodu} hattı için durak detayı bulunamadı veya servis boş döndü.`);
            return res.json({
                hatKodu: hatKodu,
                ilkSonDuraklar: {},
                tumDuraklar: [] // map.js burayı boş bir dizi olarak alıyordu, bu doğru.
            });
        }

        const gidisDuraklari = duraklar
            .filter(d => d.YON && (d.YON.toString().toUpperCase() === 'GİDİŞ' || d.YON.toString().toUpperCase() === 'G'))
            .sort((a, b) => parseInt(a.SIRANO) - parseInt(b.SIRANO));
        console.log(`[APP.JS] ${hatKodu} - Gidiş durakları bulundu: ${gidisDuraklari.length}`);

        const donusDuraklari = duraklar
            .filter(d => d.YON && (d.YON.toString().toUpperCase() === 'DÖNÜŞ' || d.YON.toString().toUpperCase() === 'D'))
            .sort((a, b) => parseInt(a.SIRANO) - parseInt(b.SIRANO));
        console.log(`[APP.JS] ${hatKodu} - Dönüş durakları bulundu: ${donusDuraklari.length}`);
        
        const digerYonDuraklari = duraklar
            .filter(d => d.YON && !['GİDİŞ', 'G', 'DÖNÜŞ', 'D'].includes(d.YON.toString().toUpperCase()))
            .sort((a, b) => parseInt(a.SIRANO) - parseInt(b.SIRANO));
        console.log(`[APP.JS] ${hatKodu} - Diğer yön durakları bulundu: ${digerYonDuraklari.length}`);

        const ilkSonDuraklar = {};

        if (gidisDuraklari.length > 0) {
            ilkSonDuraklar.gidis = {
                ilkDurak: { ad: gidisDuraklari[0].DURAKADI, kod: gidisDuraklari[0].DURAKKODU, sira: gidisDuraklari[0].SIRANO, x: gidisDuraklari[0].XKOORDINATI, y: gidisDuraklari[0].YKOORDINATI },
                sonDurak: { ad: gidisDuraklari[gidisDuraklari.length - 1].DURAKADI, kod: gidisDuraklari[gidisDuraklari.length - 1].DURAKKODU, sira: gidisDuraklari[gidisDuraklari.length - 1].SIRANO, x: gidisDuraklari[gidisDuraklari.length - 1].XKOORDINATI, y: gidisDuraklari[gidisDuraklari.length - 1].YKOORDINATI }
            };
        }

        if (donusDuraklari.length > 0) {
            ilkSonDuraklar.donus = {
                ilkDurak: { ad: donusDuraklari[0].DURAKADI, kod: donusDuraklari[0].DURAKKODU, sira: donusDuraklari[0].SIRANO, x: donusDuraklari[0].XKOORDINATI, y: donusDuraklari[0].YKOORDINATI },
                sonDurak: { ad: donusDuraklari[donusDuraklari.length - 1].DURAKADI, kod: donusDuraklari[donusDuraklari.length - 1].DURAKKODU, sira: donusDuraklari[donusDuraklari.length - 1].SIRANO, x: donusDuraklari[donusDuraklari.length - 1].XKOORDINATI, y: donusDuraklari[donusDuraklari.length - 1].YKOORDINATI }
            };
        }
        
        if (digerYonDuraklari.length > 0 && !ilkSonDuraklar.gidis && !ilkSonDuraklar.donus) {
            // Eğer GİDİŞ/DÖNÜŞ yoksa ama başka bir YON tanımı varsa, ilkini olduğu gibi alalım.
            // Bu durumun nasıl ele alınacağı kullanıcıya sorulabilir. Şimdilik genel bir "diğer" yönü olarak tanımlayalım.
            const yonTuru = digerYonDuraklari[0].YON.toString();
            ilkSonDuraklar.diger = {
                yon: yonTuru,
                ilkDurak: { ad: digerYonDuraklari[0].DURAKADI, kod: digerYonDuraklari[0].DURAKKODU, sira: digerYonDuraklari[0].SIRANO, x: digerYonDuraklari[0].XKOORDINATI, y: digerYonDuraklari[0].YKOORDINATI },
                sonDurak: { ad: digerYonDuraklari[digerYonDuraklari.length - 1].DURAKADI, kod: digerYonDuraklari[digerYonDuraklari.length - 1].DURAKKODU, sira: digerYonDuraklari[digerYonDuraklari.length - 1].SIRANO, x: digerYonDuraklari[digerYonDuraklari.length - 1].XKOORDINATI, y: digerYonDuraklari[digerYonDuraklari.length - 1].YKOORDINATI }
            };
            console.log(`(${hatKodu}) hattı için '${yonTuru}' yönünde duraklar bulundu.`);
        }
        
        // Tüm durakları da, sıralı ve yönlerine göre gruplanmış şekilde döndürelim.
        const tumDuraklarFormatli = {};
        if (gidisDuraklari.length > 0) tumDuraklarFormatli.gidis = gidisDuraklari.map(d => ({ ad: d.DURAKADI, kod: d.DURAKKODU, sira: d.SIRANO, x: d.XKOORDINATI, y: d.YKOORDINATI, yon: d.YON }));
        if (donusDuraklari.length > 0) tumDuraklarFormatli.donus = donusDuraklari.map(d => ({ ad: d.DURAKADI, kod: d.DURAKKODU, sira: d.SIRANO, x: d.XKOORDINATI, y: d.YKOORDINATI, yon: d.YON }));
        if (digerYonDuraklari.length > 0 && Object.keys(tumDuraklarFormatli).length === 0) {
             const yonTuru = digerYonDuraklari[0].YON.toString();
             tumDuraklarFormatli[yonTuru.toLowerCase() || 'diger'] = digerYonDuraklari.map(d => ({ ad: d.DURAKADI, kod: d.DURAKKODU, sira: d.SIRANO, x: d.XKOORDINATI, y: d.YKOORDINATI, yon: d.YON }));
        }
        console.log(`[APP.JS] ${hatKodu} için istemciye gönderilecek tumDuraklarFormatli:`, JSON.stringify(tumDuraklarFormatli));

        res.json({ 
            hatKodu: hatKodu,
            ilkSonDuraklar: ilkSonDuraklar,
            tumDuraklar: tumDuraklarFormatli 
        });

    } catch (error) {
        console.error(`DurakDetay_GYY (${hatKodu}) SOAP isteği sırasında hata:`, error.message);
        let faultDetail = null;
        if (error.root && error.root.Envelope && error.root.Envelope.Body && error.root.Envelope.Body.Fault) {
            faultDetail = error.root.Envelope.Body.Fault;
            console.error("SOAP Fault:", JSON.stringify(faultDetail, null, 2));
        }
        res.status(500).json({ 
            error: 'Durak detayları getirilirken sunucu tarafında bir hata oluştu.', 
            details: error.message,
            fault: faultDetail
        });
    }
});

app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde çalışıyor.`);
    console.log('Uygulamayı görmek için bu adresi tarayıcınızda açın.');
    console.log('Durdurmak için CTRL+C yapın.');
}); 
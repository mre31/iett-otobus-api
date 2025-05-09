document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([41.0082, 28.9784], 10);
    // Daha sade bir harita katmanı: CartoDB Positron
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20 // CartoDB için maxZoom artırılabilir.
    }).addTo(map);

    const hatKoduInput = document.getElementById('hatKoduInput');
    const gosterButton = document.getElementById('gosterButton');
    const guzergahSelect = document.getElementById('guzergahSelect');

    let busMarkersLayer = L.layerGroup().addTo(map);
    let routeLinesLayer = L.layerGroup().addTo(map);
    let routeDecoratorsLayer = L.layerGroup().addTo(map);
    let stopMarkersLayer = L.layerGroup().addTo(map); // Durak işaretçileri için yeni katman

    let currentBusLocations = [];
    let currentRouteFeatures = [];
    let currentHatStopDetails = null;
    let busUpdateInterval = null;
    const BUS_UPDATE_INTERVAL_MS = 60000;

    function populateRouteDropdown(routeFeatures) {
        guzergahSelect.innerHTML = ''; // Önceki seçenekleri temizle

        if (!routeFeatures || routeFeatures.length === 0) {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = '- Güzergah Yok -';
            guzergahSelect.appendChild(defaultOption);
            return;
        }

        const allRoutesOption = document.createElement('option');
        allRoutesOption.value = 'TUMU'; // Özel bir değer
        allRoutesOption.textContent = 'Tüm Aktif Güzergahlar';
        guzergahSelect.appendChild(allRoutesOption);

        routeFeatures.forEach(feature => {
            const option = document.createElement('option');
            option.value = feature.properties.GUZERGAH_K; 
            option.textContent = `${feature.properties.GUZERGAH_A || feature.properties.HAT_ADI || 'Bilinmeyen Güzergah'} (${feature.properties.YON || 'N/A'} - ${feature.properties.GUZERGAH_K})`;
            guzergahSelect.appendChild(option);
        });
    }

    function updateMapDisplay() {
        routeLinesLayer.clearLayers();
        busMarkersLayer.clearLayers();
        routeDecoratorsLayer.clearLayers();
        stopMarkersLayer.clearLayers(); // Durak katmanını temizle

        const seciliGuzergahKodu = guzergahSelect.value;
        let allRouteBounds = L.latLngBounds();

        // Güzergahları Çiz ve Okları Ekle
        if (currentRouteFeatures && currentRouteFeatures.length > 0) {
            currentRouteFeatures.forEach(routeFeature => {
                if (seciliGuzergahKodu === 'TUMU' || routeFeature.properties.GUZERGAH_K === seciliGuzergahKodu) {
                    if (routeFeature.geometry && routeFeature.geometry.type === 'MultiLineString' && routeFeature.geometry.coordinates) {
                        routeFeature.geometry.coordinates.forEach(lineString => {
                            const latLngs = lineString.map(coord => [coord[1], coord[0]]);
                            if (latLngs.length > 0) {
                                const lineColor = routeFeature.properties.YON === 'GİDİŞ' ? '#007bff' : '#28a745';
                                const polyline = L.polyline(latLngs, {
                                    color: lineColor,
                                    weight: 5,
                                    opacity: 0.7
                                }).addTo(routeLinesLayer);
                                allRouteBounds.extend(polyline.getBounds());
                                let popupContent = `<b>Hat:</b> ${routeFeature.properties.HAT_KODU || 'N/A'} (${routeFeature.properties.HAT_ADI || 'N/A'})`;
                                popupContent += `<br><b>Yön:</b> ${routeFeature.properties.YON || 'N/A'}`;
                                popupContent += `<br><b>Güzergah Kodu:</b> ${routeFeature.properties.GUZERGAH_K || 'N/A'}`;
                                popupContent += `<br><b>Açıklama:</b> ${routeFeature.properties.GUZERGAH_A || 'N/A'}`;
                                polyline.bindPopup(popupContent);

                                // Yön Oklarını Ekle
                                L.polylineDecorator(polyline, {
                                    patterns: [
                                        {
                                            offset: '15%', 
                                            repeat: '100px', 
                                            symbol: L.Symbol.arrowHead({ 
                                                pixelSize: 12, 
                                                polygon: false, 
                                                pathOptions: { 
                                                    stroke: true, 
                                                    color: '#000000',
                                                    weight: 2 
                                                }
                                            })
                                        }
                                    ]
                                }).addTo(routeDecoratorsLayer);
                            }
                        });
                    }
                }
            });
        }

        // Otobüsleri Göster
        let validLocations = 0;
        if (currentBusLocations && currentBusLocations.length > 0) {
            currentBusLocations.forEach(bus => {
                if (seciliGuzergahKodu !== 'TUMU' && bus.guzergahkodu !== seciliGuzergahKodu) {
                    return; 
                }
                if (seciliGuzergahKodu === 'TUMU' && !currentRouteFeatures.some(rf => rf.properties.GUZERGAH_K === bus.guzergahkodu)){
                    return;
                }

                const enlemStr = bus.enlem ? bus.enlem.toString().replace(',', '.') : null;
                const boylamStr = bus.boylam ? bus.boylam.toString().replace(',', '.') : null;
                const enlem = parseFloat(enlemStr);
                const boylam = parseFloat(boylamStr);

                if (!isNaN(enlem) && !isNaN(boylam)) {
                    const marker = L.marker([enlem, boylam]).addTo(busMarkersLayer);
                    let popupContent = `<b>Hat Kodu:</b> ${bus.hatkodu || 'N/A'}`;
                    popupContent += `<br><b>Hat Adı:</b> ${bus.hattad || 'N/A'}`;
                    popupContent += `<br><b>Kapı No:</b> ${bus.kapino || 'N/A'}`;
                    popupContent += `<br><b>Yön:</b> ${bus.yon || 'N/A'}`;
                    popupContent += `<br><b>Güzergah Kodu:</b> ${bus.guzergahkodu || 'N/A'}`;
                    popupContent += `<br><b>Yakın Durak Kodu:</b> ${bus.yakinDurakKodu || 'N/A'}`;
                    popupContent += `<br><b>Son Konum Zamanı:</b> ${bus.son_konum_zamani || 'N/A'}`;
                    marker.bindPopup(popupContent);
                    validLocations++;
                } 
            });
        }

        // Harita Odağı (Güzergah veya Otobüslere)
        if (allRouteBounds.isValid()) {
            map.fitBounds(allRouteBounds, { padding: [50, 50] });
        } else if (busMarkersLayer.getLayers().length > 0) {
            map.fitBounds(busMarkersLayer.getBounds(), { padding: [50, 50] });
        }
        
        if (seciliGuzergahKodu !== 'TUMU' && validLocations === 0 && currentBusLocations.length > 0) {
            alert(`Seçilen güzergah (${seciliGuzergahKodu}) üzerinde aktif otobüs bulunamadı.`);
        }

        // İlk/Son durak bilgilerini göster (Örnek: Konsola yazdırma veya haritaya ekleme)
        if (currentHatStopDetails && currentHatStopDetails.ilkSonDuraklar) {
            console.log("İlk/Son Durak Bilgileri:", currentHatStopDetails.ilkSonDuraklar);
            // GİDİŞ
            if (currentHatStopDetails.ilkSonDuraklar.gidis) {
                const gidisIlk = currentHatStopDetails.ilkSonDuraklar.gidis.ilkDurak;
                const gidisSon = currentHatStopDetails.ilkSonDuraklar.gidis.sonDurak;
                console.log(`Gidiş: ${gidisIlk.ad} (${gidisIlk.kod}) -> ${gidisSon.ad} (${gidisSon.kod})`);
                // Haritada işaretlemek için: L.marker([gidisIlk.y, gidisIlk.x]).bindPopup(`Gidiş İlk: ${gidisIlk.ad}`).addTo(map);
            }
            // DÖNÜŞ
            if (currentHatStopDetails.ilkSonDuraklar.donus) {
                const donusIlk = currentHatStopDetails.ilkSonDuraklar.donus.ilkDurak;
                const donusSon = currentHatStopDetails.ilkSonDuraklar.donus.sonDurak;
                console.log(`Dönüş: ${donusIlk.ad} (${donusIlk.kod}) -> ${donusSon.ad} (${donusSon.kod})`);
            }
        }

        // Hattaki Tüm Durakları Göster
        if (currentHatStopDetails && currentHatStopDetails.tumDuraklar) {
            console.log("[MAP.JS] Gösterilecek Duraklar (Filtreleme Öncesi - currentHatStopDetails.tumDuraklar):", JSON.parse(JSON.stringify(currentHatStopDetails.tumDuraklar)));

            const addStopMarkers = (stopsArray, yonAdi) => {
                console.log(`[MAP.JS] addStopMarkers çağrıldı - Yön: ${yonAdi}, Durak Sayısı: ${stopsArray ? stopsArray.length : 0}`);
                if (stopsArray && Array.isArray(stopsArray)) {
                    stopsArray.forEach((stop, index) => {
                        console.log(`[MAP.JS] Durak ${index + 1} (${yonAdi || stop.yon}):`, JSON.parse(JSON.stringify(stop)));
                        const enlemStr = stop.y ? stop.y.toString().replace(',', '.') : null;
                        const boylamStr = stop.x ? stop.x.toString().replace(',', '.') : null;
                        const enlem = parseFloat(enlemStr);
                        const boylam = parseFloat(boylamStr);

                        console.log(`[MAP.JS] Durak ${index + 1} Parsed Coords - Enlem: ${enlem}, Boylam: ${boylam}`);

                        if (!isNaN(enlem) && !isNaN(boylam)) {
                            const circleMarkerOptions = {
                                radius: 5, // Piksel cinsinden yarıçap
                                color: '#003366', // Kenar rengi (koyu mavi)
                                weight: 1, // Kenar kalınlığı
                                fillColor: '#f1dc4f', // Dolgu rengi (açık mavi)
                                fillOpacity: 0.7
                            };
                            const marker = L.circleMarker([enlem, boylam], circleMarkerOptions)
                                .addTo(stopMarkersLayer);
                            let popupContent = `<b>Durak:</b> ${stop.ad || 'N/A'} (${stop.kod || 'N/A'})`;
                            popupContent += `<br><b>Yön:</b> ${stop.yon || yonAdi || 'N/A'}`;
                            popupContent += `<br><b>Sıra No:</b> ${stop.sira || 'N/A'}`;
                            popupContent += `<br><i>Tahmini varış süresi özelliği ileride eklenecektir.</i>`; // Bilgilendirme notu
                            marker.bindPopup(popupContent);
                            console.log(`[MAP.JS] Durak ${index + 1} (${stop.ad}) haritaya eklendi.`);
                        } else {
                            console.warn(`[MAP.JS] Durak ${index + 1} (${stop.ad || 'ID:'+stop.kod}) için geçersiz koordinatlar: Y='${stop.y}', X='${stop.x}'`);
                        }
                    });
                } else {
                    console.warn(`[MAP.JS] addStopMarkers: ${yonAdi} yönü için durak listesi (stopsArray) geçersiz veya boş.`);
                }
            };

            const seciliGuzergahKodu = guzergahSelect.value;

            if (seciliGuzergahKodu === 'TUMU') {
                console.log("[MAP.JS] 'TÜMÜ' seçili, hatta ait tüm duraklar gösterilecek.");
                if (currentHatStopDetails.tumDuraklar.gidis) {
                    addStopMarkers(currentHatStopDetails.tumDuraklar.gidis, 'Gidiş');
                }
                if (currentHatStopDetails.tumDuraklar.donus) {
                    addStopMarkers(currentHatStopDetails.tumDuraklar.donus, 'Dönüş');
                }
                // API'den gelebilecek diğer yönler için (eğer varsa ve app.js'de bu şekilde anahtarlanıyorsa)
                Object.keys(currentHatStopDetails.tumDuraklar).forEach(key => {
                    if (key !== 'gidis' && key !== 'donus' && Array.isArray(currentHatStopDetails.tumDuraklar[key])) {
                        addStopMarkers(currentHatStopDetails.tumDuraklar[key], key.charAt(0).toUpperCase() + key.slice(1)); // Yön adını güzelleştir
                    }
                });
            } else {
                const selectedRoute = currentRouteFeatures.find(rf => rf.properties.GUZERGAH_K === seciliGuzergahKodu);
                if (selectedRoute) {
                    const yon = selectedRoute.properties.YON; // "GİDİŞ" veya "DÖNÜŞ"
                    if (yon) {
                        let yonKey;
                        if (yon === 'GİDİŞ') {
                            yonKey = 'gidis';
                        } else if (yon === 'DÖNÜŞ') {
                            yonKey = 'donus';
                        } else {
                            // Eğer YON değeri "GİDİŞ" veya "DÖNÜŞ" dışında bir şeyse
                            // ve app.js bu değerleri küçük harfle anahtar olarak kullanıyorsa diye bir fallback.
                            yonKey = yon.toLowerCase(); 
                            console.warn(`[MAP.JS] Beklenmeyen YON değeri '${yon}'. Durak listesi için '${yonKey}' anahtarı denenecek.`);
                        }
                        
                        console.log(`[MAP.JS] Seçili güzergah: ${seciliGuzergahKodu}, Yön: ${yon}, Durak Anahtarı: ${yonKey}`);
                        if (currentHatStopDetails.tumDuraklar[yonKey]) {
                            addStopMarkers(currentHatStopDetails.tumDuraklar[yonKey], yon); // Yön adını orijinal haliyle gönder (örn: "GİDİŞ")
                        } else {
                            console.warn(`[MAP.JS] '${yonKey}' anahtarı için durak listesi bulunamadı (currentHatStopDetails.tumDuraklar.${yonKey}). Mevcut anahtarlar: ${Object.keys(currentHatStopDetails.tumDuraklar).join(', ')}`);
                        }
                    } else {
                         console.warn(`[MAP.JS] Seçili güzergah (${seciliGuzergahKodu}) için YON bilgisi (properties.YON) bulunamadı.`);
                    }
                } else {
                    console.warn(`[MAP.JS] Seçili güzergah kodu (${seciliGuzergahKodu}) currentRouteFeatures içinde bulunamadı. Duraklar filtrelenemiyor.`);
                }
            }
        } else {
            console.log("[MAP.JS] currentHatStopDetails veya currentHatStopDetails.tumDuraklar mevcut değil, duraklar gösterilemiyor.");
        }
    }

    async function fetchAndUpdateBusLocations(hatKodu) {
        if (!hatKodu) return;
        console.log(`${hatKodu} için otobüs konumları güncelleniyor... (${new Date().toLocaleTimeString()})`);
        try {
            const busResponse = await fetch(`/api/hat/${hatKodu.toUpperCase()}/konumlar`);
            if (busResponse.ok) {
                currentBusLocations = await busResponse.json();
                busMarkersLayer.clearLayers();
                let validLocationsScoped = 0;
                const seciliGuzergahKodu = guzergahSelect.value;

                if (currentBusLocations && currentBusLocations.length > 0) {
                    currentBusLocations.forEach(bus => {
                        if (seciliGuzergahKodu !== 'TUMU' && bus.guzergahkodu !== seciliGuzergahKodu) return;
                        if (seciliGuzergahKodu === 'TUMU' && !currentRouteFeatures.some(rf => rf.properties.GUZERGAH_K === bus.guzergahkodu)) return;

                        const enlemStr = bus.enlem ? bus.enlem.toString().replace(',', '.') : null;
                        const boylamStr = bus.boylam ? bus.boylam.toString().replace(',', '.') : null;
                        const enlem = parseFloat(enlemStr);
                        const boylam = parseFloat(boylamStr);

                        if (!isNaN(enlem) && !isNaN(boylam)) {
                            const marker = L.marker([enlem, boylam]).addTo(busMarkersLayer);
                            let popupContent = `<b>Hat Kodu:</b> ${bus.hatkodu || 'N/A'}`;
                            popupContent += `<br><b>Hat Adı:</b> ${bus.hattad || 'N/A'}`;
                            popupContent += `<br><b>Kapı No:</b> ${bus.kapino || 'N/A'}`;
                            popupContent += `<br><b>Yön:</b> ${bus.yon || 'N/A'}`;
                            popupContent += `<br><b>Güzergah Kodu:</b> ${bus.guzergahkodu || 'N/A'}`;
                            popupContent += `<br><b>Yakın Durak Kodu:</b> ${bus.yakinDurakKodu || 'N/A'}`;
                            popupContent += `<br><b>Son Konum Zamanı:</b> ${bus.son_konum_zamani || 'N/A'}`;
                            marker.bindPopup(popupContent);
                            validLocationsScoped++;
                        } 
                    });
                }
                console.log(`${validLocationsScoped} otobüs konumu güncellendi.`);
            } else {
                console.error('Otobüs konumları güncellenirken hata:', busResponse.status);
            }
        } catch (error) {
            console.error('Otobüs konumları güncellenirken ağ hatası:', error);
        }
    }

    async function fetchAndDisplayHatData(hatKodu) {
        if (!hatKodu) {
            alert('Lütfen bir hat kodu giriniz.');
            return;
        }

        // Mevcut zamanlayıcıyı temizle
        if (busUpdateInterval) {
            clearInterval(busUpdateInterval);
            busUpdateInterval = null;
            console.log("Önceki otobüs güncelleme zamanlayıcısı durduruldu.");
        }

        routeLinesLayer.clearLayers();
        busMarkersLayer.clearLayers();
        routeDecoratorsLayer.clearLayers();
        stopMarkersLayer.clearLayers(); // Durak katmanını burada da temizle
        currentBusLocations = [];
        currentRouteFeatures = [];
        currentHatStopDetails = null;
        populateRouteDropdown([]);

        console.log(`${hatKodu} için otobüs konumları, güzergahlar ve durak detayları çekiliyor...`);

        try {
            // 1. Otobüs konumlarını çek
            const busResponse = await fetch(`/api/hat/${hatKodu.toUpperCase()}/konumlar`);
            if (!busResponse.ok) {
                const errorData = await busResponse.json().catch(() => ({ error: 'Bilinmeyen otobüs sunucu hatası' }));
                throw new Error(`Otobüs sunucusundan hata: ${busResponse.status} - ${errorData.error || 'Detay yok'}`);
            }
            currentBusLocations = await busResponse.json();

            if (!currentBusLocations || currentBusLocations.length === 0) {
                alert(`${hatKodu} hattı için aktif otobüs bulunamadı.`);
                console.log(`${hatKodu} hattı için aktif otobüs yok.`);
                updateMapDisplay();
                return;
            }
            console.log(`Toplam ${currentBusLocations.length} otobüs konumu yüklendi.`);

            // 2. Aktif otobüslerden benzersiz güzergah kodlarını topla
            const aktifGuzergahKodlari = [...new Set(currentBusLocations.map(bus => bus.guzergahkodu).filter(Boolean))];
            
            if (aktifGuzergahKodlari.length > 0) {
                const kodlarString = aktifGuzergahKodlari.join(',');
                const routeResponse = await fetch(`/api/guzergahlar?kodlari=${kodlarString}`);
                if (routeResponse.ok) {
                    currentRouteFeatures = await routeResponse.json();
                    if(!currentRouteFeatures || currentRouteFeatures.length === 0){
                         console.log(`Aktif güzergah kodları (${kodlarString}) için güzergah detayı bulunamadı.`);
                         currentRouteFeatures = [];
                    }
                } else {
                    const errorData = await routeResponse.json().catch(() => ({ error: 'Bilinmeyen güzergah sunucu hatası' }));
                    console.error(`Güzergah alınırken hata: ${routeResponse.status} - ${errorData.error}`);
                    currentRouteFeatures = [];
                }
            } else {
                console.log('Aktif otobüslerde gösterilecek güzergah kodu bulunamadı.');
                currentRouteFeatures = [];
            }

            // 3. Hat için ilk/son durak ve tüm durak detaylarını çek
            try {
                const stopDetailsResponse = await fetch(`/api/hat/${hatKodu.toUpperCase()}/durakdetaylari`);
                if (stopDetailsResponse.ok) {
                    currentHatStopDetails = await stopDetailsResponse.json();
                    console.log(`[MAP.JS] ${hatKodu} için durak detayları API'den yüklendi:`, JSON.parse(JSON.stringify(currentHatStopDetails)));
                } else {
                    const errorData = await stopDetailsResponse.json().catch(() => ({error: 'Bilinmeyen durak detayı sunucu hatası'}));
                    console.error(`Durak detayları alınırken hata (${stopDetailsResponse.status}):`, errorData.error);
                    currentHatStopDetails = null;
                }
            } catch (stopError) {
                console.error('Durak detayları çekilirken ağ/fetch hatası:', stopError);
                currentHatStopDetails = null;
            }

            populateRouteDropdown(currentRouteFeatures);
            guzergahSelect.value = 'TUMU';
            updateMapDisplay();

            // Otobüs konumlarını periyodik olarak güncellemek için zamanlayıcıyı başlat
            busUpdateInterval = setInterval(() => {
                fetchAndUpdateBusLocations(hatKoduInput.value.trim().toUpperCase());
            }, BUS_UPDATE_INTERVAL_MS);
            console.log(`${hatKodu} için otobüs güncelleme zamanlayıcısı başlatıldı (${BUS_UPDATE_INTERVAL_MS / 1000}sn).`);

        } catch (error) {
            console.error('Veriler yüklenirken hata oluştu:', error);
            alert(`Veriler yüklenemedi: ${error.message}`);
            if (busUpdateInterval) clearInterval(busUpdateInterval); // Hata durumunda intervali temizle
            populateRouteDropdown([]);
            updateMapDisplay();
        }
    }

    gosterButton.addEventListener('click', () => {
        const hatKodu = hatKoduInput.value.trim();
        if (hatKodu) {
            fetchAndDisplayHatData(hatKodu.toUpperCase());
        }
    });

    hatKoduInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            const hatKodu = hatKoduInput.value.trim();
            if (hatKodu) {
                fetchAndDisplayHatData(hatKodu.toUpperCase());
            }
        }
    });

    guzergahSelect.addEventListener('change', updateMapDisplay);
}); 
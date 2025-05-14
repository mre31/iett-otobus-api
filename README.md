# İETT Otobüs Takip Uygulaması (nodeiett)

Bu proje, İstanbul'daki İETT otobüslerini hat bazlı olarak anlık takip etmeyi ve güzergahlarını bir harita üzerinde göstermeyi amaçlayan bir Node.js uygulamasıdır.

## Genel Bakış

Uygulama, kullanıcıdan bir İETT hat kodu alarak İBB'nin açık veri servislerinden ilgili otobüslerin anlık konumlarını çeker. Ardından, bu otobüslerin kullandığı güzergah bilgilerini `data/hatlar.geojson` dosyasından alarak harita üzerinde gösterir. Güzergah dosyasının `https://data.ibb.gov.tr/dataset/b48d2095-851c-413c-8d36-87d2310a22b5/resource/4ccb4d29-c2b6-414a-b324-d2c9962b18e2/download/iett-hat-guzergahlar.geojson` adresinden indirilmesi gerekmektedir. data/ klasörü oluşturup içerisine hatlar.geojson olarak kaydedin. Kullanıcı, aktif güzergahlar arasından seçim yaparak haritadaki gösterimi filtreleyebilir.

## Kullanılan Teknolojiler

*   **Backend:** Node.js, Express.js
*   **Frontend:** HTML, CSS, JavaScript
*   **Harita:** Leaflet.js
*   **API İletişimi:** `soap` paketi (İBB SOAP API'leri için)

## Kurulum ve Çalıştırma

1.  **Proje Klonlama (Eğer varsa):**
    ```bash
    git clone <proje_git_adresi>
    cd nodeiett
    ```

2.  **Bağımlılıkların Yüklenmesi:**
    Proje kök dizininde (`nodeiett`) aşağıdaki komutu çalıştırın:
    ```bash
    npm install
    ```
    Bu komut, `package.json` dosyasında tanımlı olan `express` ve `soap` gibi bağımlılıkları yükleyecektir.

3.  **Uygulamanın Çalıştırılması:**
    Aşağıdaki komut ile sunucuyu başlatabilirsiniz:
    ```bash
    npm start
    ```
    Veya doğrudan:
    ```bash
    node app.js
    ```
    Uygulama varsayılan olarak `http://localhost:3000` adresinde çalışmaya başlayacaktır.

## Proje Yapısı

```
nodeiett/
├── app.js                  # Ana Express sunucu uygulaması
├── package.json            # Proje bağımlılıkları ve script'leri
├── package-lock.json       # Bağımlılıkların kilit dosyası
├── data/
│   └── hatlar.geojson      # Tüm İETT hatlarının güzergah geometrilerini içeren dosya (büyük boyutlu)
├── public/                 # İstemci tarafı dosyaları (HTML, CSS, JS)
│   ├── index.html          # Ana kullanıcı arayüzü sayfası
│   ├── css/
│   │   └── style.css       # Stil dosyası
│   └── js/
│       └── map.js          # Harita ve kullanıcı etkileşim mantığını içeren JavaScript dosyası
└── scripts/                # Yardımcı script'ler (veri çekme vb. için)
    ├── fetchBusLocations.js # (Artık doğrudan kullanılmıyor, mantığı app.js'te)
    └── fetchDuraklar.js     # (Artık doğrudan kullanılmıyor, ilk versiyonda kullanılmıştı)
```

## API Entegrasyonları (İBB Açık Veri)

Uygulama, İBB'nin sağladığı SOAP tabanlı web servislerini kullanarak veri çeker.

1.  **Otobüs Anlık Konumları:**
    *   **WSDL Adresi:** `https://api.ibb.gov.tr/iett/FiloDurum/SeferGerceklesme.asmx?wsdl`
    *   **Kullanılan Metod:** `GetHatOtoKonum_json`
    *   **Gerekli Argüman:** `{ HatKodu: 'GIRILEN_HAT_KODU' }`
    *   **Kullanım Yeri:** `app.js` içerisinde `/api/hat/:hatKodu/konumlar` endpoint'i tarafından çağrılır.

## Uygulama API Endpoint'leri (Backend - `app.js`)

*   **`GET /`**
    *   Açıklama: Ana HTML sayfasını (`public/index.html`) sunar.
*   **`GET /api/hat/:hatKodu/konumlar`**
    *   Açıklama: Belirtilen `:hatKodu` için İBB API'sinden anlık otobüs konumlarını alır ve JSON formatında döndürür.
    *   Örnek: `/api/hat/25G/konumlar`
*   **`GET /api/guzergahlar?kodlari=KOD1,KOD2,...`**
    *   Açıklama: `kodlari` query parametresi ile virgülle ayrılmış olarak verilen güzergah kodlarına (`GUZERGAH_K`) ait geometrik bilgileri `data/hatlar.geojson` dosyasından okuyarak JSON formatında döndürür.
    *   Örnek: `/api/guzergahlar?kodlari=G0068A,G0068B`

## İstemci Tarafı Mantığı (`public/js/map.js`)

`map.js` dosyası, kullanıcı arayüzündeki etkileşimleri ve harita üzerindeki gösterimleri yönetir.

1.  **Başlatma:**
    *   Sayfa yüklendiğinde Leaflet haritası oluşturulur ve OpenStreetMap katmanı eklenir.
    *   Gerekli DOM elementleri (input, button, select) seçilir.
    *   Otobüs işaretçileri ve güzergah çizgileri için ayrı katman grupları oluşturulur.

2.  **Ana Veri Akışı (`fetchAndDisplayHatData` fonksiyonu):**
    *   Kullanıcı bir hat kodu girip "Otobüsleri Göster" butonuna tıkladığında veya Enter'a bastığında tetiklenir.
    *   Mevcut harita katmanları temizlenir.
    *   **Otobüs Konumları:** `/api/hat/:hatKodu/konumlar` endpoint'ine istek gönderilerek girilen hatta ait aktif otobüslerin konumları alınır.
    *   **Güzergah Bilgileri:**
        *   Alınan otobüs konumlarından benzersiz `guzergahkodu` değerleri toplanır.
        *   Bu güzergah kodları kullanılarak `/api/guzergahlar?kodlari=...` endpoint'ine istek gönderilerek ilgili güzergahların geometrileri (`MultiLineString`) alınır.
    *   **Dropdown Doldurma (`populateRouteDropdown`):**
        *   Alınan güzergah bilgileri ile "Güzergah Seç" dropdown menüsü doldurulur.
        *   "Tüm Aktif Güzergahlar" seçeneği varsayılan olarak eklenir ve seçili hale getirilir.
    *   **Harita Güncelleme (`updateMapDisplay`):** Harita, alınan verilerle güncellenir.

3.  **Harita Güncelleme (`updateMapDisplay` fonksiyonu):**
    *   Bu fonksiyon, `fetchAndDisplayHatData` tamamlandığında ve kullanıcı dropdown'dan farklı bir güzergah seçtiğinde çağrılır.
    *   Mevcut otobüs ve güzergah katmanları temizlenir.
    *   **Güzergah Çizimi:**
        *   `currentRouteFeatures` (aktif hatta ait güzergahlar) ve dropdown'da seçili güzergah koduna göre filtreleme yapılır.
        *   "Tüm Aktif Güzergahlar" seçiliyse, o hatta ait tüm güzergahlar çizilir.
        *   Belirli bir güzergah seçiliyse, sadece o güzergah çizilir.
        *   Gidiş yönü için mavi (`#007bff`), dönüş yönü için yeşil (`#28a745`) renk kullanılır.
        *   Çizilen güzergahlara tıklandığında popup ile detay bilgisi gösterilir.
    *   **Otobüs İşaretçileri:**
        *   `currentBusLocations` (aktif hatta ait otobüsler) ve dropdown'da seçili güzergah koduna göre filtreleme yapılır.
        *   Eğer "Tüm Aktif Güzergahlar" seçiliyse ve bir otobüsün güzergah kodu `currentRouteFeatures` içinde mevcutsa (yani o hatta ait bir güzergahsa), otobüs gösterilir.
        *   Belirli bir güzergah seçiliyse, sadece o güzergah koduna sahip otobüsler gösterilir.
        *   Otobüs işaretçilerine tıklandığında popup ile detay bilgisi (kapı no, yön, son konum zamanı vb.) gösterilir.
    *   **Harita Odağı:** Harita, çizilen güzergahların tamamını veya (güzergah yoksa) otobüslerin tamamını içerecek şekilde odaklanır (`fitBounds`).
    *   Eğer seçili bir güzergahta aktif otobüs bulunamazsa kullanıcıya uyarı verilir.

4.  **Olay Dinleyicileri:**
    *   "Otobüsleri Göster" butonu ve "Hat Kodu" inputundaki Enter tuşu `fetchAndDisplayHatData` fonksiyonunu tetikler.
    *   "Güzergah Seç" dropdown'ının `change` olayı `updateMapDisplay` fonksiyonunu tetikler.

## Önemli Dosyalar ve İşlevleri

*   **`app.js`:**
    *   Express sunucusunu kurar ve başlatır.
    *   `public` klasöründeki statik dosyaları sunar.
    *   Sunucu başlangıcında `data/hatlar.geojson` dosyasını okuyup belleğe alır (performans için).
    *   `/api/hat/:hatKodu/konumlar` endpoint'i: İBB SOAP API'sine bağlanarak (`soap.createClientAsync`) `GetHatOtoKonum_json` metodunu çağırır ve otobüs verilerini alır.
    *   `/api/guzergahlar` endpoint'i: Bellekteki güzergah verilerinden, istenen güzergah kodlarına (`GUZERGAH_K`) göre filtreleme yaparak ilgili güzergah geometrilerini döndürür.

*   **`public/js/map.js`:**
    *   `fetchAndDisplayHatData(hatKodu)`: Otobüs konumlarını ve ilgili güzergah verilerini çekip haritayı ve dropdown'ı güncelleyen ana fonksiyondur.
    *   `populateRouteDropdown(routeFeatures)`: Verilen güzergah özelliklerine göre güzergah seçim dropdown'ını doldurur.
    *   `updateMapDisplay()`: Seçili güzergaha göre haritadaki güzergah çizgilerini ve otobüs işaretçilerini günceller, haritayı odaklar.

## Olası Geliştirmeler

*   Otobüslerin hareketini belirli aralıklarla otomatik güncelleme.
*   Haritaya tıklayarak en yakın durakları bulma.
*   Farklı harita katmanları (uydu, trafik vb.) ekleme seçeneği.
*   Kullanıcı arayüzü iyileştirmeleri. 

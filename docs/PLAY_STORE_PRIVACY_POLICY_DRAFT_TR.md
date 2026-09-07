# Safe Sentinel Pro — Gizlilik Politikası Taslağı

> Durum: Play Store hazırlık taslağı. Kamuya açılmadan önce geliştirici/şirket adı, gizlilik iletişim adresi, yürürlük tarihi ve gerçek production alan adı doldurulmalıdır.

## 1. Kapsam

Bu gizlilik politikası Safe Sentinel Pro mobil uygulamasının kullanıcı verilerini nasıl işlediğini açıklar. Safe Sentinel Pro; kullanıcı hesabı, cüzdan güvenlik analizi, güvenlik uyarıları, portföy/gas/risk analizi ve ilgili Web3 güvenlik özellikleri sunar.

## 2. İşlenebilen veri kategorileri

Uygulamanın mevcut production kodu ve veritabanı şemasına göre aşağıdaki veriler işlenebilir:

- Hesap bilgileri: ad, e-posta adresi ve hashlenmiş parola.
- Kimlik doğrulama/oturum verileri: oturum kimliği, son kullanma zamanı, IP adresi ve user-agent.
- Blockchain/cüzdan verileri: kullanıcının kaydettiği veya analiz için girdiği halka açık cüzdan adresleri, ağ bilgisi ve halka açık zincir verileri.
- Güvenlik verileri: risk sonuçları, güvenlik uyarıları, scam eşleşmeleri, whitelist/blacklist kayıtları ve güvenlik olayları.
- Üyelik/ödeme kayıtları: plan, abonelik durumu, doğrulama için kullanılan blockchain işlem kimliği (TXID) ve beklenen ödeme tutarı.
- Kullanıcı tercihleri: Guardian tercihleri, fiyat alarmı tercihleri, bildirim durumu ve benzeri uygulama ayarları.
- İzleme özellikleri: Whale Watch adresleri ve cüzdan izleme kayıtları.
- Miras özelliği kullanılırsa: ana cüzdan adresi, faydalanıcı/varis cüzdan adresi ve inactivity/heartbeat bilgileri.

Safe Sentinel Pro özel anahtar veya seed/recovery phrase istememeli, toplamamalı veya sunucuya göndermemelidir. Böyle bir davranış eklenirse bu politika ve Data Safety beyanı yeniden değerlendirilmelidir.

## 3. Cihazda saklanan veriler

Kimlik doğrulama tokenı desteklenen mobil platformlarda güvenli depolama mekanizmasında saklanır. Dil, para birimi ve bazı kullanıcı tercihleri cihazda yerel depolamada tutulabilir. Wallet bağlantısı için Reown/WalletConnect altyapısı yerel bağlantı durumunu saklayabilir.

## 4. Verilerin kullanım amaçları

Veriler yalnızca ilgili özelliği sunmak, kullanıcı hesabını doğrulamak, cüzdan/risk analizlerini gerçekleştirmek, güvenlik olaylarını ve bildirimleri yönetmek, kötüye kullanımı önlemek, ödeme/abonelik durumunu doğrulamak ve hizmet güvenliğini sağlamak için kullanılır.

## 5. Üçüncü taraf hizmetleri

Talep edilen özelliklere bağlı olarak halka açık cüzdan adresleri veya blockchain sorguları RPC/API sağlayıcılarına iletilebilir. Mevcut kod tabanında Reown/WalletConnect, blockchain RPC sağlayıcıları, TronGrid ve piyasa verisi sağlayıcıları gibi üçüncü taraf servislerle entegrasyon bulunabilir. Production yayından önce kullanılan sağlayıcıların güncel gizlilik uygulamaları ayrıca doğrulanmalı ve gerekiyorsa bu politikada isimlendirilmelidir.

## 6. Veri paylaşımı

Safe Sentinel Pro kullanıcı verilerini reklam amacıyla satmayı veya üçüncü taraflara pazarlama amacıyla paylaşmayı hedeflemez. Ancak hizmetin teknik olarak çalışması için gerekli altyapı, veritabanı, RPC, wallet-connect ve benzeri hizmet sağlayıcıları veriyi kendi rol ve sözleşmeleri kapsamında işleyebilir.

## 7. Güvenlik

Parolalar düz metin olarak saklanmaz; backend tarafında hashlenir. Kimlik doğrulama tokenları, CORS/rate-limit kontrolleri, input validation ve HTTPS production bağlantıları gibi güvenlik önlemleri uygulanır. Bununla birlikte hiçbir çevrimiçi sistem için mutlak güvenlik garanti edilemez.

## 8. Saklama ve silme

Kullanıcı, uygulama içindeki “Hesabı Kalıcı Olarak Sil” özelliği üzerinden hesabının silinmesini talep edebilir. Hesaba bağlı kayıtlar veri modelindeki cascade ilişkilerine göre silinir. Güvenlik olayları, olay kaydının bütünlüğü ve kötüye kullanım/güvenlik analizi amacıyla kullanıcı kimliğinden ayrıştırılarak anonimleştirilebilir (userId NULL). Yasal veya güvenlik gerekçesiyle tutulması zorunlu herhangi bir veri varsa production politikasında açıkça belirtilmelidir.

Google Play gereği ayrıca uygulama dışında erişilebilen bir hesap silme web sayfası yayınlanmalı ve Play Console'a girilmelidir.

## 9. Çocukların gizliliği

Safe Sentinel Pro çocuklara özel olarak tasarlanmamıştır. Hedef yaş grubu ve Play Console Target Audience ayarları yayın öncesinde kesinleştirilmelidir.

## 10. Değişiklikler

Bu politika uygulamanın veri işleme davranışı veya üçüncü taraf sağlayıcıları değiştiğinde güncellenir.

## 11. İletişim

Geliştirici/Şirket: [YAYIN ÖNCESİ DOLDUR]

Gizlilik iletişim e-postası: [YAYIN ÖNCESİ DOLDUR]

Kamuya açık politika URL'si: [YAYIN ÖNCESİ HTTPS URL EKLE]

Hesap silme URL'si: [YAYIN ÖNCESİ HTTPS URL EKLE]

---

Resmî Google Play referansları:
- User Data / Privacy Policy / Account Deletion: https://support.google.com/googleplay/android-developer/answer/10144311
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469

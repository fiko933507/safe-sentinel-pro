# Safe Sentinel Pro — Gizlilik Politikası / Privacy Policy

> **Yayın öncesi taslak / Pre-release draft**
>
> Bu metin mevcut Safe Sentinel Pro kaynak kodu ve veri modeli temel alınarak hazırlanmıştır. Google Play'de yayınlanmadan önce `[YÜRÜRLÜK TARİHİ]`, `[GELİŞTİRİCİ / ŞİRKET ADI]`, `[İLETİŞİM E-POSTASI]` ve `[WEB SİTESİ]` alanları doldurulmalıdır.

---

## TÜRKÇE

### 1. Kapsam

Bu Gizlilik Politikası, Safe Sentinel Pro mobil uygulamasının ve uygulamaya bağlı backend hizmetlerinin kullanıcı verilerini nasıl işlediğini açıklar.

Safe Sentinel Pro, kripto cüzdan güvenliği, blockchain risk analizi, scam/tehdit istihbaratı, cüzdan izleme, güvenlik bildirimleri, izin (approval) analizi, piyasa verisi ve ilgili güvenlik araçları sunar. Safe Sentinel Pro non-custodial olarak tasarlanmıştır; uygulama kullanıcıdan seed phrase veya private key talep etmemeli ve bunları saklamamalıdır.

### 2. İşlediğimiz veri kategorileri

Uygulamanın kullanılan özelliklerine göre aşağıdaki veriler işlenebilir:

- **Hesap bilgileri:** ad, e-posta adresi, parola hash'i, hesap rolü ve hesap oluşturma/güncelleme zamanları.
- **Kimlik doğrulama ve güvenlik verileri:** oturum kimliği/JWT ile ilişkili kayıtlar, oturum başlangıç/bitiş zamanı, IP adresi, user-agent, güvenlik olayı türü, endpoint/metot ve olay sonucu.
- **Kripto cüzdan bilgileri:** cüzdan adresi, blockchain ağı, kullanıcı etiketi; Vault, whitelist, blacklist ve Whale Watch kayıtları.
- **Blockchain ve güvenlik analiz verileri:** işlem kimliği (TXID/hash), işlem yönü, karşı taraf adresleri, token bilgisi, işlem miktarı, risk skoru/sinyalleri, scam eşleşmeleri ve güvenlik uyarıları.
- **VIP/abonelik ve ödeme doğrulama verileri:** plan, beklenen ödeme tutarı, işlem kimliği (TXID), ödeme doğrulama durumu, abonelik başlangıç ve bitiş tarihleri. Safe Sentinel Pro kullanıcıların ödeme kartı veya banka hesabı bilgilerini kaynak kodundaki mevcut akışta saklamaz; VIP doğrulaması blockchain işlem kimliği üzerinden yapılır.
- **Guardian ayarları:** Guardian açık/kapalı durumu, risk eşikleri ve izleme tercihleri.
- **Miras protokolü verileri:** izlenen cüzdan adresi, yararlanıcı/varis cüzdan adresi, hareketsizlik süresi, heartbeat ve protokol durumu.
- **Fiyat alarmı verileri:** ağ, varlık, hedef fiyat, alarm yönü ve tetiklenme durumu.
- **Bildirim verileri:** bildirim türü, önem seviyesi, başlık, içerik, ilgili ağ/varlık ve okunma durumu.
- **Uygulama tercihleri:** dil, para birimi, tema ve bazı yerel kullanıcı tercihleri cihazda saklanabilir.

### 3. Verileri neden kullanıyoruz

Veriler aşağıdaki amaçlarla işlenebilir:

- hesap oluşturmak ve oturum açmayı sağlamak;
- hesabı ve API erişimini korumak;
- kullanıcının talep ettiği cüzdan/blockchain analizlerini gerçekleştirmek;
- scam, phishing, akıllı sözleşme ve işlem risk sinyalleri üretmek;
- Vault, whitelist, blacklist, Guardian, Whale Watch, miras ve fiyat alarmı özelliklerini çalıştırmak;
- güvenlik bildirimleri ve servis olayları oluşturmak;
- VIP abonelik ödemesini blockchain üzerinden doğrulamak;
- kötüye kullanım, yetkisiz erişim ve güvenlik olaylarını araştırmak;
- hata ayıklamak, hizmet sürekliliğini sağlamak ve yasal yükümlülüklere uymak.

### 4. Blockchain ve üçüncü taraf hizmetleri

Kullanıcının talep ettiği özellikleri sağlamak için cüzdan adresleri, kontrat adresleri veya blockchain sorgu parametreleri ilgili blockchain RPC/API sağlayıcılarına iletilebilir. Uygulama ayrıca piyasa verisi için üçüncü taraf piyasa veri hizmetlerine ve cüzdan bağlantısı için üçüncü taraf wallet connection SDK'larına bağlanabilir.

Üçüncü taraf hizmetleri kendi gizlilik politikalarına göre IP adresi, ağ/cihaz bilgisi veya hizmet kullanımıyla ilgili teknik verileri işleyebilir. Google Play Data Safety beyanı hazırlanırken uygulamadaki tüm üçüncü taraf SDK'ların güncel veri işleme davranışı ayrıca doğrulanmalıdır.

### 5. Veri paylaşımı

Safe Sentinel Pro kullanıcı verilerini reklam amacıyla satmak üzere tasarlanmamıştır. Veriler yalnızca hizmetin çalışması için gerekli altyapı, blockchain/RPC, güvenlik ve teknik servis sağlayıcılarıyla işlenebilir veya paylaşılabilir; ayrıca hukuken gerekli olduğunda yetkili mercilere açıklanabilir.

Bu bölüm production altyapısı ve üçüncü taraf SDK listesi kesinleştikten sonra son kez güncellenmelidir.

### 6. Veri güvenliği

Mevcut production mimarisinde:

- parolalar düz metin yerine hash olarak saklanır;
- mobil authentication token'ları desteklenen cihazlarda SecureStore içinde saklanır;
- production backend HTTPS kullanacak şekilde yapılandırılır;
- rate limiting, güvenlik başlıkları, CORS ve input validation uygulanır;
- server secret'ları mobil uygulamaya gömülmemelidir;
- private key veya seed phrase sunucuya gönderilmemeli ve saklanmamalıdır.

İnternet üzerinden hiçbir veri aktarımı veya depolama yöntemi mutlak güvenlik garantisi vermez.

### 7. Veri saklama ve hesap silme

Veriler, hizmetin sunulması, güvenlik, dolandırıcılığın önlenmesi ve geçerli yasal yükümlülükler için gerekli olduğu sürece saklanabilir.

Kullanıcı uygulama içindeki **Hesabı Kalıcı Olarak Sil** seçeneğini kullanarak hesap silme talebi oluşturabilir. Hesap silme işlemi kullanıcı hesabını ve kullanıcıya bağlı kayıtları silmek üzere tasarlanmıştır. Güvenlik olaylarının bazıları kullanıcı hesabıyla olan ilişkisi kaldırılarak anonim/bağlantısız biçimde korunabilir; yasal veya güvenlik yükümlülükleri gerektiriyorsa belirli kayıtlar sınırlı süreyle tutulabilir.

Google Play yayını öncesinde kullanıcıların uygulamaya erişmeden hesap silme talebi başlatabileceği herkese açık bir web sayfası da sunulacaktır.

### 8. Kullanıcı hakları

Geçerli mevzuata bağlı olarak kullanıcılar verilerine erişme, düzeltme, silme, işlemeye itiraz etme veya belirli işleme faaliyetlerini kısıtlama haklarına sahip olabilir. Talepler `[İLETİŞİM E-POSTASI]` üzerinden iletilebilir.

### 9. Çocukların gizliliği

Safe Sentinel Pro finansal/kripto güvenlik özellikleri içerir ve çocuklara yönelik bir hizmet olarak tasarlanmamıştır. Hedef yaş grubu ve Play Console yaş derecelendirmesi yayın öncesinde kesinleştirilmelidir.

### 10. Değişiklikler

Bu politika ürün, mevzuat veya veri işleme uygulamalarındaki değişikliklere göre güncellenebilir. Güncel yürürlük tarihi bu sayfada yayımlanır.

### 11. İletişim

Geliştirici / Şirket: `[GELİŞTİRİCİ / ŞİRKET ADI]`  
E-posta: `[İLETİŞİM E-POSTASI]`  
Web: `[WEB SİTESİ]`  
Yürürlük tarihi: `[YÜRÜRLÜK TARİHİ]`

---

## ENGLISH

### 1. Scope

This Privacy Policy explains how the Safe Sentinel Pro mobile application and its connected backend services process user data.

Safe Sentinel Pro provides crypto-wallet security, blockchain risk analysis, scam/threat intelligence, wallet monitoring, security notifications, approval analysis, market information and related security tools. Safe Sentinel Pro is designed to be non-custodial; the app should not request or store a user's seed phrase or private key.

### 2. Categories of data we process

Depending on the features used, Safe Sentinel Pro may process:

- **Account information:** name, email address, password hash, account role, and account creation/update timestamps.
- **Authentication and security data:** session/JWT-related records, session timestamps, IP address, user-agent, security event type, endpoint/method and event outcome.
- **Crypto-wallet information:** wallet address, blockchain network and labels, including Vault, whitelist, blacklist and Whale Watch records.
- **Blockchain and security-analysis data:** transaction identifiers, transaction direction, counterparty addresses, token information, amounts, risk scores/signals, scam matches and security alerts.
- **VIP/subscription and payment-verification data:** plan, expected amount, transaction ID, verification status, subscription start and expiration dates. The current application flow does not store payment-card or bank-account details; VIP verification is based on blockchain transaction data.
- **Guardian settings:** enabled status, risk thresholds and monitoring preferences.
- **Inheritance-protocol information:** monitored wallet, beneficiary wallet, inactivity period, heartbeat and protocol status.
- **Price-alert data:** network, asset, target price, direction and trigger status.
- **Notification data:** type, severity, title/body, related network/asset and read status.
- **App preferences:** language, currency, theme and certain local preferences may be stored on the device.

### 3. Why we use data

We may use data to create and authenticate accounts, protect API access, perform requested wallet/blockchain analyses, generate security signals, operate monitoring and alert features, verify VIP subscription payments, investigate abuse or unauthorized access, maintain service reliability and comply with applicable legal obligations.

### 4. Blockchain and third-party services

To provide requested features, wallet addresses, contract addresses or blockchain query parameters may be transmitted to blockchain RPC/API providers. The app may also use market-data services and third-party wallet-connection SDKs.

Those providers may process technical information such as IP address, network/device information or service usage under their own privacy policies. All third-party SDK data practices must be reviewed before the final Google Play Data Safety submission.

### 5. Data sharing

Safe Sentinel Pro is not designed to sell user data for advertising. Data may be processed or shared with infrastructure, blockchain/RPC, security and technical providers where necessary to operate the service, and may be disclosed where required by law.

This section must be reviewed again after the final production hosting and SDK configuration are confirmed.

### 6. Security

The current production architecture uses password hashing, secure mobile token storage where supported, HTTPS-only production networking, rate limiting, security headers, CORS controls and input validation. Server secrets must not be embedded in the mobile client. Private keys and seed phrases must not be transmitted to or retained by the Safe Sentinel Pro backend.

No method of electronic transmission or storage can provide an absolute security guarantee.

### 7. Retention and account deletion

Data may be retained for as long as necessary to provide the service, maintain security, prevent fraud and meet applicable legal obligations.

Users may use the in-app **Permanently Delete Account** option to request deletion. The deletion flow is designed to remove the account and user-associated records. Certain security-event records may be retained in an anonymized/de-linked form, or limited records may be retained where required for legal or security obligations.

Before Google Play publication, Safe Sentinel Pro will also provide a public web page through which users can initiate an account-deletion request without having to access the app.

### 8. User rights

Depending on applicable law, users may have rights to access, correct or delete their data, object to processing or request restrictions. Requests can be sent to `[CONTACT EMAIL]`.

### 9. Children's privacy

Safe Sentinel Pro contains financial/crypto-security functionality and is not designed as a service directed to children. The final target age group and Play Console age-rating configuration must be confirmed before release.

### 10. Changes

This policy may be updated as the product, applicable law or data-processing practices change. The current effective date will be displayed on the published policy.

### 11. Contact

Developer / Company: `[DEVELOPER / COMPANY NAME]`  
Email: `[CONTACT EMAIL]`  
Website: `[WEBSITE]`  
Effective date: `[EFFECTIVE DATE]`

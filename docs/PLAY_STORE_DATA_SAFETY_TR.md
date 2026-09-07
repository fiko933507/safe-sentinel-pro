# Safe Sentinel Pro — Google Play Data Safety Çalışma Dosyası

> **Durum:** Yayın öncesi taslak. Bu belge, mevcut kaynak kodu ve Prisma veri modeline göre hazırlanmıştır. Play Console'a gönderilmeden önce production hosting, üçüncü taraf SDK'lar ve gerçek cihaz ağ trafiği son kez doğrulanmalıdır.

## 1. Genel sonuç

Safe Sentinel Pro için **“veri toplamıyor”** seçeneği doğru değildir. Uygulama hesap oluşturur ve backend'e kullanıcı tarafından sağlanan veya uygulama işlevi için gerekli çeşitli verileri gönderir.

Mevcut kodda doğrulanan ana veri grupları:

| Google Play kategorisi | Safe Sentinel'teki veri | Toplanıyor mu? | Ana kullanım amacı | Zorunlu / isteğe bağlı notu |
|---|---|---:|---|---|
| Personal info — Name | Kullanıcı adı/soyadı | Evet | Account management | Hesap oluşturmak için gerekli |
| Personal info — Email address | E-posta | Evet | Account management / authentication | Hesap oluşturmak için gerekli |
| App activity / Other user-generated content benzeri kayıtlar | Guardian, whitelist/blacklist, Vault, Whale Watch, miras ve alarm tercihleri | Evet | App functionality / security | Özelliğe göre isteğe bağlı |
| Financial info / Purchase history değerlendirmesi gereken alan | VIP planı, beklenen tutar, blockchain ödeme TXID'si ve durum | Evet | Subscription/payment verification | Yalnızca VIP kullanıcısı için |
| Device or other IDs / güvenlik teknik verileri | IP adresi, user-agent, auth session/security event metadata | Evet | Security, fraud prevention, account management | Backend güvenliği için |
| User IDs | Dahili kullanıcı ID'si, auth-session ID/JTI | Evet | Account management, security | Hizmet için gerekli |
| Other financial / crypto data değerlendirmesi gereken alan | Wallet adresleri ve blockchain transaction bilgileri | Evet | App functionality / security analysis | Özelliğe göre gerekli |

> Google Play formundaki kesin kategori isimleri Play Console'da görünen güncel seçeneklerle eşleştirilmelidir. Özellikle wallet adresi, blockchain işlem verisi ve VIP TXID'sinin hangi Data Safety veri tipine yerleştirileceği formdaki güncel tanımlara göre son kez kontrol edilmelidir.

## 2. Kaynak kodda doğrulanan backend verileri

Prisma veri modelinde şu kayıtlar bulunur:

- User: email, name, passwordHash, role, timestamps.
- AuthSession: jti, userId, created/expires/revoked timestamps, IP address, user-agent.
- SecurityEvent: userId (nullable), event type, severity, IP, user-agent, endpoint, method, success, details.
- Wallet: network, address, label.
- WhitelistAddress / BlacklistAddress: network, address, label.
- WhaleWatch: network, address, label, last seen transaction/time.
- GuardianProfile: risk thresholds ve monitoring seçenekleri.
- InheritanceProtocol: wallet ve beneficiary adresleri, inactivity period, heartbeat ve status.
- Payment / Subscription: plan, expected amount, TXID, status, start/expiry.
- PriceAlert: asset, target price, direction, trigger state.
- SecurityAlert / Notification: güvenlik olayları, transaction ID, counterparty, amount/token, notification content/read state.
- ScamAddress / ScamEvidence: tehdit istihbaratı kayıtları; bunların bir kısmı sistem/veri kümesi kaynaklıdır ve doğrudan kullanıcı verisi olmayabilir.

## 3. Cihazda saklanan veriler

Frontend kaynak koduna göre:

- Authentication token mobilde Expo SecureStore içinde saklanır.
- Web ortamında token için AsyncStorage fallback'i bulunur.
- Dil ve para birimi tercihleri AsyncStorage'da tutulur.
- Whitelist, blacklist ve Vault verilerinin yerel kopyaları/backup'ları tutulabilir.
- Push/local notification kullanımı vardır; mevcut App.js içinde bir uzak push token'ının backend'e kaydedildiği doğrulanmamıştır. Bu davranış ileride eklenirse Data Safety güncellenmelidir.

## 4. “Collected” değerlendirmesi

Google Play tanımında veri cihaz dışına uygulama veya SDK tarafından iletiliyorsa “collected” sayılabilir. Safe Sentinel Pro aşağıdaki verileri backend'e gönderdiği için bunlar açısından **Collected = Yes** değerlendirmesi beklenmelidir:

- ad ve e-posta;
- authentication/API istekleriyle ilişkili hesap ve teknik güvenlik verileri;
- kullanıcı tarafından analiz edilen veya kaydedilen wallet adresleri;
- Vault/whitelist/blacklist/Whale Watch kayıtları;
- Guardian ve miras protokolü ayarları;
- fiyat alarmı ayarları;
- VIP blockchain TXID'si.

## 5. “Shared” değerlendirmesi — gönderimden önce doğrulanacak

Google Play “sharing” tanımı, üçüncü taraflarla veri aktarımına göre ayrı değerlendirme ister. Son Play Console beyanından önce aşağıdakiler kesinleştirilmelidir:

- Blockchain RPC/API sağlayıcılarına hangi wallet/contract adreslerinin gönderildiği.
- Reown / AppKit / WalletConnect SDK'nın hangi teknik veya kullanıcı verilerini işlediği.
- CoinGecko isteklerinin doğrudan cihazdan mı, backend'den mi yapıldığı ve hangi teknik verilerin sağlayıcı tarafından görülebildiği.
- Hosting, database, error/crash analytics veya monitoring sağlayıcısı kullanılıyorsa bunların veri işleme rolü.
- Expo Notifications kapsamında yalnızca local notification mı, yoksa push token / Expo Push Service kullanımı mı olduğu.

Bu denetim bitmeden Play Console'da “No data shared” seçeneği kesin olarak işaretlenmemelidir.

## 6. Amaçlar

Mevcut kod davranışına göre Data Safety amaçlarında en az şu başlıkların değerlendirilmesi gerekir:

- **App functionality:** wallet analysis, monitoring, alerts, portfolio, Guardian, inheritance, VIP.
- **Account management:** registration, login, session, account deletion.
- **Security, fraud prevention, compliance:** security events, IP/user-agent, rate limit/auth events, scam/risk analysis.
- **Analytics:** yalnızca gerçekten analytics/telemetry servisi bağlıysa seçilmelidir. Mevcut yerel console/performance logları tek başına üçüncü taraf analytics anlamına gelmez.
- **Developer communications:** mevcut koddan e-posta pazarlama/iletişim sistemi doğrulanmadığı için seçilmemelidir.
- **Advertising or marketing:** mevcut koddan reklam sistemi doğrulanmadığı için seçilmemelidir.

## 7. Şifreleme ve güvenlik soruları

Mevcut production hedefi HTTPS-only'dir. Play Console Data Safety formunda “data encrypted in transit” yanıtı, production backend gerçekten HTTPS üzerinden yayına alındıktan ve tüm production network çağrıları doğrulandıktan sonra **Yes** olarak işaretlenmelidir.

Authentication token'ları mobilde SecureStore'da tutulur. Parolalar backend'de hash olarak saklanır; kullanıcı parolasının düz metin hali veritabanında tutulmamalıdır.

## 8. Veri silme

Uygulamada `DELETE /api/me` üzerinden kalıcı hesap silme akışı vardır. Kullanıcıya uygulama içinde hesap silme yolu sunulur.

Google Play yayını öncesinde ayrıca uygulama dışında erişilebilen herkese açık hesap silme sayfası yayınlanmalıdır. Bu sayfada:

- uygulama/developer adı,
- silme talebinin nasıl başlatılacağı,
- hangi verilerin silineceği,
- herhangi bir verinin tutulup tutulmayacağı ve tutulma süresi

açıkça belirtilmelidir.

## 9. Financial Features Declaration

Safe Sentinel Pro, kripto cüzdan adreslerini analiz eder, wallet connection kullanır ve VIP ödemesini blockchain üzerinden doğrular. Google Play'in Financial Features Declaration formu tüm uygulamalar için zorunludur. Formda mevcut uygulama davranışına uygun seçenekler seçilmelidir.

**Önemli sınıflandırma notu:** Safe Sentinel Pro non-custodial bir güvenlik/analiz uygulamasıdır ve kaynak kodda kullanıcı fonlarını saklayan bir custodial wallet veya kripto borsası doğrulanmamıştır. Buna rağmen wallet bağlantısı, wallet yönetimi/portfolio ve finansal güvenlik özellikleri nedeniyle “Cryptocurrency wallet”, “Other” veya Play Console'daki güncel en yakın kategori arasında doğru sınıflandırma yayın öncesinde ayrıca değerlendirilmelidir. Gerçekte sunulmayan “cryptocurrency exchange”, yatırım danışmanlığı veya NFT trading gibi kategoriler işaretlenmemelidir.

## 10. Yayın öncesi son checklist

- [ ] Production backend HTTPS üzerinde canlı ve test edilmiş.
- [ ] Privacy Policy herkese açık HTTPS URL'de.
- [ ] Web hesap silme sayfası herkese açık HTTPS URL'de.
- [ ] Reown/AppKit/WalletConnect güncel privacy/data handling davranışı incelendi.
- [ ] Expo Notifications local/push davranışı kesinleştirildi.
- [ ] Production build içindeki SDK/permission listesi tekrar tarandı.
- [ ] Gerçek cihaz ağ trafiği gözden geçirildi.
- [ ] Play Console Data Safety formu bu belgeyle karşılaştırıldı.
- [ ] Financial Features Declaration gerçek işlevlerle uyumlu dolduruldu.
- [ ] Privacy Policy ile Data Safety cevapları birbiriyle tutarlı.

## Resmî Google Play referansları

- User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Data Safety guidance: https://support.google.com/googleplay/android-developer/answer/10787469
- Account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111
- Financial Services policy: https://support.google.com/googleplay/android-developer/answer/9876821
- Financial Features Declaration: https://support.google.com/googleplay/android-developer/answer/13849271

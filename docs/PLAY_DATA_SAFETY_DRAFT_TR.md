# Safe Sentinel Pro — Google Play Data Safety Taslağı

> Bu dosya Play Console formunu doldururken kullanılacak teknik çalışma notudur. Nihai beyan, production backend, kullanılan üçüncü taraf SDK'lar ve gerçek privacy policy ile birebir eşleşmelidir.

## 1. Uygulama veri topluyor mu?

Evet. Mevcut production veri modeline göre hesap ve güvenlik hizmetlerini sunmak için bazı kullanıcı verileri sunucuya gönderilir ve saklanır.

## 2. Veri kategorileri ve amaçları

| Veri | Toplanır/Saklanır | Amaç | Silme davranışı |
|---|---|---|---|
| Ad | Evet | Hesap/profil | Hesap silmede silinir |
| E-posta | Evet | Hesap ve authentication | Hesap silmede silinir |
| Parola | Düz metin hayır; hash saklanır | Authentication | Hesap silmede silinir |
| Auth session ID/JTI | Evet | Oturum güvenliği | Hesap silmede silinir |
| IP adresi | Evet, auth/security loglarında olabilir | Güvenlik, abuse/fraud önleme | AuthSession kullanıcıyla silinir; SecurityEvent kullanıcı kimliğinden ayrıştırılabilir |
| User-agent | Evet, auth/security loglarında olabilir | Güvenlik, abuse/fraud önleme | AuthSession kullanıcıyla silinir; SecurityEvent kullanıcı kimliğinden ayrıştırılabilir |
| Halka açık cüzdan adresi | Evet | Wallet/risk/portfolio/monitoring | Kullanıcı hesabına bağlı kayıtlar silinir |
| Blockchain transaction ID (TXID) | Evet | VIP ödeme doğrulama ve güvenlik olayları | İlişkili kullanıcı kayıtları veri modeline göre silinir |
| Wallet transaction/public chain data | Sorgulanır; bazı güvenlik kayıtlarında tutulabilir | Risk analizi ve güvenlik | Özelliğe/veri modeline göre |
| Whitelist/Blacklist adresleri | Evet | Kullanıcı güvenlik tercihleri | Hesap silmede silinir |
| Security alerts | Evet | Güvenlik hizmeti | Hesap silmede silinir |
| Security events | Evet | Güvenlik/audit | Kullanıcı silindiğinde userId NULL yapılarak anonimleştirilebilir |
| Guardian tercihleri | Evet | Güvenlik ayarları | Hesap silmede silinir |
| Whale Watch adresleri | Evet | İzleme özelliği | Hesap silmede silinir |
| Fiyat alarmı bilgileri | Evet | Alarm özelliği | Hesap silmede silinir |
| Miras/beneficiary wallet adresi | Özellik kullanılırsa evet | Miras protokolü | Hesap silmede silinir |
| Bildirim kayıtları | Evet | Güvenlik ve uygulama bildirimleri | Hesap silmede silinir |
| Dil/para birimi tercihleri | Cihazda yerel | UI tercihi | Uygulama verisi temizlendiğinde gider; hesap silme akışında ayrıca kontrol edilmeli |
| JWT/session token | Cihazda SecureStore | Authentication | Logout/hesap silmede temizlenmeli |

## 3. Finansal bilgi değerlendirmesi

Safe Sentinel Pro kripto cüzdanı, blockchain işlem verisi, risk analizi ve VIP blockchain ödeme doğrulaması ile çalışır. Google Play Financial Features Declaration formu zorunludur. Uygulamanın "crypto wallet" veya "money transfer/trading" işlevi sunduğu iddiası, gerçek işlevlerle birebir eşleştirilmelidir. Safe Sentinel private key saklamıyor ve kullanıcı adına custody hizmeti vermiyorsa bu ayrım beyanlarda korunmalıdır.

## 4. Veri paylaşımı / üçüncü taraflar — YAYIN ÖNCESİ TEYİT

Aşağıdaki servislerin production'da gerçekten kullanılıp kullanılmadığı ve Google Play tanımına göre “data sharing” oluşturup oluşturmadığı sağlayıcı dokümanlarından teyit edilmelidir:

- Reown / WalletConnect
- Railway veya seçilecek hosting/database sağlayıcısı
- TronGrid
- EVM/Solana/Bitcoin/Pi RPC/API sağlayıcıları
- CoinGecko veya kullanılan piyasa verisi sağlayıcısı
- Expo Notifications altyapısı

SDK'nın kendi telemetri veya identifier toplaması Data Safety formunda geliştiricinin sorumluluğundadır.

## 5. Güvenlik soruları için mevcut teknik durum

- Production backend HTTPS kullanacak şekilde tasarlanmıştır.
- Android cleartext trafik kapalıdır.
- Parolalar hashlenir.
- Token mobilde SecureStore içinde saklanır.
- Hesap silme endpoint'i mevcuttur.
- Database bağlantısı ve backend 7/24 production'a taşınmadan nihai Data Safety beyanı kilitlenmemelidir.

## 6. Play Console öncesi zorunlu kontrol listesi

- [ ] Kamuya açık, HTTPS, HTML gizlilik politikası yayında.
- [ ] Uygulama içinden Privacy Policy erişilebilir.
- [ ] Uygulama içi hesap silme çalışıyor.
- [ ] Harici web hesap silme sayfası yayında.
- [ ] Üçüncü taraf SDK veri uygulamaları doğrulandı.
- [ ] Data Safety formu privacy policy ile eşleşiyor.
- [ ] Financial Features Declaration gerçek ürün davranışına göre dolduruldu.
- [ ] Ads kullanımı gerçek duruma göre beyan edildi.
- [ ] App Access gerekiyorsa test hesabı/erişim talimatı hazırlandı.

Resmî Google Play referansları:
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/13849271
- https://support.google.com/googleplay/android-developer/answer/9876821

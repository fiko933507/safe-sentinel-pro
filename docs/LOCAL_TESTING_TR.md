# Safe Sentinel Pro — Bütçesiz Lokal Test Akışı

Bu belge, production hosting alınmadan önce Safe Sentinel Pro backend'ini bilgisayarda çalıştırıp temel ve gelişmiş araçları gerçek API zinciriyle test etmek için hazırlanmıştır.

## 1. Backend'i başlat

Backend klasöründe gerekli `.env` değerlerinin yalnızca yerel geliştirme için tanımlı olduğundan emin olun.

```powershell
cd backend
npm install
npx prisma generate
npm start
```

Backend varsayılan olarak yapılandırılan `PORT` üzerinde çalışır. Lokal smoke test varsayılan olarak `http://127.0.0.1:3000` adresini kullanır. Backend farklı portta çalışıyorsa `SMOKE_BASE_URL` ayarlayın.

## 2. Temel smoke test

Ayrı bir terminalde:

```powershell
cd backend
npm run smoke:local
```

Bu test otomatik olarak:

- `/health` + PostgreSQL bağlantısını,
- geçici kullanıcı kaydını,
- authenticated `/api/me` isteğini,
- geçersiz JWT'nin reddedilmesini,
- login akışını,
- geçersiz wallet input'unun reddedilmesini,
- test sonunda geçici hesabın `DELETE /api/me` ile silinmesini

kontrol eder.

## 3. Gerçek wallet/risk motorlarını da test et

Kendinize ait olması gerekmeyen, herkese açık bir blockchain wallet adresi test için kullanılabilir. Private key veya seed phrase **kullanmayın**.

PowerShell örneği:

```powershell
$env:TEST_NETWORK="ethereum"
$env:TEST_WALLET_ADDRESS="0x..."
npm run smoke:local
```

Bu iki değişken tanımlandığında test ayrıca şu gerçek backend motorlarını çağırır:

- `/api/check-wallet` — Wallet/Risk scan
- `/api/wallet-behavioral-fingerprint`
- `/api/scam-dna`
- `/api/wallet-security-graph`
- `/api/early-warning`

Her çağrı HTTP başarı durumunu ve `success:true` sonucunu bekler.

## 4. Başka port kullanılıyorsa

```powershell
$env:SMOKE_BASE_URL="http://127.0.0.1:4000"
npm run smoke:local
```

## 5. Frontend release kontrolleri

```powershell
cd frontend
npm install
npm run release:audit
npm run i18n:audit
```

`i18n:audit`, her dil sözlüğünün kapsamını ve muhtemel hard-coded kullanıcı metinlerini raporlar. Şu an production dil seçicisinde yalnızca tam destekli Türkçe ve İngilizce açılmalıdır.

## 6. Manuel telefon testi

Expo/Android uygulamasında şu akışları sırayla test edin:

1. Kayıt ol.
2. Çıkış yap ve tekrar giriş yap.
3. Uygulamayı kapat/aç; session davranışını kontrol et.
4. Türkçe → İngilizce geçişi yap ve Login, Dashboard, Wallet/Risk, Guardian, Miras, Gas, Portfolio, Revoke, Whale Watch, Settings ve VIP ekranlarını dolaş.
5. Backend'i kapat ve uygulamanın beyaz ekran yerine kontrollü hata gösterdiğini kontrol et.
6. Backend'i tekrar aç ve bağlantının geri geldiğini doğrula.
7. Geçersiz wallet adresi dene.
8. Gerçek public wallet adresiyle desteklenen ağlarda scan yap.
9. Hesap silme akışını yalnızca test hesabıyla dene.

## 7. Test sonucu kabul kriteri

Bir araç yalnızca UI açıldığı için PASS sayılmaz. PASS için zincir şu şekilde tamamlanmalıdır:

`UI → frontend handler → API → authentication → backend logic → database/RPC (gerekiyorsa) → gerçek sonuç → kullanıcıya doğru mesaj`

`PLANLANDI`, local-only veya yalnızca taslak oluşturan işlevler gerçek blockchain/monitoring özelliği olarak sunulmamalıdır.

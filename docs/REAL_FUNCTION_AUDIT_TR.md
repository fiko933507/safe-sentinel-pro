# Safe Sentinel Pro — Gerçek İşlev Denetimi

> Tarih: 7 Eylül 2026
>
> Bu belge, güncel `main` dalındaki frontend, backend route'ları, adapter katmanı ve Prisma veri modeli temel alınarak hazırlanmıştır. Bir aracın yalnızca ekranda görünmesi “çalışıyor” kabul edilmemiştir.

## Durum tanımları

- **GERÇEK BACKEND + VERİ:** UI/API veya backend tarafında gerçek database/RPC/veri kaynağı kullanır.
- **BACKEND GERÇEK / FRONTEND EKSİK:** Backend motoru uygulanmış fakat production UI entegrasyonu eksik veya geride kalmıştır.
- **KISITLI:** Özellik çalışır fakat gerçek-time, ağ, veri kaynağı veya kullanım biçimi açısından açık sınırlaması vardır.
- **PRODUCTION'DAN GİZLİ:** Kod tutulur fakat ilk release'te kullanıcıya çalışan özellik gibi gösterilmez.
- **LOKAL TEST BEKLİYOR:** Kod zinciri vardır; gerçek lokal backend ile smoke test çalıştırılmalıdır.

## Araç durumu

| Araç / Sistem | Gerçek durum | Veri kaynağı / işlem | Not |
|---|---|---|---|
| Register / Login / Session | GERÇEK BACKEND + DB | PostgreSQL, bcrypt, JWT/AuthSession | Lokal smoke test eklendi |
| Account deletion | GERÇEK BACKEND + DB | `DELETE /api/me`, Prisma transaction | Uygulama dışı web şablonu da hazırlandı |
| Wallet Scan | GERÇEK BACKEND + RPC | Blockchain adapter + Scam Intelligence + Risk Engine | Ağ bazlı provider testi gerekli |
| TRON Risk Engine | GERÇEK | TRON live adapter + transaction metrics | RPC/API key bağımlı |
| EVM Risk Engine | GERÇEK | EVM RPC + transaction/token verileri | Provider limitlerine bağlı |
| Scam Intelligence | GERÇEK | ScamAddress / ScamEvidence DB + transaction counterparties | Ayrı dashboard kartı yerine diğer motorların içinde de kullanılır |
| Phishing Shield | GERÇEK / KISITLI | Lokal URLhaus threat index | Eşleşme yoksa “güvenli” garantisi vermez |
| Transfer Shield | GERÇEK | Scam Intelligence recipient lookup | Blockchain işlemini kendi başına engellemez; risk sinyali üretir |
| Smart Contract Analysis | GERÇEK | EVM RPC bytecode/contract calls + scam intelligence | EVM ağları |
| Revoke Center | GERÇEK | Backend allowance/revoke preparation + wallet-side Ethers signing | EVM ve bağlı kullanıcı wallet'ı gerekir |
| Portfolio | GERÇEK | Adapter wallet/token/transaction verileri | Mobil JSON/CSV export için Share import koruması eklendi |
| Live Gas | GERÇEK | EVM RPC `getFeeData()` | Canlı veri gelmeden sahte başlangıç rakamları production build'de gösterilmez |
| Market Intelligence | GERÇEK / KURAL TABANLI | CoinGecko global live market data | LLM/AI modeli değildir; isim production'da “Piyasa İstihbaratı” olarak düzeltilir |
| Price Alerts | GERÇEK BACKEND MONITORING | PostgreSQL PriceAlert + periyodik CoinGecko polling + Notification | Hosting açık olduğu sürece server-side polling çalışır |
| Vault | GERÇEK BACKEND + DB | Wallet modeli + monitoring endpoint | VIP ve 10-wallet limiti backend'de uygulanır |
| Vault Scam Monitor | GERÇEK | Blockchain adapter + scam DB + SecurityAlert | Hosting açık olduğu sürece polling/çağrı zinciri gerekir |
| Whitelist / Blacklist | GERÇEK BACKEND + DB | Prisma + security event kayıtları | Frontend local cache ile backend senkronizasyonu ayrıca cihaz testinde doğrulanmalı |
| Guardian | GERÇEK BACKEND PROFİLİ | GuardianProfile + risk/intelligence ayarları | Gerçek değerlendirme akışı cihaz testinde doğrulanmalı |
| Miras / Inheritance | GERÇEK BACKEND + DB | InheritanceProtocol, heartbeat, cancel | Fonları otomatik transfer eden custodial executor olarak sunulmamalı |
| Whale Watch backend | GERÇEK | DB + adapter `discoverTransfers` + server polling + SecurityAlert | Backend gerçek; frontend entegrasyonu geride |
| Whale Watch frontend | FRONTEND EKSİK | Eski local/sample state vardı | Production ana ekrandan geçici olarak gizlendi; gerçek API'ye bağlanınca açılmalı |
| Wallet Behavioral Fingerprint | GERÇEK BACKEND / UI EKSİK | Live adapter + scam/counterparty verileri + behavior metrics | `POST /api/wallet-behavioral-fingerprint` |
| Scam DNA Engine | GERÇEK BACKEND / UI EKSİK | Live blockchain + scam DB + pattern scoring | `POST /api/scam-dna` |
| Wallet Security Graph | GERÇEK BACKEND / UI EKSİK | Transaction nodes/edges + scam nodes | `POST /api/wallet-security-graph` |
| Early Warning | GERÇEK BACKEND / KISITLI UI | Current blockchain scan + scam/failure/distribution warnings | Sürekli realtime stream değildir |
| Emergency Asset Lock | PRODUCTION'DAN GİZLİ | Gerçek blockchain lock yok | Kod gelecekte geliştirmek için tutulur |
| Tax Report | PRODUCTION'DAN GİZLİ | Doğrulanmış CSV/PDF export yok | İlk release'te görünmez |
| DEX Stop-Loss / Take-Profit | PRODUCTION'DAN GİZLİ | Yalnızca yerel emir taslağı | Zincir üstü emir yürütmesi yok |

## Önemli frontend/backend uyumsuzlukları

### 1. Whale Watch

Backend gerçek WhaleWatch kayıtları, transfer discovery ve polling alarm motoruna sahiptir. Mevcut frontend ise eski local/sample liste yaklaşımından kalmıştır. Bu nedenle production build'de Whale Watch kartı geçici olarak gizlenmiştir. Backend kodu silinmemiştir.

### 2. Security Intelligence V2

Wallet Behavioral Fingerprint, Scam DNA, Wallet Security Graph ve Early Warning backend route'ları uygulanmıştır. Dashboard'ın bunları hâlâ “PLANLANDI” göstermesi backend gerçekliğiyle uyumsuzdur. Lokal smoke test PASS aldıktan sonra bu motorlar ayrı ve dürüst UI ekranlarına bağlanmalıdır.

### 3. Price Alerts

Frontend'deki eski `LOCAL_ONLY` etiketi backend gerçekliğiyle uyumsuzdur. Backend PriceAlert kayıtlarını periyodik olarak canlı fiyat verisiyle kontrol eder ve Notification oluşturur. Production build bu nedenle server-monitoring durumunu kullanır.

### 4. Gas başlangıç değerleri

Frontend kaynakta örnek/sabit gas değerleri başlangıç state'i olarak bulunmuştur. Production build katmanı bu değerleri `—` yapar; gerçek `/api/live-gas-fees` sonucu gelmeden kullanıcıya canlı ücretmiş gibi sayı gösterilmez.

## Lokal doğrulama

Backend açıkken:

```powershell
cd backend
npm run smoke:local
```

Gerçek wallet motorlarını dahil etmek için:

```powershell
$env:TEST_NETWORK="ethereum"
$env:TEST_WALLET_ADDRESS="0x..."
npm run smoke:local
```

Bu test sonucunu görmeden bu belgede “LOKAL TEST BEKLİYOR” kapsamındaki özellikler gerçek cihazda doğrulanmış sayılmaz.

## Release ilkesi

Safe Sentinel Pro'da bundan sonra bir araç şu zincirin tamamı doğrulanmadan “çalışıyor” olarak işaretlenmemelidir:

`UI → Handler → Auth → API → Backend Logic → Database/RPC/Provider → Gerçek Sonuç → Doğru Kullanıcı Mesajı`

Kısıtlı özellikler kısıtlarını açıkça göstermeli; henüz yürütme yapmayan özellikler gerçek blockchain işlemi yapıyormuş gibi sunulmamalıdır.

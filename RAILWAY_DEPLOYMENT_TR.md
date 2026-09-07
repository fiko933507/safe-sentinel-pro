# Safe Sentinel Pro — Railway production kurulumu

## Servis yapısı

- Repository: `fiko933507/safe-sentinel-pro`
- Branch: `main`
- Backend root directory: `/backend`
- Builder: backend klasöründeki `Dockerfile`
- Pre-deploy command: `npm run railway:predeploy`
- Start command: `npm run railway:start`
- Healthcheck: `/health`

Root directory mutlaka `/backend` olmalıdır. Böylece Railway frontend paketini
Node backend olarak başlatmaya çalışmaz.

## Railway PostgreSQL

Railway projesine PostgreSQL servisi ekleyin. Backend servisindeki
`DATABASE_URL` değerini PostgreSQL servisinin `DATABASE_URL` referansına
bağlayın. Veritabanı değerini kaynak koda veya GitHub değişkenine kopyalamayın.

Production migration yalnızca:

```text
npm run railway:predeploy
```

ile uygulanır. `prisma db push`, `prisma migrate reset` ve veritabanını
sıfırlayan komutlar production ortamında kullanılmaz.

## Zorunlu Railway Variables

| Değişken | Kaynak |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Railway PostgreSQL reference |
| `JWT_SECRET` | En az 32 karakterlik yeni production secret |
| `CORS_ORIGIN` | Virgülle ayrılmış gerçek HTTPS web originleri |
| `VIP_TRON_ADDRESS` | Gerçek VIP ödeme adresi |
| `TRONGRID_API_KEY` | TronGrid production anahtarı |

`PORT` Railway tarafından sağlanır; elle sabitlemek gerekmez.

## İsteğe bağlı veya varsayılanı bulunan değişkenler

- `TRON_RPC`
- `VIP_USDT_CONTRACT`
- `VIP_MONTHLY_USDT`
- `VIP_YEARLY_USDT`
- `ETHEREUM_RPC`
- `BSC_RPC`
- `POLYGON_RPC`
- `ARBITRUM_RPC`
- `BASE_RPC`
- `OPTIMISM_RPC`
- `AVALANCHE_RPC`
- `SOLANA_RPC`
- `BITCOIN_API`
- `PI_API`
- `WHALE_ALERT_POLL_MS`
- `PRICE_ALERT_POLL_MS`
- `EVM_TOKEN_LOOKBACK_BLOCKS`
- `EVM_LOG_CHUNK_SIZE`
- `EVM_LOG_MIN_CHUNK_SIZE`
- `EVM_LOG_RPC_TIMEOUT_MS`
- `EVM_MAX_TOKEN_CONTRACTS`
- `EVM_TOKEN_CONCURRENCY`
- `EVM_NATIVE_TX_LOOKBACK_BLOCKS`
- `EVM_NATIVE_TX_MAX_BLOCKS`
- `EVM_NATIVE_TX_CONCURRENCY`
- `EVM_NATIVE_TX_TIMEOUT_MS`
- `EVM_APPROVAL_LOOKBACK_BLOCKS`
- `EVM_DISABLE_TOKEN_SCAN`
- `EVM_DISABLE_NATIVE_TX_SCAN`

DigitalOcean tokenı veya herhangi bir `EXPO_PUBLIC_*` değişkeni backend
servisine eklenmez.

## Deployment sonrası

Public Railway domain oluşturulduktan sonra `/health` yalnızca backend
PostgreSQL'e bağlanabiliyorsa HTTP 200 döndürür. URL daha sonra EAS production
ortamında `EXPO_PUBLIC_BACKEND_URL` olarak tanımlanır.

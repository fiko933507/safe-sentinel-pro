# Safe Sentinel Pro production stack

## Quick start
1. Provision PostgreSQL.
2. Configure backend/.env from .env.example.
3. cd backend && npm install && npx prisma generate && npx prisma db push && npm start
4. Deploy behind HTTPS.
5. Set EXPO_PUBLIC_API_URL in Expo and build with EAS.

## Security model
- Passwords: bcrypt (12 rounds)
- API authentication: 7-day signed JWT
- Rate limiting + Helmet + CORS allow-list
- Server-only secrets
- VIP activation: confirmed transaction, unique TXID, amount threshold, server-side subscription update

## VIP production hardening still required
Use a tested Tron address codec (for example TronWeb utilities) to decode/compare the transaction recipient to VIP_TRON_ADDRESS. The server intentionally refuses to treat a client-supplied recipient as proof.

## Deploy
Backend: Render/Railway/Fly.io/VPS with managed PostgreSQL. Set CORS_ORIGIN to your app/web origin. Mobile: Expo EAS build. Never expose database or chain provider keys in EXPO_PUBLIC variables.

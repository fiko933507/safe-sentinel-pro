# Safe Sentinel Pro production stack

## Quick start
1. Provision PostgreSQL.
2. Configure backend environment variables from backend/.env.production.example.
3. For local development: cd backend && npm install && npx prisma generate && npm start.
4. For production deployment: run npm run prisma:migrate:deploy before npm start. Never use prisma db push or reset against production.
5. Deploy behind HTTPS.
6. Set EXPO_PUBLIC_BACKEND_URL in the EAS production environment and build with EAS.

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

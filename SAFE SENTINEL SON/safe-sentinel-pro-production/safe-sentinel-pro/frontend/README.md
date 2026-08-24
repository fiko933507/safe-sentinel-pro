# Frontend integration
Set EXPO_PUBLIC_API_URL to the deployed backend HTTPS URL. Store only JWT/session tokens in expo-secure-store. Do not ship backend provider secrets in the mobile app.

Required changes to App.js:
1. Replace hard-coded BACKEND_URL with process.env.EXPO_PUBLIC_API_URL.
2. Remove API_SECRET_KEY from the client.
3. Add Authorization: Bearer <JWT> to protected requests.
4. Replace local fake login/register with /api/auth/login and /api/auth/register.
5. Replace VIP success shortcut with /api/vip/verify response.

import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

const VIP_ADDRESS = 'TY8UwgeCoEog8Lz6BseBXfaBRoZMG28QNn';

const MONTHLY_TRX = 300;
const YEARLY_TRX = 3200;

const encoder = new TextEncoder();

const base58Alphabet =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const rateLimits = new Map();

/* =========================================================
   RESPONSE / SECURITY HELPERS
========================================================= */

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization',
      'Access-Control-Allow-Methods':
        'GET, POST, OPTIONS',
      'Cache-Control': 'no-store'
    }
  });
}

function getCorsOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';

  if (!env.CORS_ORIGIN) {
    return '*';
  }

  const allowedOrigins = env.CORS_ORIGIN
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] || '*';
}

function cleanError(message) {
  return String(message || 'Unknown error')
    .replace(/[<>]/g, '')
    .slice(0, 300);
}

function rateLimit(request) {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    'unknown';

  const now = Date.now();
  const windowMs = 60 * 1000;

  const current = rateLimits.get(ip);

  if (!current || now > current.resetAt) {
    rateLimits.set(ip, {
      count: 1,
      resetAt: now + windowMs
    });

    return true;
  }

  current.count += 1;

  if (current.count > 120) {
    return false;
  }

  return true;
}

/* =========================================================
   BASE58 / TRON ADDRESS
========================================================= */

function base58Decode(input) {
  let bytes = [0];

  for (const char of input) {
    const value = base58Alphabet.indexOf(char);

    if (value < 0) {
      throw new Error('Invalid Base58 character');
    }

    let carry = value;

    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const char of input) {
    if (char !== '1') break;
    bytes.push(0);
  }

  return new Uint8Array(bytes.reverse());
}

async function sha256(data) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    data
  );

  return new Uint8Array(hash);
}

async function doubleSha256(data) {
  const first = await sha256(data);
  return sha256(first);
}

async function tronBase58ToHex(address) {
  if (
    typeof address !== 'string' ||
    address.length < 30 ||
    address.length > 40
  ) {
    throw new Error('Invalid TRON address');
  }

  const decoded = base58Decode(address);

  if (decoded.length !== 25) {
    throw new Error('Invalid TRON address length');
  }

  const payload = decoded.slice(0, 21);
  const checksum = decoded.slice(21);

  const expectedHash = await doubleSha256(payload);
  const expectedChecksum = expectedHash.slice(0, 4);

  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expectedChecksum[i]) {
      throw new Error('Invalid TRON address checksum');
    }
  }

  return Array.from(payload)
    .map((byte) =>
      byte.toString(16).padStart(2, '0')
    )
    .join('')
    .toLowerCase();
}

function normalizeTronHex(value) {
  if (!value) return null;

  let result = String(value)
    .trim()
    .replace(/^0x/i, '')
    .toLowerCase();

  if (result.length === 40) {
    result = `41${result}`;
  }

  if (!/^[0-9a-f]{42}$/.test(result)) {
    return null;
  }

  return result;
}

/* =========================================================
   SUPABASE REST
========================================================= */

function supabaseHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization:
      `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

async function supabaseRequest(
  env,
  path,
  options = {}
) {
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      'Supabase environment variables are missing'
    );
  }

  const url =
    `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      ...supabaseHeaders(env),
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      `Supabase error ${response.status}`;

    throw new Error(cleanError(message));
  }

  return data;
}

/* =========================================================
   JWT
========================================================= */

function getJwtSecret(env) {
  if (
    !env.JWT_SECRET ||
    env.JWT_SECRET.length < 32
  ) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters'
    );
  }

  return encoder.encode(env.JWT_SECRET);
}

async function createToken(user, env) {
  return new SignJWT({
    email: user.email,
    name: user.name
  })
    .setProtectedHeader({
      alg: 'HS256',
      typ: 'JWT'
    })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getJwtSecret(env));
}

async function getAuthenticatedUser(
  request,
  env
) {
  const authorization =
    request.headers.get('Authorization') || '';

  if (!authorization.startsWith('Bearer ')) {
    throw new Error('Unauthorized');
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    throw new Error('Unauthorized');
  }

  const result = await jwtVerify(
    token,
    getJwtSecret(env)
  );

  if (!result.payload.sub) {
    throw new Error('Invalid token');
  }

  return {
    id: result.payload.sub,
    email: result.payload.email || ''
  };
}

/* =========================================================
   DATABASE HELPERS
========================================================= */

async function getUserByEmail(env, email) {
  const users = await supabaseRequest(
    env,
    `app_users?email=eq.${encodeURIComponent(email)}&select=*`
  );

  return Array.isArray(users) && users.length
    ? users[0]
    : null;
}

async function getUserById(env, id) {
  const users = await supabaseRequest(
    env,
    `app_users?id=eq.${encodeURIComponent(id)}&select=*`
  );

  return Array.isArray(users) && users.length
    ? users[0]
    : null;
}

async function getSubscription(env, userId) {
  const subscriptions = await supabaseRequest(
    env,
    `subscriptions?user_id=eq.${encodeURIComponent(userId)}&select=*`
  );

  return Array.isArray(subscriptions) &&
    subscriptions.length
    ? subscriptions[0]
    : null;
}

async function getUserStatus(env, userId) {
  const subscription =
    await getSubscription(env, userId);

  if (!subscription) {
    return {
      status: 'free',
      expiresAt: null,
      subscription: null
    };
  }

  const expiresAt = new Date(
    subscription.expires_at
  );

  if (
    subscription.status === 'ACTIVE' &&
    expiresAt > new Date()
  ) {
    return {
      status: 'vip',
      expiresAt:
        subscription.expires_at,
      subscription
    };
  }

  return {
    status: 'free',
    expiresAt:
      subscription.expires_at || null,
    subscription
  };
}

/* =========================================================
   REGISTER
========================================================= */

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(80),

  email: z
    .string()
    .trim()
    .email()
    .max(254),

  password: z
    .string()
    .min(10)
    .max(128)
});

async function handleRegister(
  request,
  env,
  origin
) {
  const body = await request.json();

  const parsed =
    registerSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      {
        error:
          'Geçersiz kayıt bilgileri'
      },
      400,
      origin
    );
  }

  const email =
    parsed.data.email.toLowerCase();

  const existing =
    await getUserByEmail(env, email);

  if (existing) {
    return json(
      {
        error:
          'Bu e-posta zaten kayıtlı'
      },
      409,
      origin
    );
  }

  const passwordHash =
    await bcrypt.hash(
      parsed.data.password,
      12
    );

  const user = {
    id: crypto.randomUUID(),
    name: parsed.data.name,
    email,
    password_hash: passwordHash
  };

  const created = await supabaseRequest(
    env,
    'app_users',
    {
      method: 'POST',
      body: JSON.stringify(user)
    }
  );

  const dbUser =
    Array.isArray(created)
      ? created[0]
      : user;

  const token =
    await createToken(
      {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email
      },
      env
    );

  return json(
    {
      token,
      user: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        status: 'free',
        expiresAt: null
      }
    },
    201,
    origin
  );
}

/* =========================================================
   LOGIN
========================================================= */

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(128)
});

async function handleLogin(
  request,
  env,
  origin
) {
  const body = await request.json();

  const parsed =
    loginSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      {
        error:
          'E-posta veya şifre geçersiz'
      },
      400,
      origin
    );
  }

  const email =
    parsed.data.email.toLowerCase();

  const user =
    await getUserByEmail(
      env,
      email
    );

  if (!user) {
    return json(
      {
        error:
          'E-posta veya şifre hatalı'
      },
      401,
      origin
    );
  }

  const valid =
    await bcrypt.compare(
      parsed.data.password,
      user.password_hash
    );

  if (!valid) {
    return json(
      {
        error:
          'E-posta veya şifre hatalı'
      },
      401,
      origin
    );
  }

  const token =
    await createToken(
      {
        id: user.id,
        name: user.name,
        email: user.email
      },
      env
    );

  const status =
    await getUserStatus(
      env,
      user.id
    );

  return json(
    {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: status.status,
        expiresAt: status.expiresAt
      }
    },
    200,
    origin
  );
}

/* =========================================================
   CURRENT USER
========================================================= */

async function handleMe(
  request,
  env,
  origin
) {
  const authUser =
    await getAuthenticatedUser(
      request,
      env
    );

  const user =
    await getUserById(
      env,
      authUser.id
    );

  if (!user) {
    return json(
      {
        error: 'Kullanıcı bulunamadı'
      },
      404,
      origin
    );
  }

  const status =
    await getUserStatus(
      env,
      user.id
    );

  return json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: status.status,
        expiresAt: status.expiresAt
      }
    },
    200,
    origin
  );
}

/* =========================================================
   TRON PAYMENT VERIFICATION
========================================================= */

const vipSchema = z.object({
  txid: z
    .string()
    .trim()
    .regex(/^[a-fA-F0-9]{64}$/),

  plan: z.enum([
    'monthly',
    'yearly'
  ])
});

async function handleVipVerify(
  request,
  env,
  origin
) {
  const authUser =
    await getAuthenticatedUser(
      request,
      env
    );

  const body = await request.json();

  const parsed =
    vipSchema.safeParse(body);

  if (!parsed.success) {
    return json(
      {
        error:
          'Geçersiz TRX işlem hash bilgisi'
      },
      400,
      origin
    );
  }

  const txid =
    parsed.data.txid.toLowerCase();

  const plan =
    parsed.data.plan;

  const expectedAmount =
    plan === 'monthly'
      ? MONTHLY_TRX
      : YEARLY_TRX;

  const existingPayment =
    await supabaseRequest(
      env,
      `payments?txid=eq.${encodeURIComponent(txid)}&select=*`
    );

  if (
    Array.isArray(existingPayment) &&
    existingPayment.length
  ) {
    return json(
      {
        error:
          'Bu TXID daha önce kullanılmış'
      },
      409,
      origin
    );
  }

  const tronUrl =
    `https://api.trongrid.io/v1/transactions/${txid}`;

  const tronHeaders = {};

  if (env.TRONGRID_API_KEY) {
    tronHeaders[
      'TRON-PRO-API-KEY'
    ] =
      env.TRONGRID_API_KEY;
  }

  const tronResponse =
    await fetch(
      tronUrl,
      {
        headers: tronHeaders
      }
    );

  if (!tronResponse.ok) {
    return json(
      {
        error:
          'TRON ağına şu anda ulaşılamıyor'
      },
      503,
      origin
    );
  }

  const tronData =
    await tronResponse.json();

  const transaction =
    tronData?.data?.[0];

  if (!transaction) {
    return json(
      {
        error:
          'İşlem bulunamadı veya henüz indekslenmedi'
      },
      400,
      origin
    );
  }

  if (
    transaction.ret?.[0]
      ?.contractRet !== 'SUCCESS'
  ) {
    return json(
      {
        error:
          'TRON işlemi başarılı değil'
      },
      400,
      origin
    );
  }

  const contract =
    transaction.raw_data
      ?.contract?.[0];

  if (
    contract?.type !==
    'TransferContract'
  ) {
    return json(
      {
        error:
          'VIP ödeme işlemi standart TRX transferi değil'
      },
      400,
      origin
    );
  }

  const value =
    contract.parameter?.value;

  if (
    !value?.to_address ||
    value?.amount === undefined
  ) {
    return json(
      {
        error:
          'İşlem ödeme verileri bulunamadı'
      },
      400,
      origin
    );
  }

  const expectedAddressHex =
    await tronBase58ToHex(
      VIP_ADDRESS
    );

  const transactionAddressHex =
    normalizeTronHex(
      value.to_address
    );

  if (
    !transactionAddressHex ||
    transactionAddressHex !==
      expectedAddressHex
  ) {
    return json(
      {
        error:
          'Ödeme yanlış TRON adresine gönderilmiş'
      },
      400,
      origin
    );
  }

  const amountSun =
    Number(value.amount);

  const amountTrx =
    amountSun / 1_000_000;

  if (
    !Number.isFinite(amountTrx) ||
    amountTrx + 0.000001 <
      expectedAmount
  ) {
    return json(
      {
        error:
          `Yetersiz ödeme. ${expectedAmount} TRX gerekli.`
      },
      400,
      origin
    );
  }

  const now = new Date();

  const currentSubscription =
    await getSubscription(
      env,
      authUser.id
    );

  let baseDate = now;

  if (
    currentSubscription &&
    currentSubscription.status ===
      'ACTIVE' &&
    new Date(
      currentSubscription.expires_at
    ) > now
  ) {
    baseDate = new Date(
      currentSubscription.expires_at
    );
  }

  const expiresAt =
    new Date(baseDate);

  if (plan === 'monthly') {
    expiresAt.setDate(
      expiresAt.getDate() + 30
    );
  } else {
    expiresAt.setDate(
      expiresAt.getDate() + 365
    );
  }

  try {
    await supabaseRequest(
      env,
      'payments',
      {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          user_id: authUser.id,
          plan,
          expected_amount_trx:
            expectedAmount,
          txid,
          status: 'CONFIRMED'
        })
      }
    );

    if (currentSubscription) {
      await supabaseRequest(
        env,
        `subscriptions?user_id=eq.${encodeURIComponent(authUser.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            plan,
            status: 'ACTIVE',
            txid,
            expires_at:
              expiresAt.toISOString()
          })
        }
      );
    } else {
      await supabaseRequest(
        env,
        'subscriptions',
        {
          method: 'POST',
          body: JSON.stringify({
            id: crypto.randomUUID(),
            user_id: authUser.id,
            plan,
            status: 'ACTIVE',
            txid,
            starts_at:
              now.toISOString(),
            expires_at:
              expiresAt.toISOString()
          })
        }
      );
    }
  } catch (error) {
    const message =
      cleanError(error.message);

    if (
      message.includes('duplicate') ||
      message.includes('unique')
    ) {
      return json(
        {
          error:
            'Bu ödeme daha önce işlenmiş'
        },
        409,
        origin
      );
    }

    throw error;
  }

  return json(
    {
      ok: true,
      status: 'vip',
      plan,
      amountPaid:
        amountTrx,
      expectedAmount,
      expiresAt:
        expiresAt.toISOString()
    },
    200,
    origin
  );
}

/* =========================================================
   PLACEHOLDER SECURITY ENDPOINTS
========================================================= */

async function handleWalletCheck(
  request,
  env,
  origin
) {
  await getAuthenticatedUser(
    request,
    env
  );

  const body =
    await request.json();

  const schema = z.object({
    network: z
      .string()
      .min(2)
      .max(30),

    address: z
      .string()
      .min(10)
      .max(200)
  });

  const parsed =
    schema.safeParse(body);

  if (!parsed.success) {
    return json(
      {
        error:
          'Geçersiz cüzdan bilgisi'
      },
      400,
      origin
    );
  }

  /*
    Burada frontend'in mevcut güvenlik
    modülleri korunur.

    Gerçek zincir adaptörleri ayrı ayrı
    eklendiğinde bu endpoint gerçek
    balance/transaction verilerini
    döndürebilir.

    Uydurma bakiye döndürülmez.
  */

  return json(
    {
      success: true,
      network:
        parsed.data.network,
      address:
        parsed.data.address,
      isScam: false,
      balance: null,
      transactions: [],
      note:
        'Chain adapter henüz yapılandırılmadı.'
    },
    200,
    origin
  );
}

/* =========================================================
   MAIN ROUTER
========================================================= */

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(request.url);

    const origin =
      getCorsOrigin(
        request,
        env
      );

    try {
      if (
        request.method ===
        'OPTIONS'
      ) {
        return new Response(
          null,
          {
            status: 204,
            headers: {
              'Access-Control-Allow-Origin':
                origin,

              'Access-Control-Allow-Headers':
                'Content-Type, Authorization',

              'Access-Control-Allow-Methods':
                'GET, POST, OPTIONS',

              'Access-Control-Max-Age':
                '86400'
            }
          }
        );
      }

      if (!rateLimit(request)) {
        return json(
          {
            error:
              'Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.'
          },
          429,
          origin
        );
      }

      const path =
        url.pathname;

      if (
        request.method === 'GET' &&
        path === '/health'
      ) {
        return json(
          {
            ok: true,
            service:
              'Safe Sentinel Pro API',
            timestamp:
              new Date().toISOString()
          },
          200,
          origin
        );
      }

      if (
        request.method === 'POST' &&
        path ===
          '/api/auth/register'
      ) {
        return handleRegister(
          request,
          env,
          origin
        );
      }

      if (
        request.method === 'POST' &&
        path ===
          '/api/auth/login'
      ) {
        return handleLogin(
          request,
          env,
          origin
        );
      }

      if (
        request.method === 'GET' &&
        path === '/api/me'
      ) {
        return handleMe(
          request,
          env,
          origin
        );
      }

      if (
        request.method === 'POST' &&
        path ===
          '/api/vip/verify'
      ) {
        return handleVipVerify(
          request,
          env,
          origin
        );
      }

      if (
        request.method === 'POST' &&
        path ===
          '/api/check-wallet'
      ) {
        return handleWalletCheck(
          request,
          env,
          origin
        );
      }

      if (
        request.method === 'POST' &&
        path ===
          '/api/monitor-vault-with-scam-pool'
      ) {
        await getAuthenticatedUser(
          request,
          env
        );

        return json(
          {
            notifications: []
          },
          200,
          origin
        );
      }

      if (
        request.method === 'GET' &&
        path ===
          '/api/live-gas-fees'
      ) {
        await getAuthenticatedUser(
          request,
          env
        );

        return json(
          {
            fees: {}
          },
          200,
          origin
        );
      }

      if (
        request.method === 'POST' &&
        path ===
          '/api/revoke-approval'
      ) {
        await getAuthenticatedUser(
          request,
          env
        );

        return json(
          {
            error:
              'Bu işlem kullanıcının cüzdanında imzalanmalıdır.'
          },
          501,
          origin
        );
      }

      return json(
        {
          error: 'Endpoint bulunamadı'
        },
        404,
        origin
      );
    } catch (error) {
      console.error(
        'Safe Sentinel API error:',
        error
      );

      if (
        error.message ===
        'Unauthorized' ||
        error.message ===
        'Invalid token'
      ) {
        return json(
          {
            error:
              'Oturum geçersiz veya süresi dolmuş'
          },
          401,
          origin
        );
      }

      return json(
        {
          error:
            'Sunucu işlemi tamamlayamadı',
          message:
            env.NODE_ENV ===
            'development'
              ? cleanError(
                  error.message
                )
              : undefined
        },
        500,
        origin
      );
    }
  }
};

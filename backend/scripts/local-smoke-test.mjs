const BASE_URL = String(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const TEST_NETWORK = String(process.env.TEST_NETWORK || '').trim().toLowerCase();
const TEST_WALLET_ADDRESS = String(process.env.TEST_WALLET_ADDRESS || '').trim();

const stamp = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `smoke-${stamp}@example.invalid`;
const password = `SmokeTest-${stamp}-Aa1!`;
const name = 'Safe Sentinel Smoke Test';

let token = null;
let created = false;
let failures = 0;

const log = (status, name, detail = '') => {
  console.log(`${status.padEnd(5)} ${name}${detail ? ` — ${detail}` : ''}`);
};

const request = async (path, options = {}) => {
  const headers = {
    accept: 'application/json',
    ...(options.body ? { 'content-type': 'application/json' } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers
  });

  let body = null;
  if (response.status !== 204) {
    const text = await response.text();
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
  }

  return { response, body };
};

const expect = (condition, name, detail = '') => {
  if (condition) {
    log('PASS', name, detail);
  } else {
    failures += 1;
    log('FAIL', name, detail);
  }
};

const authedPost = async (path, payload) => request(path, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: JSON.stringify(payload)
});

const runWalletEngine = async (name, path) => {
  const { response, body } = await authedPost(path, {
    network: TEST_NETWORK,
    address: TEST_WALLET_ADDRESS
  });
  expect(
    response.ok && body?.success === true,
    name,
    `HTTP ${response.status}${body?.error ? ` / ${body.error}` : ''}`
  );
};

try {
  console.log(`Safe Sentinel Pro local smoke test: ${BASE_URL}`);

  {
    const { response, body } = await request('/health');
    expect(response.status === 200 && body?.ok === true && body?.database === 'connected', 'Health + PostgreSQL', `HTTP ${response.status}`);
  }

  {
    const { response, body } = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password })
    });
    created = response.status === 201 && Boolean(body?.token);
    token = body?.token || null;
    expect(created, 'Register', `HTTP ${response.status}${body?.error ? ` / ${body.error}` : ''}`);
  }

  if (token) {
    const { response, body } = await request('/api/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(response.ok && body?.user?.email === email, 'Authenticated /api/me', `HTTP ${response.status}`);
  }

  {
    const { response } = await request('/api/me', {
      headers: { Authorization: 'Bearer definitely-invalid-token' }
    });
    expect(response.status === 401, 'Invalid JWT rejected', `HTTP ${response.status}`);
  }

  {
    const { response, body } = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (response.ok && body?.token) token = body.token;
    expect(response.ok && Boolean(body?.token), 'Login', `HTTP ${response.status}${body?.error ? ` / ${body.error}` : ''}`);
  }

  if (token) {
    const { response } = await authedPost('/api/check-wallet', {
      network: 'ethereum',
      address: 'not-a-wallet'
    });
    expect([400, 404].includes(response.status), 'Invalid wallet rejected', `HTTP ${response.status}`);
  }

  if (token && TEST_NETWORK && TEST_WALLET_ADDRESS) {
    await runWalletEngine('Wallet/Risk scan', '/api/check-wallet');
    await runWalletEngine('Behavioral Fingerprint', '/api/wallet-behavioral-fingerprint');
    await runWalletEngine('Scam DNA', '/api/scam-dna');
    await runWalletEngine('Wallet Security Graph', '/api/wallet-security-graph');
    await runWalletEngine('Early Warning', '/api/early-warning');
  } else {
    log('SKIP', 'Live wallet engines', 'TEST_NETWORK ve TEST_WALLET_ADDRESS verilmedi');
  }
} catch (error) {
  failures += 1;
  log('FAIL', 'Unexpected smoke-test exception', error?.message || String(error));
} finally {
  if (created && token) {
    try {
      const { response } = await request('/api/me', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ confirmation: 'DELETE' })
      });
      expect(response.status === 204, 'Temporary smoke account cleanup', `HTTP ${response.status}`);
    } catch (error) {
      failures += 1;
      log('FAIL', 'Temporary smoke account cleanup', error?.message || String(error));
    }
  }
}

if (failures > 0) {
  console.error(`\nSMOKE TEST FAILED: ${failures} kontrol başarısız.`);
  process.exit(1);
}

console.log('\nSMOKE TEST PASSED');

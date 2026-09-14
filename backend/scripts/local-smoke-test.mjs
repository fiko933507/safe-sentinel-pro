const BASE_URL = String(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

let failures = 0;

const log = (status, name, detail = '') => {
  console.log(`${status.padEnd(5)} ${name}${detail ? ` — ${detail}` : ''}`);
};

const request = async (path, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const headers = {
      accept: 'application/json',
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    };

    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal
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
  } finally {
    clearTimeout(timeout);
  }
};

const expect = (condition, name, detail = '') => {
  if (condition) {
    log('PASS', name, detail);
  } else {
    failures += 1;
    log('FAIL', name, detail);
  }
};

try {
  console.log(`Safe Sentinel Pro private-beta smoke test: ${BASE_URL}`);

  {
    const { response, body } = await request('/health');
    expect(
      response.status === 200 && body?.ok === true && body?.database === 'connected',
      'Health + PostgreSQL',
      `HTTP ${response.status}`
    );
  }

  {
    const { response } = await request('/api/me');
    expect(response.status === 401, 'Protected /api/me rejects anonymous access', `HTTP ${response.status}`);
  }

  {
    const { response } = await request('/api/me', {
      headers: { Authorization: 'Bearer definitely-invalid-token' }
    });
    expect(response.status === 401, 'Invalid JWT rejected', `HTTP ${response.status}`);
  }

  {
    const { response } = await request('/api/check-wallet', {
      method: 'POST',
      body: JSON.stringify({ network: 'ethereum', address: '0x0000000000000000000000000000000000000000' })
    });
    expect(response.status === 401, 'Wallet scan rejects anonymous access', `HTTP ${response.status}`);
  }
} catch (error) {
  failures += 1;
  log(
    'FAIL',
    'Unexpected smoke-test exception',
    error?.name === 'AbortError' ? 'request timed out after 30s' : (error?.message || String(error))
  );
}

if (failures > 0) {
  console.error(`\nSMOKE TEST FAILED: ${failures} kontrol başarısız.`);
  process.exit(1);
}

console.log('\nSMOKE TEST PASSED');

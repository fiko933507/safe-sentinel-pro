import test from 'node:test';
import assert from 'node:assert/strict';

import { registerSecurityV2 } from '../src/security-v2.js';

const routes = new Map();

const app = {
  get(path, ...handlers) {
    routes.set(`GET ${path}`, handlers.at(-1));
  },

  post(path, ...handlers) {
    routes.set(`POST ${path}`, handlers.at(-1));
  },

  put(path, ...handlers) {
    routes.set(`PUT ${path}`, handlers.at(-1));
  }
};

const auth = (_req, _res, next) => next?.();

const adapters = {
  get() {
    throw new Error(
      'Adapter must not be reached during validation failure test'
    );
  }
};

const db = new Proxy(
  {},
  {
    get() {
      throw new Error(
        'Database must not be reached during validation failure test'
      );
    }
  }
);

const lookupScamIntelligence = async () => {
  throw new Error(
    'Scam intelligence must not be reached during validation failure test'
  );
};

const lookupTransactionScamIntelligence = async () => {
  throw new Error(
    'Transaction scam intelligence must not be reached during validation failure test'
  );
};

registerSecurityV2({
  app,
  auth,
  adapters,
  db,
  lookupScamIntelligence,
  lookupTransactionScamIntelligence
});

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    }
  };
}

const walletRoutes = [
  '/api/wallet-behavioral-fingerprint',
  '/api/scam-dna',
  '/api/wallet-security-graph',
  '/api/early-warning'
];

for (const path of walletRoutes) {
  test(`${path} rejects invalid wallet request before adapter access`, async () => {
    const handler = routes.get(`POST ${path}`);

    assert.equal(
      typeof handler,
      'function',
      `Route handler not registered: ${path}`
    );

    const req = {
      body: {
        network: 'e',
        address: 'bad'
      },
      user: {
        id: 'isolated-test-user'
      }
    };

    const res = createResponse();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.success, false);
    assert.equal(res.body?.error, 'Invalid wallet request');
  });
}

test('/api/guardian/evaluate rejects invalid request before DB or adapter access', async () => {
  const path = '/api/guardian/evaluate';
  const handler = routes.get(`POST ${path}`);

  assert.equal(typeof handler, 'function');

  const req = {
    body: {
      network: 'e',
      address: 'bad',
      amountUsd: -1
    },
    user: {
      id: 'isolated-test-user'
    }
  };

  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.success, false);
  assert.equal(
    res.body?.error,
    'Invalid Guardian evaluation request'
  );
});

test('/api/analyze-contract-v2 rejects invalid EVM contract request before RPC access', async () => {
  const path = '/api/analyze-contract-v2';
  const handler = routes.get(`POST ${path}`);

  assert.equal(typeof handler, 'function');

  const req = {
    body: {
      network: 'ethereum',
      address: 'not-an-evm-address'
    },
    user: {
      id: 'isolated-test-user'
    }
  };

  const res = createResponse();

  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.success, false);
  assert.equal(
    res.body?.error,
    'Invalid EVM contract request'
  );
});
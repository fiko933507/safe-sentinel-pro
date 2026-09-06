const DEFAULT_API =
  process.env.PI_API ||
  'https://api.mainnet.minepi.com';

const requestJson = async ({
  api,
  path
}) => {
  const response = await fetch(
    `${api}${path}`
  );

  if (!response.ok) {
    const error = new Error(
      `Pi API HTTP ${response.status}`
    );

    error.status = response.status;
    throw error;
  }

  return response.json();
};

const normalizeAddress = address => {
  const value = String(address || '').trim();

  if (!value) {
    return null;
  }

  if (!/^G[A-Z2-7]{55}$/.test(value)) {
    return null;
  }

  return value;
};

const normalizeOperation = operation => {
  return {
    id: operation?.id || null,
    type: operation?.type || null,
    createdAt: operation?.created_at || null,
    transactionHash:
      operation?.transaction_hash || null,
    sourceAccount:
      operation?.source_account || null,
    from:
      operation?.from || null,
    to:
      operation?.to || null,
    amount:
      operation?.amount != null
        ? String(operation.amount)
        : null,
    assetType:
      operation?.asset_type || null,
    assetCode:
      operation?.asset_code || null
  };
};

export const createPiAdapter = ({
  api = DEFAULT_API
} = {}) => {
  return {
    network: 'pi',

    supportedNetworks: ['pi'],

    async checkWallet({ network, address }) {
      const normalizedNetwork =
        String(network || '')
          .trim()
          .toLowerCase();

      if (normalizedNetwork !== 'pi') {
        return {
          found: false,
          network: normalizedNetwork,
          address,
          error: 'Pi network not supported'
        };
      }

      const normalizedAddress =
        normalizeAddress(address);

      if (!normalizedAddress) {
        return {
          found: false,
          network: 'pi',
          address,
          error: 'Invalid Pi address'
        };
      }

      try {
        const account =
          await requestJson({
            api,
            path:
              `/accounts/${encodeURIComponent(
                normalizedAddress
              )}`
          });

        const nativeBalance =
          Array.isArray(account?.balances)
            ? account.balances.find(
                balance =>
                  balance?.asset_type === 'native'
              )
            : null;

        const balance =
          nativeBalance?.balance != null
            ? Number(nativeBalance.balance)
            : 0;

        let operations = [];
        let latestLedger = null;

        try {
          const operationsResponse =
            await requestJson({
              api,
              path:
                `/accounts/${encodeURIComponent(
                  normalizedAddress
                )}/operations?limit=20&order=desc`
            });

          operations =
            Array.isArray(
              operationsResponse?._embedded?.records
            )
              ? operationsResponse._embedded.records
              : [];

          const links =
            operationsResponse?._links || {};

          if (
            links?.self?.href &&
            operations.length > 0
          ) {
            const latestOperation =
              operations[0];

            if (
              latestOperation?.ledger_attr
            ) {
              latestLedger =
                latestOperation.ledger_attr;
            }
          }
        } catch {
          operations = [];
        }

        const transactions =
          operations.map(
            normalizeOperation
          );

        return {
          success: true,
          found: true,

          network: 'pi',
          address: normalizedAddress,

          chainId: 'pi-mainnet',

          balance,
          balanceUnit: 'PI',

          tokens: [],

          transactions,

          latestBlock: latestLedger,

          account: {
            accountId:
              account?.account_id ||
              normalizedAddress,

            sequence:
              account?.sequence || null,

            nativeBalance:
              nativeBalance?.balance || '0'
          },

          isScam: false,

          available: true,

          status: 'mainnet_available',

          message:
            'Pi Mainnet hesap ve işlem verisi başarıyla alındı.'
        };
      } catch (error) {
        return {
          success: false,
          found: false,

          network: 'pi',
          address: normalizedAddress,

          chainId: 'pi-mainnet',

          balance: null,
          balanceUnit: 'PI',

          tokens: [],
          transactions: [],

          latestBlock: null,
          account: null,

          isScam: false,

          available: false,

          status: 'api_unavailable',

          error:
            error?.message ||
            'Pi Mainnet API unavailable'
        };
      }
    },

    async discoverTransfers({ network, address }) {
      const normalizedNetwork = String(network || '').trim().toLowerCase();

      if (normalizedNetwork !== 'pi') {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          error: 'Pi network not supported'
        };
      }

      const normalizedAddress = normalizeAddress(address);

      if (!normalizedAddress) {
        return {
          success: false,
          found: false,
          network: 'pi',
          address,
          error: 'Invalid Pi address'
        };
      }

      try {
        const walletData = await this.checkWallet({
          network: 'pi',
          address: normalizedAddress
        });

        if (!walletData?.success) {
          return {
            success: false,
            found: false,
            network: 'pi',
            address: normalizedAddress,
            chainId: 'pi-mainnet',
            latestBlock: walletData?.latestBlock || null,
            transactions: [],
            error: walletData?.error || 'Pi transfer discovery failed'
          };
        }

        const transactions = Array.isArray(walletData.transactions)
          ? walletData.transactions.map(operation => {
              const source =
                operation?.sourceAccount ||
                operation?.from ||
                null;

              const destination =
                operation?.to ||
                null;

              let direction = null;

              if (source === normalizedAddress) {
                direction = 'OUTGOING';
              } else if (destination === normalizedAddress) {
                direction = 'INCOMING';
              }

              const timestamp = operation?.createdAt
                ? new Date(operation.createdAt).getTime()
                : null;

              return {
                network: 'pi',
                whaleAddress: normalizedAddress,
                txid: operation?.transactionHash || null,
                blockNumber: operation?.ledger || null,
                timestamp,
                from: source,
                to: destination,
                direction,
                type: operation?.type || 'PI Operation',
                amount: operation?.amount ?? null,
                token: operation?.assetCode || 'PI',
                tokenName:
                  operation?.assetCode === 'PI' ? 'Pi' : null,
                tokenAddress: null,
                confirmed: true,
                operationId: operation?.id || null,
                assetType: operation?.assetType || 'native'
              };
            })
          : [];

        transactions.sort(
          (a, b) =>
            Number(b?.timestamp || 0) -
            Number(a?.timestamp || 0)
        );

        return {
          success: true,
          found: true,
          network: 'pi',
          address: normalizedAddress,
          chainId: 'pi-mainnet',
          latestBlock: walletData.latestBlock || null,
          transactionCount: transactions.length,
          transactions,
          realtime: false,
          message:
            'Pi Mainnet transfer verileri gerçek API üzerinden alındı. Bu tarama mevcut işlem penceresiyle sınırlıdır.'
        };
      } catch (error) {
        return {
          success: false,
          found: false,
          network: 'pi',
          address: normalizedAddress,
          chainId: 'pi-mainnet',
          latestBlock: null,
          transactionCount: 0,
          transactions: [],
          realtime: false,
          error:
            error?.message ||
            'Pi transfer discovery failed'
        };
      }
    }
  };
};

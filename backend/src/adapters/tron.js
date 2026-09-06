import { createHash } from 'crypto';
import bs58 from 'bs58';

const tronHexToBase58 = hex => {
  if (!hex) return null;

  const clean = String(hex)
    .trim()
    .replace(/^0x/i, '');

  if (!/^[0-9a-fA-F]{42}$/.test(clean)) {
    return null;
  }

  if (!clean.toLowerCase().startsWith('41')) {
    return null;
  }

  const payload = Buffer.from(clean, 'hex');

  const firstHash = createHash('sha256')
    .update(payload)
    .digest();

  const secondHash = createHash('sha256')
    .update(firstHash)
    .digest();

  return bs58.encode(
    Buffer.concat([
      payload,
      secondHash.subarray(0, 4)
    ])
  );
};

const formatTronTimestamp = timestamp => {
  if (!timestamp) {
    return {
      date: null,
      time: null
    };
  }

  const date = new Date(Number(timestamp));

  if (Number.isNaN(date.getTime())) {
    return {
      date: null,
      time: null
    };
  }

  return {
    date: date.toLocaleDateString('tr-TR'),
    time: date.toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  };
};

export const createTronAdapter = ({
  fetchImpl = fetch,
  tronRpc = process.env.TRON_RPC || 'https://api.trongrid.io',
  tronApiKey = process.env.TRONGRID_API_KEY
} = {}) => {
  const headers = tronApiKey
    ? { 'TRON-PRO-API-KEY': tronApiKey }
    : {};

  const request = async path => {
    const response = await fetchImpl(
      `${tronRpc}${path}`,
      { headers }
    );

    if (!response.ok) {
      const error = new Error(
        `TRON request failed with status ${response.status}`
      );

      error.status = response.status;
      throw error;
    }

    return response.json();
  };

  const assetMetadataCache = new Map();

  const getAssetMetadata = async assetId => {
    const id = String(assetId || '').trim();

    if (!id) {
      return null;
    }

    if (assetMetadataCache.has(id)) {
      return assetMetadataCache.get(id);
    }

    try {
      const assetJson = await request(
        `/v1/assets/${encodeURIComponent(id)}`
      );

      const metadata =
        assetJson?.data?.[0] || null;

      assetMetadataCache.set(id, metadata);

      return metadata;
    } catch (error) {
      console.error(
        '[TRON ASSET METADATA] lookup error:',
        id,
        error?.message || error
      );

      assetMetadataCache.set(id, null);

      return null;
    }
  };

  return {
    network: 'tron',

    async checkWallet({ address }) {
      const encodedAddress =
        encodeURIComponent(address);

      const accountJson = await request(
        `/v1/accounts/${encodedAddress}`
      );

      const account =
        accountJson?.data?.[0];

      if (!account) {
        return {
          found: false,
          network: 'tron',
          address
        };
      }

      const balance =
        Number(account.balance || 0) / 1000000;

      let transactions = [];

      try {
        const txJson = await request(
          `/v1/accounts/${encodedAddress}/transactions?limit=20&only_confirmed=true`
        );

        transactions =
          (txJson?.data || []).map(tx => {
            const contract =
              tx.raw_data?.contract?.[0];

            const value =
              contract?.parameter?.value || {};

            const timestamp =
              tx.block_timestamp ||
              tx.raw_data?.timestamp ||
              null;

            const formattedTime =
              formatTronTimestamp(timestamp);

            const from =
              tronHexToBase58(value.owner_address);

            const to =
              tronHexToBase58(value.to_address);

            const isTrx =
              contract?.type === 'TransferContract';

            return {
              date: formattedTime.date,
              time: formattedTime.time,
              from: from || null,
              to: to || null,
              type: isTrx
                ? 'TRX Transfer'
                : contract?.type || 'Unknown',
              txid: tx.txID || null,
              rawAmount:
                value.amount !== undefined &&
                value.amount !== null
                  ? Number(value.amount)
                  : null,
              amount: isTrx
                ? Number(value.amount || 0) / 1000000
                : null,
              token: isTrx
                ? 'TRX'
                : value.asset_name || null,
              assetId:
                contract?.type === 'TransferAssetContract'
                  ? String(value.asset_name || '')
                  : null,
              blockNumber:
                tx.blockNumber || null,
              direction:
                from &&
                to &&
                String(address).toLowerCase() === String(from).toLowerCase()
                  ? 'OUTGOING'
                  : (
                      from &&
                      to &&
                      String(address).toLowerCase() === String(to).toLowerCase()
                        ? 'INCOMING'
                        : null
                    ),
              confirmed:
                tx.ret?.[0]?.contractRet === 'SUCCESS',
              contractType:
                contract?.type || null
            };
          });
      } catch (error) {
        console.error(
          'TRON transaction request error:',
          error
        );
      }

      for (const tx of transactions) {
        if (
          tx.contractType !== 'TransferAssetContract' ||
          !tx.assetId
        ) {
          continue;
        }

        const metadata =
          await getAssetMetadata(tx.assetId);

        if (!metadata) {
          continue;
        }

        const precision =
          Number(metadata.precision);

        tx.token =
          metadata.abbr ||
          metadata.name ||
          tx.token ||
          null;

        tx.tokenName =
          metadata.name ||
          null;

        tx.tokenPrecision =
          Number.isInteger(precision) &&
          precision >= 0 &&
          precision <= 36
            ? precision
            : null;

        if (tx.tokenPrecision !== null) {
          tx.amount =
            Number(tx.rawAmount || 0) /
            (10 ** tx.tokenPrecision);
        }
      }

      try {
        const trc20Json = await request(
          `/v1/accounts/${encodedAddress}/transactions/trc20?limit=20&only_confirmed=true`
        );

        const trc20Transactions =
          (trc20Json?.data || []).map(tx => {
            const formattedTime =
              formatTronTimestamp(
                tx.block_timestamp || null
              );

            const decimals = Number(
              tx.token_info?.decimals ?? 6
            );

            const divisor = 10 ** decimals;

            const rawValue =
              Number(tx.value || 0);

            const amount =
              Number.isFinite(
                rawValue / divisor
              )
                ? rawValue / divisor
                : 0;

            return {
              date: formattedTime.date,
              time: formattedTime.time,
              from: tx.from || null,
              to: tx.to || null,
              type: 'TRC20 Transfer',
              txid:
                tx.transaction_id || null,
              amount,
              token:
                tx.token_info?.symbol ||
                tx.token_info?.name ||
                'TRC20',
              tokenAddress:
                tx.token_info?.address ||
                tx.contract_address ||
                null,
              confirmed: true,
              contractType:
                'TriggerSmartContract'
            };
          });

        transactions = [
          ...transactions,
          ...trc20Transactions
        ];
      } catch (error) {
        console.error(
          'TRC20 transaction request error:',
          error
        );
      }

      return {
        found: true,
        network: 'tron',
        address,
        balance,
        balanceUnit: 'TRX',
        transactions,
        account: {
          createdAt:
            account.create_time || null,
          latestOperationAt:
            account.latest_opration_time || null,
          trc20:
            account.trc20 || [],
          permissions:
            account.active_permission || []
        },
        rawAccount: account
      };
    },

    async discoverTransfers({ network, address }) {
      const normalizedNetwork =
        String(network || '').trim().toLowerCase();

      if (normalizedNetwork !== 'tron') {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          error: 'TRON network is required'
        };
      }

      const normalizedAddress =
        String(address || '').trim();

      if (!normalizedAddress) {
        return {
          success: false,
          found: false,
          network: 'tron',
          address,
          error: 'Invalid TRON wallet address'
        };
      }

      try {
        const result = await this.checkWallet({
          address: normalizedAddress
        });

        if (!result?.found) {
          return {
            success: true,
            found: false,
            network: 'tron',
            address: normalizedAddress,
            transactions: []
          };
        }

        const transactions =
          Array.isArray(result.transactions)
            ? result.transactions
                .map(tx => {
                  const date = String(tx?.date || '');
                  const time = String(tx?.time || '');

                  let timestamp = null;

                  if (date && time) {
                    const parsed = new Date(
                      date + ' ' + time
                    );

                    if (!Number.isNaN(parsed.getTime())) {
                      timestamp = parsed.getTime();
                    }
                  }

                  return {
                    network: 'tron',
                    whaleAddress: normalizedAddress,
                    txid: tx?.txid || null,
                    blockNumber: tx?.blockNumber || null,
                    timestamp,
                    from: tx?.from || null,
                    to: tx?.to || null,
                    direction: tx?.direction || null,
                    type: tx?.type || null,
                    amount: tx?.amount ?? null,
                    token: tx?.token || null,
                    tokenName: tx?.tokenName || null,
                    tokenAddress: tx?.tokenAddress || null,
                    confirmed: Boolean(tx?.confirmed)
                  };
                })
                .filter(tx => tx.txid)
            : [];

        transactions.sort(
          (a, b) =>
            Number(b.timestamp || 0) -
            Number(a.timestamp || 0)
        );

        const latestTimestamp =
          transactions.length > 0
            ? transactions[0].timestamp
            : null;

        return {
          success: true,
          found: true,
          network: 'tron',
          address: normalizedAddress,
          latestBlock:
            transactions.find(
              tx => tx.blockNumber
            )?.blockNumber || null,
          transactions,
          transactionCount: transactions.length,
          latestTimestamp
        };
      } catch (error) {
        return {
          success: false,
          found: false,
          network: 'tron',
          address: normalizedAddress,
          transactions: [],
          error:
            error?.message ||
            'TRON transfer discovery failed'
        };
      }
    }
  };
};

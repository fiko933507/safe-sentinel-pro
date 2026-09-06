import { ethers } from 'ethers';

const DEFAULT_CONFIG = {
  api:
    process.env.BITCOIN_API ||
    'https://mempool.space/api'
};

const normalizeAddress = address => {
  const value = String(address || '').trim();

  if (!value) {
    return null;
  }

  /*
   * Bitcoin address validation is intentionally kept
   * conservative here. Detailed validation belongs in
   * the Bitcoin adapter implementation.
   */
  if (
    /^(bc1|[13])[a-zA-Z0-9]{20,90}$/.test(value)
  ) {
    return value;
  }

  return null;
};

const satoshiToBtc = value => {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return 0;
  }

  return n / 100000000;
};

const requestJson = async url => {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Bitcoin API HTTP ${response.status}`
    );
  }

  return response.json();
};

export const createBitcoinAdapter = ({
  config = DEFAULT_CONFIG
} = {}) => {

  return {
    network: 'bitcoin',

    supportedNetworks: ['bitcoin'],

    async checkWallet({ network, address }) {
      const normalizedNetwork =
        String(network || '')
          .trim()
          .toLowerCase();

      if (normalizedNetwork !== 'bitcoin') {
        return {
          found: false,
          network: normalizedNetwork,
          address,
          error: 'Bitcoin network not supported'
        };
      }

      const normalizedAddress =
        normalizeAddress(address);

      if (!normalizedAddress) {
        return {
          found: false,
          network: normalizedNetwork,
          address,
          error: 'Invalid Bitcoin address'
        };
      }

      const data =
        await requestJson(
          `${config.api}/address/${normalizedAddress}`
        );

      const chainStats =
        data.chain_stats || {};

      const mempoolStats =
        data.mempool_stats || {};

      const confirmedBalance =
        Number(chainStats.funded_txo_sum || 0) -
        Number(chainStats.spent_txo_sum || 0);

      const mempoolBalance =
        Number(mempoolStats.funded_txo_sum || 0) -
        Number(mempoolStats.spent_txo_sum || 0);

      const totalBalance =
        confirmedBalance + mempoolBalance;

      const transactions =
        Array.isArray(data.txids)
          ? data.txids
          : [];

      return {
        success: true,
        found: true,

        network: 'bitcoin',
        address: normalizedAddress,

        chainId: 'bitcoin-mainnet',

        balance: satoshiToBtc(
          confirmedBalance
        ),

        balanceUnit: 'BTC',

        account: {
          confirmedBalanceSats:
            String(confirmedBalance),

          mempoolBalanceSats:
            String(mempoolBalance),

          totalBalanceSats:
            String(totalBalance),

          transactionCount:
            transactions.length
        },

        tokens: [],

        transactions,

        latestBlock: null,

        isScam: false
      };
    },

    async discoverTransfers({ network, address }) {
      const normalizedNetwork =
        String(network || '').trim().toLowerCase();

      if (normalizedNetwork !== 'bitcoin') {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          transactions: [],
          error: 'Bitcoin network is required'
        };
      }

      const normalizedAddress =
        normalizeAddress(address);

      if (!normalizedAddress) {
        return {
          success: false,
          found: false,
          network: 'bitcoin',
          address,
          transactions: [],
          error: 'Invalid Bitcoin address'
        };
      }

      try {
        const txs = await requestJson(
          `${config.api}/address/${normalizedAddress}/txs`
        );

        const transactions = Array.isArray(txs)
          ? txs.map(tx => {
              const inputs = Array.isArray(tx?.vin)
                ? tx.vin
                : [];

              const outputs = Array.isArray(tx?.vout)
                ? tx.vout
                : [];

              const inputValue = inputs.reduce(
                (sum, input) =>
                  sum + Number(input?.prevout?.value || 0),
                0
              );

              const outputValue = outputs.reduce(
                (sum, output) =>
                  sum + Number(output?.value || 0),
                0
              );

              const walletInputValue = inputs.reduce(
                (sum, input) => {
                  const addresses =
                    input?.prevout?.scriptpubkey_address
                      ? [input.prevout.scriptpubkey_address]
                      : [];

                  return addresses.includes(normalizedAddress)
                    ? sum + Number(input?.prevout?.value || 0)
                    : sum;
                },
                0
              );

              const walletOutputValue = outputs.reduce(
                (sum, output) => {
                  const outputAddress =
                    output?.scriptpubkey_address || null;

                  return outputAddress === normalizedAddress
                    ? sum + Number(output?.value || 0)
                    : sum;
                },
                0
              );

              const fee = Number(tx?.fee || 0);

              let direction = 'INTERNAL';
              let amountSats = walletOutputValue;

              if (walletInputValue > 0) {
                direction = 'OUTGOING';
                amountSats =
                  Math.max(
                    0,
                    walletInputValue -
                      Math.min(fee, walletInputValue)
                  );
              } else if (walletOutputValue > 0) {
                direction = 'INCOMING';
                amountSats = walletOutputValue;
              }

              const timestamp =
                tx?.status?.block_time
                  ? Number(tx.status.block_time) * 1000
                  : null;

              return {
                network: 'bitcoin',
                whaleAddress: normalizedAddress,

                txid: tx?.txid || null,

                blockNumber:
                  tx?.status?.block_height ?? null,

                timestamp,

                from:
                  inputs
                    .map(input =>
                      input?.prevout?.scriptpubkey_address
                    )
                    .find(Boolean) || null,

                to:
                  outputs
                    .map(output =>
                      output?.scriptpubkey_address
                    )
                    .find(Boolean) || null,

                direction,

                type: 'BTC Transfer',

                amount:
                  satoshiToBtc(amountSats),

                token: 'BTC',

                tokenName: 'Bitcoin',

                tokenAddress: null,

                confirmed:
                  Boolean(tx?.status?.confirmed),

                feeBTC:
                  satoshiToBtc(fee),

                inputValueBTC:
                  satoshiToBtc(inputValue),

                outputValueBTC:
                  satoshiToBtc(outputValue)
              };
            })
            .filter(tx => tx.txid)
          : [];

        transactions.sort(
          (a, b) =>
            Number(b.timestamp || 0) -
            Number(a.timestamp || 0)
        );

        return {
          success: true,
          found: true,
          network: 'bitcoin',
          address: normalizedAddress,
          chainId: 'bitcoin-mainnet',
          latestBlock:
            transactions.find(tx =>
              tx.blockNumber !== null
            )?.blockNumber || null,
          transactions,
          transactionCount: transactions.length,
          latestTimestamp:
            transactions.length > 0
              ? transactions[0].timestamp
              : null
        };
      } catch (error) {
        return {
          success: false,
          found: false,
          network: 'bitcoin',
          address: normalizedAddress,
          transactions: [],
          error:
            error?.message ||
            'Bitcoin transfer discovery failed'
        };
      }
    }
  };
};

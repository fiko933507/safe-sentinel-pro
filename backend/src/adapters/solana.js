import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';

export const createSolanaAdapter = ({
  rpc = process.env.SOLANA_RPC ||
    'https://api.mainnet-beta.solana.com'
} = {}) => {
  const connection = new Connection(
    rpc,
    'confirmed'
  );

  return {
    network: 'sol',
    supportedNetworks: ['sol'],

    async checkWallet({ address }) {
      let publicKey;

      try {
        publicKey = new PublicKey(address);
      } catch {
        return {
          found: false,
          network: 'sol',
          address,
          error: 'Invalid Solana wallet address'
        };
      }

      const lamports =
        await connection.getBalance(publicKey);

      const accountInfo =
        await connection.getAccountInfo(publicKey);

      let transactions = [];

      try {
        const signatures =
          await connection.getSignaturesForAddress(
            publicKey,
            { limit: 20 }
          );

        const signatureList =
          signatures
            .map(item => item?.signature)
            .filter(Boolean);

        const parsed = [];

        const maxRetries = 4;

        for (const signature of signatureList) {
          let transaction = null;

          for (
            let attempt = 0;
            attempt <= maxRetries;
            attempt++
          ) {
            try {
              transaction =
                await connection.getParsedTransaction(
                  signature,
                  {
                    maxSupportedTransactionVersion: 0
                  }
                );

              break;
            } catch (error) {
              const status =
                Number(error?.code || 0);

              const message =
                String(
                  error?.message || ''
                ).toLowerCase();

              const rateLimited =
                status === 429 ||
                message.includes('too many requests') ||
                message.includes('rate limit');

              if (
                !rateLimited ||
                attempt >= maxRetries
              ) {
                console.warn(
                  `[SOLANA RPC] Transaction ${signature} alınamadı:`,
                  error?.message || error
                );

                break;
              }

              const delay =
                Math.min(
                  8000,
                  1000 * Math.pow(2, attempt)
                );

              console.warn(
                `[SOLANA RPC] Rate limit. Retry ${attempt + 1}/${maxRetries} in ${delay}ms`
              );

              await new Promise(resolve =>
                setTimeout(resolve, delay)
              );
            }
          }

          parsed.push(transaction);

          /*
           * Public Solana RPC'nin rate-limit
           * baskısını azaltmak için işlemler
           * arasında kontrollü bekleme.
           */
          await new Promise(resolve =>
            setTimeout(resolve, 500)
          );
        }

        transactions = parsed
          .map((tx, index) => {
            if (!tx) return null;

            const meta = tx.meta;
            const message =
              tx.transaction.message;

            const accountKeys =
              message.accountKeys || [];

            const walletIndex =
              accountKeys.findIndex(key =>
                key.pubkey?.equals(publicKey)
              );

            const preBalance =
              walletIndex >= 0
                ? Number(meta?.preBalances?.[walletIndex] || 0)
                : 0;

            const postBalance =
              walletIndex >= 0
                ? Number(meta?.postBalances?.[walletIndex] || 0)
                : 0;

            const delta =
              postBalance - preBalance;

            const otherAccount =
              accountKeys.find(key =>
                !key.pubkey?.equals(publicKey)
              )?.pubkey?.toBase58() || null;

            return {
              date:
                signatures[index]?.blockTime
                  ? new Date(
                      signatures[index].blockTime * 1000
                    ).toLocaleDateString('tr-TR')
                  : null,

              time:
                signatures[index]?.blockTime
                  ? new Date(
                      signatures[index].blockTime * 1000
                    ).toLocaleTimeString('tr-TR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })
                  : null,

              from:
                delta < 0
                  ? publicKey.toBase58()
                  : otherAccount,

              to:
                delta > 0
                  ? publicKey.toBase58()
                  : otherAccount,

              amount:
                Math.abs(delta) / LAMPORTS_PER_SOL,

              token: 'SOL',

              type: 'SOL Transfer',

              txid:
                signatures[index]?.signature || null,

              confirmed:
                !meta?.err,

              contractType:
                'SolanaTransaction',

              success:
                !meta?.err
            };
          })
          .filter(Boolean);

      } catch (error) {
        console.error(
          'Solana transaction request error:',
          error
        );
      }

      return {
        found: true,
        network: 'sol',
        address: publicKey.toBase58(),
        balance: lamports / LAMPORTS_PER_SOL,
        balanceUnit: 'SOL',

        transactions,

        account: {
          lamports: lamports.toString(),
          executable:
            accountInfo?.executable || false,
          owner:
            accountInfo?.owner?.toBase58() || null
        }
      };
    },

    async discoverTransfers({ network, address }) {
      const normalizedNetwork =
        String(network || '').trim().toLowerCase();

      if (normalizedNetwork !== 'sol') {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          error: 'Solana network is required'
        };
      }

      const normalizedAddress =
        String(address || '').trim();

      if (!normalizedAddress) {
        return {
          success: false,
          found: false,
          network: 'sol',
          address,
          error: 'Invalid Solana wallet address'
        };
      }

      let publicKey;

      try {
        publicKey = new PublicKey(normalizedAddress);
      } catch {
        return {
          success: false,
          found: false,
          network: 'sol',
          address: normalizedAddress,
          transactions: [],
          error: 'Invalid Solana wallet address'
        };
      }

      try {
        const signatures =
          await connection.getSignaturesForAddress(
            publicKey,
            { limit: 5 }
          );

        const transactions = [];
        const maxRetries = 4;

        for (
          let index = 0;
          index < signatures.length;
          index++
        ) {
          const signature =
            signatures[index]?.signature;

          if (!signature) continue;

          let tx = null;

          for (
            let attempt = 0;
            attempt <= maxRetries;
            attempt++
          ) {
            try {
              tx =
                await connection.getParsedTransaction(
                  signature,
                  {
                    maxSupportedTransactionVersion: 0
                  }
                );

              break;
            } catch (error) {
              if (attempt === maxRetries) {
                console.error(
                  'Solana parsed transaction error:',
                  signature,
                  error?.message || error
                );
                break;
              }

              await new Promise(resolve =>
                setTimeout(
                  resolve,
                  Math.min(
                    1000 * (attempt + 1),
                    4000
                  )
                )
              );
            }
          }

          if (!tx?.meta) continue;

          const blockTime =
            tx.blockTime ??
            signatures[index]?.blockTime ??
            null;

          const timestamp =
            blockTime !== null &&
            Number.isFinite(Number(blockTime))
              ? Number(blockTime) * 1000
              : null;

          const accountKeys =
            tx.transaction?.message?.accountKeys || [];

          const walletIndex =
            accountKeys.findIndex(key => {
              try {
                return key?.pubkey?.equals(publicKey);
              } catch {
                return false;
              }
            });

          const preBalance =
            walletIndex >= 0
              ? Number(
                  tx.meta.preBalances?.[walletIndex] || 0
                )
              : 0;

          const postBalance =
            walletIndex >= 0
              ? Number(
                  tx.meta.postBalances?.[walletIndex] || 0
                )
              : 0;

          const nativeDelta =
            postBalance - preBalance;

          const otherAccount =
            accountKeys.find(key => {
              try {
                return !key?.pubkey?.equals(publicKey);
              } catch {
                return false;
              }
            })?.pubkey?.toBase58() || null;

          /*
           * Mevcut SOL davranisi korunuyor:
           * imza listesinde bulunan her parsed transaction
           * native transfer olarak normalize ediliyor.
           */
          if (nativeDelta !== 0) {
            transactions.push({
              network: 'sol',
              whaleAddress: normalizedAddress,
              txid: signature,
              blockNumber: null,
              timestamp,
              from:
                nativeDelta < 0
                  ? normalizedAddress
                  : otherAccount,
              to:
                nativeDelta > 0
                  ? normalizedAddress
                  : otherAccount,
              direction:
                nativeDelta < 0
                  ? 'OUTGOING'
                  : 'INCOMING',
              type: 'SOL Transfer',
              amount:
                Math.abs(nativeDelta) /
                LAMPORTS_PER_SOL,
              token: 'SOL',
              tokenName: null,
              tokenAddress: null,
              confirmed: !tx.meta.err
            });
          }

          /*
           * Gercek SPL / Token-2022 hareketleri:
           * preTokenBalances -> postTokenBalances farki.
           */
          const preTokenBalances =
            Array.isArray(tx.meta.preTokenBalances)
              ? tx.meta.preTokenBalances
              : [];

          const postTokenBalances =
            Array.isArray(tx.meta.postTokenBalances)
              ? tx.meta.postTokenBalances
              : [];

          const tokenAccounts = new Map();

          for (const balance of preTokenBalances) {
            if (
              balance?.accountIndex === undefined ||
              !balance?.mint
            ) {
              continue;
            }

            tokenAccounts.set(
              balance.accountIndex,
              {
                pre: balance,
                post: null
              }
            );
          }

          for (const balance of postTokenBalances) {
            if (
              balance?.accountIndex === undefined ||
              !balance?.mint
            ) {
              continue;
            }

            const current =
              tokenAccounts.get(
                balance.accountIndex
              ) || {
                pre: null,
                post: null
              };

            current.post = balance;

            tokenAccounts.set(
              balance.accountIndex,
              current
            );
          }

          const walletTokenDeltas = new Map();

          for (const entry of tokenAccounts.values()) {
            const pre = entry.pre;
            const post = entry.post;

            const mint =
              post?.mint ||
              pre?.mint ||
              null;

            const owner =
              post?.owner ||
              pre?.owner ||
              null;

            if (
              !mint ||
              owner !== normalizedAddress
            ) {
              continue;
            }

            let preAmount = 0n;
            let postAmount = 0n;

            try {
              preAmount = BigInt(
                pre?.uiTokenAmount?.amount || '0'
              );

              postAmount = BigInt(
                post?.uiTokenAmount?.amount || '0'
              );
            } catch {
              continue;
            }

            const delta =
              postAmount - preAmount;

            if (delta === 0n) continue;

            const decimals =
              Number(
                post?.uiTokenAmount?.decimals ??
                pre?.uiTokenAmount?.decimals ??
                0
              );

            const existing =
              walletTokenDeltas.get(mint);

            if (existing) {
              existing.delta += delta;
            } else {
              walletTokenDeltas.set(
                mint,
                {
                  delta,
                  decimals,
                  programId:
                    post?.programId ||
                    pre?.programId ||
                    null
                }
              );
            }
          }

          for (
            const [mint, tokenData]
            of walletTokenDeltas
          ) {
            const delta =
              tokenData.delta;

            if (delta === 0n) continue;

            const decimals =
              Number.isInteger(tokenData.decimals) &&
              tokenData.decimals >= 0
                ? tokenData.decimals
                : 0;

            const absolute =
              delta < 0n
                ? -delta
                : delta;

            const raw =
              absolute.toString();

            let amount = raw;

            if (decimals > 0) {
              const padded =
                raw.padStart(
                  decimals + 1,
                  '0'
                );

              const split =
                padded.length - decimals;

              const whole =
                padded.slice(0, split);

              const fraction =
                padded
                  .slice(split)
                  .replace(/0+$/, '');

              amount =
                fraction
                  ? whole + '.' + fraction
                  : whole;
            }

            const token2022Program =
              'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';

            const isToken2022 =
              tokenData.programId ===
              token2022Program;

            transactions.push({
              network: 'sol',
              whaleAddress: normalizedAddress,
              txid: signature,
              blockNumber: null,
              timestamp,
              from:
                delta < 0n
                  ? normalizedAddress
                  : null,
              to:
                delta > 0n
                  ? normalizedAddress
                  : null,
              direction:
                delta < 0n
                  ? 'OUTGOING'
                  : 'INCOMING',
              type:
                isToken2022
                  ? 'Token-2022 Transfer'
                  : 'SPL Token Transfer',
              amount,
              token: mint,
              tokenName: null,
              tokenAddress: mint,
              confirmed: !tx.meta.err,
              tokenProgram:
                tokenData.programId ||
                'Token Program'
            });
          }
        }

        transactions.sort(
          (a, b) =>
            Number(b.timestamp || 0) -
            Number(a.timestamp || 0)
        );

        return {
          success: true,
          found: true,
          network: 'sol',
          address: publicKey.toBase58(),
          latestBlock: null,
          transactions,
          transactionCount:
            transactions.length,
          latestTimestamp:
            transactions.length > 0
              ? transactions[0].timestamp
              : null
        };
      } catch (error) {
        return {
          success: false,
          found: false,
          network: 'sol',
          address: normalizedAddress,
          transactions: [],
          error:
            error?.message ||
            'Solana transfer discovery failed'
        };
      }
    }
  };
};

import { ethers } from 'ethers';

/*
 * ============================================================
 * DEFAULT NETWORKS
 * ============================================================
 */

const DEFAULT_NETWORKS = {
  ethereum: {
    chainId: 1,
    rpc:
      process.env.ETHEREUM_RPC ||
      'https://eth.drpc.org',
    nativeSymbol: 'ETH'
  },

  bsc: {
    chainId: 56,
    rpc:
      process.env.BSC_RPC ||
      'https://bsc-dataseed.binance.org',
    nativeSymbol: 'BNB'
  },

  polygon: {
    chainId: 137,
    rpc:
      process.env.POLYGON_RPC ||
      'https://polygon-bor-rpc.publicnode.com',
    nativeSymbol: 'POL'
  },

  arbitrum: {
    chainId: 42161,
    rpc:
      process.env.ARBITRUM_RPC ||
      'https://arb1.arbitrum.io/rpc',
    nativeSymbol: 'ETH'
  },

  base: {
    chainId: 8453,
    rpc:
      process.env.BASE_RPC ||
      'https://mainnet.base.org',
    nativeSymbol: 'ETH'
  },

  optimism: {
    chainId: 10,
    rpc:
      process.env.OPTIMISM_RPC ||
      'https://mainnet.optimism.io',
    nativeSymbol: 'ETH'
  },

  avalanche: {
    chainId: 43114,
    rpc:
      process.env.AVALANCHE_RPC ||
      'https://api.avax.network/ext/bc/C/rpc',
    nativeSymbol: 'AVAX'
  }
};

/*
 * ============================================================
 * ABIS / CONSTANTS
 * ============================================================
 */

const KNOWN_TOKEN_ADDRESSES = {
  ethereum: [
    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
  ]
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function approve(address spender,uint256 amount) returns (bool)'
];

const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

const APPROVAL_TOPIC = ethers.id('Approval(address,address,uint256)');

/*
 * ============================================================
 * HELPERS
 * ============================================================
 */

const normalizeAddress = address => {
  try {
    if (!address) {
      return null;
    }

    return ethers.getAddress(address);
  } catch {
    return null;
  }
};

const sameAddress = (a, b) => {
  const normalizedA =
    normalizeAddress(a);

  const normalizedB =
    normalizeAddress(b);

  if (
    !normalizedA ||
    !normalizedB
  ) {
    return false;
  }

  return (
    normalizedA ===
    normalizedB
  );
};

const formatNativeBalance = balance => {
  try {
    return Number(
      ethers.formatEther(balance)
    );
  } catch {
    return 0;
  }
};

const safeNumber = value => {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
};

/*
 * ============================================================
 * TIMEOUT HELPER
 * ============================================================
 */

const withTimeout = async (
  promise,
  timeoutMs,
  label = 'RPC request'
) => {
  let timeoutId;

  const timeoutPromise =
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new Error(
            `${label} timeout after ${timeoutMs} ms`
          )
        );
      }, timeoutMs);
    });

  try {
    return await Promise.race([
      promise,
      timeoutPromise
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
};

/*
 * ============================================================
 * ERROR HELPERS
 * ============================================================
 */

const isRetryableRpcError = error => {
  const message =
    String(
      error?.shortMessage ||
      error?.message ||
      error ||
      ''
    )
      .toLowerCase();

  return (
    message.includes('timeout') ||
    message.includes('408') ||
    message.includes('request timeout') ||
    message.includes('server response') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('429') ||
    message.includes('limit')
  );
};

/*
 * ============================================================
 * ERC20 METADATA
 * ============================================================
 */

const getERC20Metadata = async (
  provider,
  tokenAddress
) => {
  try {
    const contract =
      new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        provider
      );

    let decimals;

    /*
     * decimals() Ã§alÄ±ÅŸmÄ±yorsa kontratÄ± ERC20 olarak
     * kabul etmiyoruz.
     */

    try {
      decimals =
        Number(
          await withTimeout(
            contract.decimals(),
            5000,
            `ERC20 decimals ${tokenAddress}`
          )
        );

      if (
        !Number.isInteger(decimals) ||
        decimals < 0 ||
        decimals > 36
      ) {
        return null;
      }
    } catch {
      return null;
    }

    let symbol = 'UNKNOWN';
    let name = 'Unknown Token';

    try {
      symbol =
        String(
          await withTimeout(
            contract.symbol(),
            5000,
            `ERC20 symbol ${tokenAddress}`
          )
        );
    } catch {
      symbol = 'UNKNOWN';
    }

    try {
      name =
        String(
          await withTimeout(
            contract.name(),
            5000,
            `ERC20 name ${tokenAddress}`
          )
        );
    } catch {
      name = 'Unknown Token';
    }

    return {
      contract,
      decimals,
      symbol:
        symbol.trim() ||
        'UNKNOWN',
      name:
        name.trim() ||
        'Unknown Token'
    };
  } catch {
    return null;
  }
};

/*
 * ============================================================
 * TOKEN LOG CHUNK
 * ============================================================
 *
 * RPC getLogs bazÄ± provider'larda bÃ¼yÃ¼k block aralÄ±klarÄ±nda
 * 408 verebiliyor.
 *
 * Bu nedenle Ã¶nce bÃ¼yÃ¼k chunk denenir.
 * BaÅŸarÄ±sÄ±z olursa otomatik kÃ¼Ã§Ã¼ltÃ¼lÃ¼r.
 *
 * Ã–rnek:
 *
 * 250
 *  â†“
 * 125
 *  â†“
 * 62
 *  â†“
 * 31
 *
 * BÃ¶ylece tek problemli chunk bÃ¼tÃ¼n token taramasÄ±nÄ±
 * bozmaz.
 */

const getLogsAdaptive = async ({
  provider,
  filter,
  start,
  end,
  timeoutMs,
  label,
  initialChunkSize,
  minimumChunkSize
}) => {
  const totalBlocks =
    end - start + 1;

  let chunkSize =
    Math.min(
      initialChunkSize,
      totalBlocks
    );

  const minChunk =
    Math.max(
      1,
      minimumChunkSize
    );

  let currentStart =
    start;

  const allLogs = [];

  while (
    currentStart <= end
  ) {
    const currentEnd =
      Math.min(
        end,
        currentStart +
          chunkSize -
          1
      );

    try {
      const logs =
        await withTimeout(
          provider.getLogs({
            ...filter,
            fromBlock:
              currentStart,
            toBlock:
              currentEnd
          }),
          timeoutMs,
          `${label} ${currentStart}-${currentEnd}`
        );

      allLogs.push(
        ...logs
      );

      currentStart =
        currentEnd + 1;
    } catch (error) {
      const canShrink =
        chunkSize >
        minChunk;

      if (
        canShrink &&
        isRetryableRpcError(error)
      ) {
        const nextChunk =
          Math.max(
            minChunk,
            Math.floor(
              chunkSize / 2
            )
          );

        console.warn(
          `[EVM TOKEN] ${label} ${currentStart}-${currentEnd} failed. Retrying with chunk=${nextChunk}.`
        );

        chunkSize =
          nextChunk;

        continue;
      }

      console.error(
        `[EVM TOKEN] ${label} ${currentStart}-${currentEnd} error:`,
        error?.shortMessage ||
          error?.message ||
          error
      );

      /*
       * Bu chunk tamamen baÅŸarÄ±sÄ±z olsa bile
       * sonraki chunk'a devam ediyoruz.
       */

      currentStart =
        currentEnd + 1;
    }
  }

  return allLogs;
};

/*
 * ============================================================
 * TOKEN TRANSFER DISCOVERY
 * ============================================================
 */

const discoverTokenTransfers = async ({
  provider,
  wallet,
  latestBlock
}) => {
  const configuredLookback =
    Number(
      process.env.EVM_TOKEN_LOOKBACK_BLOCKS ||
        300
    );

  const safeConfiguredLookback =
    Number.isFinite(
      configuredLookback
    )
      ? configuredLookback
      : 300;

  const lookbackBlocks =
    Math.min(
      Math.max(
        safeConfiguredLookback,
        100
      ),
      5000
    );

  const configuredChunkSize =
    Number(
      process.env.EVM_LOG_CHUNK_SIZE ||
        250
    );

  const safeConfiguredChunkSize =
    Number.isFinite(
      configuredChunkSize
    )
      ? configuredChunkSize
      : 250;

  const initialChunkSize =
    Math.min(
      Math.max(
        safeConfiguredChunkSize,
        25
      ),
      1000
    );

  const configuredMinimumChunk =
    Number(
      process.env.EVM_LOG_MIN_CHUNK_SIZE ||
        25
    );

  const minimumChunkSize =
    Math.min(
      Math.max(
        Number.isFinite(
          configuredMinimumChunk
        )
          ? configuredMinimumChunk
          : 25,
        5
      ),
      initialChunkSize
    );

  const rpcTimeout =
    Math.min(
      Math.max(
        Number(
          process.env.EVM_LOG_RPC_TIMEOUT_MS ||
            8000
        ),
        2000
      ),
      30000
    );

  const fromBlock =
    Math.max(
      0,
      latestBlock -
        lookbackBlocks
    );

  const walletTopic =
    ethers.zeroPadValue(
      wallet,
      32
    );

  const logs = [];

  console.log(
    `[EVM TOKEN] Scanning blocks ${fromBlock}-${latestBlock} (${latestBlock - fromBlock + 1} blocks), chunk=${initialChunkSize}, minChunk=${minimumChunkSize}`
  );

  /*
   * ----------------------------------------------------------
   * INCOMING
   * ----------------------------------------------------------
   */

  const incomingLogs =
    await getLogsAdaptive({
      provider,

      filter: {
        topics: [
          TRANSFER_TOPIC,
          null,
          walletTopic
        ]
      },

      start:
        fromBlock,

      end:
        latestBlock,

      timeoutMs:
        rpcTimeout,

      label:
        'Incoming token logs',

      initialChunkSize,

      minimumChunkSize
    });

  logs.push(
    ...incomingLogs
  );

  /*
   * ----------------------------------------------------------
   * OUTGOING
   * ----------------------------------------------------------
   */

  const outgoingLogs =
    await getLogsAdaptive({
      provider,

      filter: {
        topics: [
          TRANSFER_TOPIC,
          walletTopic,
          null
        ]
      },

      start:
        fromBlock,

      end:
        latestBlock,

      timeoutMs:
        rpcTimeout,

      label:
        'Outgoing token logs',

      initialChunkSize,

      minimumChunkSize
    });

  logs.push(
    ...outgoingLogs
  );

  /*
   * ----------------------------------------------------------
   * DEDUPLICATION
   * ----------------------------------------------------------
   *
   * AynÄ± log incoming ve outgoing sorgularÄ±ndan
   * teorik olarak iki kez gelebilir.
   */

  const unique =
    new Map();

  for (const log of logs) {
    const key =
      `${log.transactionHash}:${log.index}`;

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        log
      );
    }
  }

  const result =
    [
      ...unique.values()
    ];

  /*
   * En yeni blok Ã¶nce.
   */

  result.sort(
    (a, b) => {
      const blockA =
        Number(
          a?.blockNumber || 0
        );

      const blockB =
        Number(
          b?.blockNumber || 0
        );

      if (
        blockA !==
        blockB
      ) {
        return (
          blockB -
          blockA
        );
      }

      return Number(
        b?.index || 0
      ) -
      Number(
        a?.index || 0
      );
    }
  );

  console.log(
    `[EVM TOKEN] Found ${result.length} unique token logs`
  );

  return result;
};

/*
 * ============================================================
 * BUILD TOKEN DATA
 * ============================================================
 */

const buildTokenData = async ({
  provider,
  wallet,
  network,
  logs
}) => {
  const knownTokenAddresses =
    KNOWN_TOKEN_ADDRESSES[network] || [];

  const tokenAddresses =
    [
      ...new Set([
        ...knownTokenAddresses,
        ...logs
          .map(log =>
            normalizeAddress(
              log.address
            )
          )
          .filter(Boolean)
      ])
    ];

  const tokens = [];
  const transactions = [];

  const blockTimestampCache = new Map();

  const getBlockTimestamp = async blockNumber => {
    if (blockNumber === null || blockNumber === undefined) {
      return null;
    }

    const blockKey = Number(blockNumber);

    if (blockTimestampCache.has(blockKey)) {
      return blockTimestampCache.get(blockKey);
    }

    try {
      const hexBlock = '0x' + blockKey.toString(16);
      const block = await withTimeout(
        provider.send('eth_getBlockByNumber', [hexBlock, false]),
        8000
      );

      let timestamp = null;

      if (block?.timestamp) {
        try {
          timestamp = Number(BigInt(block.timestamp));
        } catch {
          timestamp = null;
        }
      }

      blockTimestampCache.set(blockKey, timestamp);
      return timestamp;
    } catch {
      blockTimestampCache.set(blockKey, null);
      return null;
    }
  };

  /*
   * ----------------------------------------------------------
   * TOKEN CONTRACT LIMIT
   * ----------------------------------------------------------
   */

  const configuredMaxTokens =
    Number(
      process.env.EVM_MAX_TOKEN_CONTRACTS ||
        30
    );

  const safeMaxTokens =
    Number.isFinite(
      configuredMaxTokens
    )
      ? configuredMaxTokens
      : 30;

  const maxTokens =
    Math.min(
      Math.max(
        safeMaxTokens,
        1
      ),
      100
    );

  /*
   * En yeni token kontratlarÄ±nÄ±n Ã¶ncelik kazanmasÄ± iÃ§in
   * Ã¶nce log sÄ±rasÄ±ndaki adresleri kullanÄ±yoruz.
   */

  const limitedTokenAddresses =
    tokenAddresses.slice(
      0,
      maxTokens
    );

  /*
   * ----------------------------------------------------------
   * TOKEN CONCURRENCY
   * ----------------------------------------------------------
   */

  const configuredConcurrency =
    Number(
      process.env.EVM_TOKEN_CONCURRENCY ||
        4
    );

  const tokenConcurrency =
    Math.min(
      Math.max(
        Number.isFinite(
          configuredConcurrency
        )
          ? configuredConcurrency
          : 4,
        1
      ),
      8
    );

  if (
    tokenAddresses.length >
    limitedTokenAddresses.length
  ) {
    console.warn(
      `[EVM TOKEN] Token contract limit reached: ${limitedTokenAddresses.length}/${tokenAddresses.length}`
    );
  }

  /*
   * ----------------------------------------------------------
   * TOKEN PROCESSOR
   * ----------------------------------------------------------
   */

  const processToken =
    async tokenAddress => {
      try {
        const metadata =
          await getERC20Metadata(
            provider,
            tokenAddress
          );

        if (!metadata) {
          return {
            token: null,
            transactions: []
          };
        }

        /*
         * ----------------------------------------------------
         * CURRENT TOKEN BALANCE
         * ----------------------------------------------------
         */

        let rawBalance;

        try {
          rawBalance =
            await withTimeout(
              metadata.contract.balanceOf(
                wallet
              ),
              5000,
              `balanceOf ${tokenAddress}`
            );
        } catch (error) {
          console.error(
            `[EVM TOKEN] balanceOf failed ${tokenAddress}:`,
            error?.shortMessage ||
              error?.message ||
              error
          );

          return {
            token: null,
            transactions: []
          };
        }

        let formattedBalance =
          0;

        try {
          formattedBalance =
            safeNumber(
              ethers.formatUnits(
                rawBalance,
                metadata.decimals
              )
            );
        } catch {
          formattedBalance =
            0;
        }

        const token = {
          symbol:
            metadata.symbol,

          name:
            metadata.name,

          contractAddress:
            tokenAddress,

          decimals:
            metadata.decimals,

          balance:
            formattedBalance,

          rawBalance:
            rawBalance.toString()
        };

        /*
         * ----------------------------------------------------
         * TOKEN TRANSACTIONS
         * ----------------------------------------------------
         */

        const tokenTransactions =
          [];

        for (const log of logs) {
          const logTokenAddress =
            normalizeAddress(
              log.address
            );

          if (
            logTokenAddress !==
            tokenAddress
          ) {
            continue;
          }

          if (
            !log.topics?.[1] ||
            !log.topics?.[2]
          ) {
            continue;
          }

          let from;
          let to;

          try {
            from =
              ethers.getAddress(
                `0x${log.topics[1].slice(-40)}`
              );

            to =
              ethers.getAddress(
                `0x${log.topics[2].slice(-40)}`
              );
          } catch {
            continue;
          }

          /*
           * --------------------------------------------------
           * TRANSFER AMOUNT
           * --------------------------------------------------
           */

          let rawAmount =
            0n;

          try {
            rawAmount =
              ethers.toBigInt(
                log.data
              );
          } catch {
            rawAmount =
              0n;
          }

          let amount =
            0;

          try {
            amount =
              safeNumber(
                ethers.formatUnits(
                  rawAmount,
                  metadata.decimals
                )
              );
          } catch {
            amount =
              0;
          }

          /*
           * --------------------------------------------------
           * DIRECTION
           * --------------------------------------------------
           */

          let direction =
            'Unknown';

          if (
            sameAddress(
              from,
              wallet
            )
          ) {
            direction =
              'Outgoing';
          } else if (
            sameAddress(
              to,
              wallet
            )
          ) {
            direction =
              'Incoming';
          }

          const timestamp = await getBlockTimestamp(log.blockNumber);
          tokenTransactions.push({
            txid:
              log.transactionHash,

            blockNumber:
              log.blockNumber,

            timestamp,

            logIndex:
              log.index,

            from,

            to,

            type:
              'ERC20 Transfer',

            direction,

            amount,

            token:
              metadata.symbol,

            tokenName:
              metadata.name,

            tokenAddress,

            confirmed:
              true
          });
        }

        /*
         * ----------------------------------------------------
         * SORT
         * ----------------------------------------------------
         */

        tokenTransactions.sort(
          (a, b) => {
            const blockA =
              Number(
                a?.blockNumber || 0
              );

            const blockB =
              Number(
                b?.blockNumber || 0
              );

            if (
              blockA !==
              blockB
            ) {
              return (
                blockB -
                blockA
              );
            }

            return (
              Number(
                b?.logIndex || 0
              ) -
              Number(
                a?.logIndex || 0
              )
            );
          }
        );

        return {
          token,

          transactions:
            tokenTransactions
        };
      } catch (error) {
        console.error(
          `[EVM TOKEN] Processing error ${tokenAddress}:`,
          error?.shortMessage ||
            error?.message ||
            error
        );

        return {
          token: null,
          transactions: []
        };
      }
    };

  /*
   * ----------------------------------------------------------
   * CONTROLLED PARALLEL TOKEN PROCESSING
   * ----------------------------------------------------------
   */

  for (
    let i = 0;
    i <
    limitedTokenAddresses.length;
    i += tokenConcurrency
  ) {
    const batch =
      limitedTokenAddresses.slice(
        i,
        i +
          tokenConcurrency
      );

    const results =
      await Promise.all(
        batch.map(
          processToken
        )
      );

    for (
      const result of results
    ) {
      if (
        result?.token
      ) {
        tokens.push(
          result.token
        );
      }

      if (
        Array.isArray(
          result?.transactions
        )
      ) {
        transactions.push(
          ...result.transactions
        );
      }
    }
  }

  return {
    tokens,
    transactions
  };
};

/*
 * ============================================================
 * NATIVE TRANSACTION DISCOVERY
 * ============================================================
 *
 * Native ETH/BNB/etc. transferleri Transfer event'i Ã¼retmez.
 *
 * Bu nedenle normal transaction'larÄ±
 * eth_getBlockByNumber ile tarÄ±yoruz.
 *
 * Internal transaction / trace hareketleri burada gÃ¶rÃ¼nmez.
 * Bunlar ileride ayrÄ± trace/indexer katmanÄ±nda ele alÄ±nmalÄ±dÄ±r.
 * ============================================================
 */

const discoverNativeTransfers = async ({
  provider,
  wallet,
  latestBlock
}) => {
  /*
   * ==========================================================
   * NATIVE TRANSACTION DISCOVERY
   * ==========================================================
   */

  const configuredLookback =
    Number(
      process.env.EVM_NATIVE_TX_LOOKBACK_BLOCKS || 10
    );

  const safeLookback =
    Number.isFinite(configuredLookback)
      ? configuredLookback
      : 10;

  const configuredMaxBlocks =
    Number(
      process.env.EVM_NATIVE_TX_MAX_BLOCKS || 50
    );

  const safeMaxBlocks =
    Number.isFinite(configuredMaxBlocks)
      ? configuredMaxBlocks
      : 50;

  const lookbackBlocks =
    Math.min(
      Math.max(safeLookback, 1),
      Math.max(safeMaxBlocks, 1)
    );

  const configuredConcurrency =
    Number(
      process.env.EVM_NATIVE_TX_CONCURRENCY || 2
    );

  const concurrency =
    Math.min(
      Math.max(
        Number.isFinite(configuredConcurrency)
          ? configuredConcurrency
          : 2,
        1
      ),
      5
    );

  const configuredTimeout =
    Number(
      process.env.EVM_NATIVE_TX_TIMEOUT_MS || 8000
    );

  const timeoutMs =
    Math.min(
      Math.max(
        Number.isFinite(configuredTimeout)
          ? configuredTimeout
          : 8000,
        2000
      ),
      15000
    );

  const fromBlock =
    Math.max(
      0,
      latestBlock - lookbackBlocks
    );

  const blockNumbers = [];

  for (
    let blockNumber = fromBlock;
    blockNumber <= latestBlock;
    blockNumber++
  ) {
    blockNumbers.push(blockNumber);
  }

  console.log(
    `[EVM NATIVE] Scanning blocks ${fromBlock}-${latestBlock} (${blockNumbers.length} blocks), concurrency=${concurrency}, timeout=${timeoutMs}ms`
  );

  const normalizedWallet =
    normalizeAddress(wallet);

  if (!normalizedWallet) {
    console.error(
      '[EVM NATIVE] Invalid wallet address'
    );

    return [];
  }

  const transactionMap = new Map();

  /*
   * ----------------------------------------------------------
   * SINGLE BLOCK SCAN
   * ----------------------------------------------------------
   */

  const scanBlock = async blockNumber => {
    try {
      const block =
        await withTimeout(
          provider.send(
            'eth_getBlockByNumber',
            [
              `0x${blockNumber.toString(16)}`,
              true
            ]
          ),
          timeoutMs,
          `Native block ${blockNumber}`
        );

      if (
        !block ||
        !Array.isArray(block.transactions)
      ) {
        return;
      }

      let resolvedBlockNumber =
        blockNumber;

      if (block.number) {
        try {
          resolvedBlockNumber =
            Number(
              BigInt(block.number)
            );
        } catch {
          resolvedBlockNumber =
            blockNumber;
        }
      }

      let timestamp = null;

      if (block.timestamp) {
        try {
          timestamp = Number(BigInt(block.timestamp));
        } catch {
          timestamp = null;
        }

      }
      for (const tx of block.transactions) {
        if (!tx || !tx.hash) {
          continue;
        }

        const from =
          normalizeAddress(tx.from);

        const to =
          tx.to
            ? normalizeAddress(tx.to)
            : null;

        if (!from && !to) {
          continue;
        }

        const walletIsSender =
          sameAddress(
            from,
            normalizedWallet
          );

        const walletIsReceiver =
          sameAddress(
            to,
            normalizedWallet
          );

        if (
          !walletIsSender &&
          !walletIsReceiver
        ) {
          continue;
        }

        /*
         * Contract creation:
         * to === null
         */

        if (!to) {
          continue;
        }

        let rawValue = 0n;

        try {
          rawValue =
            ethers.toBigInt(
              tx.value || '0x0'
            );
        } catch {
          rawValue = 0n;
        }

        /*
         * Zero-value transaction native transfer değildir.
         */

        if (rawValue === 0n) {
          continue;
        }

        let amount = 0;

        try {
          amount =
            safeNumber(
              ethers.formatEther(
                rawValue
              )
            );
        } catch {
          amount = 0;
        }

        let direction = 'Unknown';

        if (walletIsSender) {
          direction = 'Outgoing';
        } else if (walletIsReceiver) {
          direction = 'Incoming';
        }

        const transaction = {
          txid:
            tx.hash,

          blockNumber:
            resolvedBlockNumber,

          timestamp,
          from,

          to,

          type:
            'Native Transfer',

          direction,

          amount,

          token:
            null,

          tokenName:
            null,

          tokenAddress:
            null,

          confirmed:
            true
        };

        if (
          !transactionMap.has(
            tx.hash
          )
        ) {
          transactionMap.set(
            tx.hash,
            transaction
          );
        }
      }
    } catch (error) {
      console.error(
        `[EVM NATIVE] Block ${blockNumber} error:`,
        error?.shortMessage ||
          error?.message ||
          error
      );
    }
  };

  /*
   * ----------------------------------------------------------
   * CONTROLLED PARALLEL SCAN
   * ----------------------------------------------------------
   */

  for (
    let i = 0;
    i < blockNumbers.length;
    i += concurrency
  ) {
    const batch =
      blockNumbers.slice(
        i,
        i + concurrency
      );

    await Promise.all(
      batch.map(scanBlock)
    );
  }

  /*
   * ----------------------------------------------------------
   * MAP -> ARRAY
   * ----------------------------------------------------------
   */

  const transactions =
    [
      ...transactionMap.values()
    ];

  /*
   * ----------------------------------------------------------
   * SORT
   * ----------------------------------------------------------
   */

  transactions.sort(
    (a, b) => {
      const blockA =
        Number(
          a?.blockNumber || 0
        );

      const blockB =
        Number(
          b?.blockNumber || 0
        );

      if (
        blockA !== blockB
      ) {
        return blockB - blockA;
      }

      return String(
        b?.txid || ''
      ).localeCompare(
        String(
          a?.txid || ''
        )
      );
    }
  );

  console.log(
    `[EVM NATIVE] Found ${transactions.length} native transfers`
  );

  return transactions;
};
export const createEvmAdapter = ({
  networks = DEFAULT_NETWORKS
} = {}) => {
  const providers =
    new Map();

  /*
   * ----------------------------------------------------------
   * CREATE PROVIDERS
   * ----------------------------------------------------------
   */

  for (
    const [
      network,
      config
    ] of Object.entries(
      networks
    )
  ) {
    providers.set(
      network,
      new ethers.JsonRpcProvider(
        config.rpc,
        {
          chainId:
            config.chainId,

          name:
            network
        },
        {
          staticNetwork:
            true
        }
      )
    );
  }

  return {
    network:
      'evm',

    supportedNetworks:
      Object.keys(
        networks
      ),

    /*
     * ========================================================
     * CHECK WALLET
     * ========================================================
     */

    async checkAllowances({
      network,
      address
    }) {
      const normalizedNetwork = String(network || '').trim().toLowerCase();
      const config = networks[normalizedNetwork];

      if (!config) {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          error: 'EVM network not supported'
        };
      }

      const normalizedAddress = normalizeAddress(address);

      if (!normalizedAddress) {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          error: 'Invalid EVM wallet address'
        };
      }

      const provider = providers.get(normalizedNetwork);

      if (!provider) {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address: normalizedAddress,
          error: 'Provider unavailable'
        };
      }

      const latestBlock = await withTimeout(
        provider.getBlockNumber(),
        10000,
        `${normalizedNetwork} blockNumber`
      );

      const lookback = Math.min(
        Math.max(
          Number(process.env.EVM_APPROVAL_LOOKBACK_BLOCKS || 5000),
          100
        ),
        20000
      );

      const fromBlock = Math.max(0, latestBlock - lookback);

      const ownerTopic = ethers.zeroPadValue(
        normalizedAddress,
        32
      );

      const logs = await getLogsAdaptive({
        provider,
        filter: {
          topics: [
            APPROVAL_TOPIC,
            ownerTopic
          ]
        },
        start: fromBlock,
        end: latestBlock,
        timeoutMs: 10000,
        label: `${normalizedNetwork} Approval`,
        initialChunkSize: 250,
        minimumChunkSize: 25
      });

      const pairs = new Map();

      for (const log of logs) {
        try {
          if (!log.topics?.[2]) continue;

          const tokenAddress = normalizeAddress(log.address);

          const spender = normalizeAddress(
            ethers.dataSlice(log.topics[2], 12)
          );

          if (!tokenAddress || !spender) continue;

          pairs.set(
            `${tokenAddress.toLowerCase()}:${spender.toLowerCase()}`,
            { tokenAddress, spender }
          );
        } catch {}
      }

      const allowances = [];

      for (const pair of pairs.values()) {
        try {
          const contract = new ethers.Contract(
            pair.tokenAddress,
            ERC20_ABI,
            provider
          );

          const allowance = await withTimeout(
            contract.allowance(
              normalizedAddress,
              pair.spender
            ),
            10000,
            `${normalizedNetwork} allowance`
          );

          if (allowance === 0n) continue;

          const [symbol, name, decimals] = await Promise.all([
            contract.symbol().catch(() => ''),
            contract.name().catch(() => ''),
            contract.decimals().catch(() => 18)
          ]);

          const decimalsNumber = Number(decimals) || 18;
          const unlimited = allowance === ethers.MaxUint256;

          allowances.push({
            network: normalizedNetwork,
            owner: normalizedAddress,
            token: pair.tokenAddress,
            tokenSymbol: symbol || null,
            tokenName: name || null,
            decimals: decimalsNumber,
            spender: pair.spender,
            allowance: ethers.formatUnits(
              allowance,
              decimalsNumber
            ),
            allowanceRaw: allowance.toString(),
            unlimited,
            risk: unlimited ? 'Yüksek' : 'Orta',
            source: 'EVM_APPROVAL_RPC'
          });
        } catch (error) {
          console.warn(
            `[EVM ALLOWANCE] ${pair.tokenAddress} -> ${pair.spender}`,
            error?.shortMessage || error?.message || error
          );
        }
      }

      return {
        success: true,
        found: true,
        network: normalizedNetwork,
        address: normalizedAddress,
        chainId: config.chainId,
        latestBlock,
        fromBlock,
        allowances
      };
    },
    async prepareRevokeApproval({
      network,
      owner,
      token,
      spender
    }) {
      /*
       * ======================================================
       * PREPARE ERC20 REVOKE
       * ======================================================
       *
       * Bu fonksiyon blockchain'e transaction gondermez.
       *
       * Sadece kullanicinin kendi wallet'inda imzalayacagi
       * guvenli transaction payload'ini hazirlar.
       *
       * Revoke islemi:
       *
       * approve(spender, 0)
       *
       * Private key backend'e girmez.
       * ======================================================
       */

      const normalizedNetwork =
        String(
          network || ''
        )
          .trim()
          .toLowerCase();

      const config =
        networks[
          normalizedNetwork
        ];

      if (!config) {
        return {
          success: false,
          error: 'EVM network not supported',
          network: normalizedNetwork
        };
      }

      const normalizedOwner =
        normalizeAddress(owner);

      const normalizedToken =
        normalizeAddress(token);

      const normalizedSpender =
        normalizeAddress(spender);

      if (!normalizedOwner) {
        return {
          success: false,
          error: 'Invalid owner address'
        };
      }

      if (!normalizedToken) {
        return {
          success: false,
          error: 'Invalid token contract address'
        };
      }

      if (!normalizedSpender) {
        return {
          success: false,
          error: 'Invalid spender address'
        };
      }

      if (
        sameAddress(
          normalizedToken,
          normalizedSpender
        )
      ) {
        return {
          success: false,
          error: 'Token and spender cannot be the same address'
        };
      }

      if (
        normalizedSpender ===
        ethers.ZeroAddress
      ) {
        return {
          success: false,
          error: 'Invalid zero spender address'
        };
      }

      const provider =
        providers.get(
          normalizedNetwork
        );

      if (!provider) {
        return {
          success: false,
          error: 'Provider unavailable',
          network: normalizedNetwork
        };
      }

      /*
       * ------------------------------------------------------
       * CONTRACT CODE CHECK
       * ------------------------------------------------------
       */

      const code =
        await withTimeout(
          provider.getCode(
            normalizedToken
          ),
          10000,
          `${normalizedNetwork} token code`
        );

      if (
        !code ||
        code === '0x'
      ) {
        return {
          success: false,
          error: 'Token address is not a deployed contract',
          network: normalizedNetwork,
          token: normalizedToken
        };
      }

      /*
       * ------------------------------------------------------
       * ERC20 CONTRACT
       * ------------------------------------------------------
       */

      const contract =
        new ethers.Contract(
          normalizedToken,
          ERC20_ABI,
          provider
        );

      /*
       * ------------------------------------------------------
       * CURRENT ALLOWANCE
       * ------------------------------------------------------
       */

      const currentAllowance =
        await withTimeout(
          contract.allowance(
            normalizedOwner,
            normalizedSpender
          ),
          10000,
          `${normalizedNetwork} revoke allowance`
        );

      if (
        currentAllowance ===
        0n
      ) {
        return {
          success: false,
          revoked: true,
          alreadyRevoked: true,
          network: normalizedNetwork,
          chainId: config.chainId,
          owner: normalizedOwner,
          token: normalizedToken,
          spender: normalizedSpender,
          allowanceRaw: '0',
          error: 'Allowance is already zero'
        };
      }

      /*
       * ------------------------------------------------------
       * TOKEN METADATA
       * ------------------------------------------------------
       */

      const [
        symbol,
        name,
        decimals
      ] = await Promise.all([
        contract.symbol().catch(() => ''),
        contract.name().catch(() => ''),
        contract.decimals().catch(() => 18)
      ]);

      const decimalsNumber =
        Number(decimals) || 18;

      /*
       * ------------------------------------------------------
       * REVOKE CALLDATA
       * ------------------------------------------------------
       *
       * ERC20 revoke:
       *
       * approve(spender, 0)
       *
       * Backend transaction gondermez.
       * Sadece calldata uretir.
       */

      const iface =
        new ethers.Interface(
          ERC20_ABI
        );

      const data =
        iface.encodeFunctionData(
          'approve',
          [
            normalizedSpender,
            0n
          ]
        );

      /*
       * ------------------------------------------------------
       * WALLET TRANSACTION
       * ------------------------------------------------------
       */

      const transaction = {
        to: normalizedToken,
        data,
        value: '0x0',
        chainId: config.chainId
      };

      return {
        success: true,
        revoked: false,
        alreadyRevoked: false,

        network:
          normalizedNetwork,

        chainId:
          config.chainId,

        owner:
          normalizedOwner,

        token:
          normalizedToken,

        spender:
          normalizedSpender,

        tokenSymbol:
          symbol || null,

        tokenName:
          name || null,

        decimals:
          decimalsNumber,

        allowanceBefore:
          ethers.formatUnits(
            currentAllowance,
            decimalsNumber
          ),

        allowanceBeforeRaw:
          currentAllowance.toString(),

        revokeAmount:
          '0',

        method:
          'approve(address,uint256)',

        transaction
      };
    },
    async discoverTransfers({
      network,
      address
    }) {
      const normalizedNetwork =
        String(network || '')
          .trim()
          .toLowerCase();

      const config =
        networks[normalizedNetwork];

      if (!config) {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          error:
            'EVM network not supported'
        };
      }

      const normalizedAddress =
        normalizeAddress(address);

      if (!normalizedAddress) {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address,
          error:
            'Invalid EVM wallet address'
        };
      }

      const provider =
        providers.get(
          normalizedNetwork
        );

      if (!provider) {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address:
            normalizedAddress,
          error:
            'Provider unavailable'
        };
      }

      try {
        const latestBlock =
          await withTimeout(
            provider.getBlockNumber(),
            10000,
            normalizedNetwork +
              ' latest block'
          );

        const logs =
          await discoverTokenTransfers({
            provider,
            wallet:
              normalizedAddress,
            latestBlock
          });

        const tokenData =
          await buildTokenData({
            provider,
            network:
              normalizedNetwork,
            wallet:
              normalizedAddress,
            logs
          });

        const nativeTransactions =
          await discoverNativeTransfers({
            provider,
            wallet:
              normalizedAddress,
            latestBlock
          });

        const transactions = [
          ...tokenData.transactions,
          ...nativeTransactions
        ];

        transactions.sort(
          (a, b) => {
            const timestampA =
              Number(a?.timestamp || 0);

            const timestampB =
              Number(b?.timestamp || 0);

            if (
              timestampA !==
              timestampB
            ) {
              return (
                timestampB -
                timestampA
              );
            }

            const blockA =
              Number(
                a?.blockNumber || 0
              );

            const blockB =
              Number(
                b?.blockNumber || 0
              );

            return blockB - blockA;
          }
        );

        return {
          success: true,
          found: true,
          network:
            normalizedNetwork,
          address:
            normalizedAddress,
          chainId:
            config.chainId,
          latestBlock,
          transactions
        };
      } catch (error) {
        return {
          success: false,
          found: false,
          network: normalizedNetwork,
          address:
            normalizedAddress,
          chainId:
            config.chainId,
          error:
            error?.shortMessage ||
            error?.message ||
            'Transfer discovery failed'
        };
      }
    },
    async checkWallet({
      network,
      address
    }) {
      /*
       * ------------------------------------------------------
       * NETWORK
       * ------------------------------------------------------
       */

      const normalizedNetwork =
        String(
          network || ''
        )
          .trim()
          .toLowerCase();

      const config =
        networks[
          normalizedNetwork
        ];

      if (!config) {
        return {
          found:
            false,

          network:
            normalizedNetwork,

          address,

          error:
            'EVM network not supported'
        };
      }

      /*
       * ------------------------------------------------------
       * ADDRESS
       * ------------------------------------------------------
       */

      const normalizedAddress =
        normalizeAddress(
          address
        );

      if (!normalizedAddress) {
        return {
          found:
            false,

          network:
            normalizedNetwork,

          address,

          error:
            'Invalid EVM wallet address'
        };
      }

      /*
       * ------------------------------------------------------
       * PROVIDER
       * ------------------------------------------------------
       */

      const provider =
        providers.get(
          normalizedNetwork
        );

      if (!provider) {
        return {
          found:
            false,

          network:
            normalizedNetwork,

          address,

          error:
            'Provider unavailable'
        };
      }

      const diagnosticTotalStart =
        Date.now();

      /*
       * ======================================================
       * NATIVE BALANCE
       * ======================================================
       */

      const balanceStart =
        Date.now();

      let balance;

      try {
        balance =
          await withTimeout(
            provider.getBalance(
              normalizedAddress
            ),
            10000,
            `${normalizedNetwork} balance`
          );
      } catch (error) {
        console.error(
          `${normalizedNetwork} balance request error:`,
          error?.shortMessage ||
            error?.message ||
            error
        );

        return {
          success:
            false,

          found:
            false,

          network:
            normalizedNetwork,

          address:
            normalizedAddress,

          chainId:
            config.chainId,

          error:
            'Unable to retrieve native balance'
        };
      }

      console.log(
        `[EVM TIMING] balance: ${Date.now() - balanceStart} ms`
      );

      /*
       * ======================================================
       * LATEST BLOCK
       * ======================================================
       */

      const blockStart =
        Date.now();

      let blockNumber =
        null;

      try {
        blockNumber =
          await withTimeout(
            provider.getBlockNumber(),
            10000,
            `${normalizedNetwork} blockNumber`
          );
      } catch (error) {
        console.error(
          `${normalizedNetwork} block request error:`,
          error?.shortMessage ||
            error?.message ||
            error
        );
      }

      console.log(
        `[EVM TIMING] blockNumber: ${Date.now() - blockStart} ms`
      );

      /*
       * ======================================================
       * RESULT ARRAYS
       * ======================================================
       */

      let tokens = [];
      let transactions = [];

      /*
       * ======================================================
       * TOKEN SCAN
       * ======================================================
       */

      const disableTokenScan =
        String(
          process.env.EVM_DISABLE_TOKEN_SCAN ||
            ''
        )
          .trim()
          .toLowerCase() ===
        'true';

      if (
        blockNumber !== null &&
        !disableTokenScan
      ) {
        const tokenTotalStart =
          Date.now();

        try {
          /*
           * --------------------------------------------------
           * TOKEN LOGS
           * --------------------------------------------------
           */

          const logsStart =
            Date.now();

          const logs =
            await discoverTokenTransfers({
              provider,

              wallet:
                normalizedAddress,

              latestBlock:
                blockNumber
            });

          console.log(
            `[EVM TIMING] tokenLogs: ${Date.now() - logsStart} ms`
          );

          /*
           * --------------------------------------------------
           * TOKEN DATA
           * --------------------------------------------------
           */

          const buildTokenStart =
            Date.now();

          const tokenData =
            await buildTokenData({
              provider,
              network: normalizedNetwork,

              wallet:
                normalizedAddress,

              logs
            });

          console.log(
            `[EVM TIMING] buildTokenData: ${Date.now() - buildTokenStart} ms`
          );

          tokens =
            tokenData.tokens;

          transactions =
            tokenData.transactions;
        } catch (error) {
          console.error(
            `${normalizedNetwork} token discovery error:`,
            error?.shortMessage ||
              error?.message ||
              error
          );
        }

        console.log(
          `[EVM TIMING] tokenTotal: ${Date.now() - tokenTotalStart} ms`
        );
      } else if (
        disableTokenScan
      ) {
        console.log(
          '[EVM] Token scan disabled'
        );
      }

      /*
       * ======================================================
       * NATIVE TRANSACTION SCAN
       * ======================================================
       */

      const disableNativeTxScan =
        String(
          process.env.EVM_DISABLE_NATIVE_TX_SCAN ||
            ''
        )
          .trim()
          .toLowerCase() ===
        'true';

      if (
        blockNumber !== null &&
        !disableNativeTxScan
      ) {
        const nativeStart =
          Date.now();

        try {
          const nativeTransactions =
            await discoverNativeTransfers({
              provider,

              wallet:
                normalizedAddress,

              latestBlock:
                blockNumber
            });

          /*
           * --------------------------------------------------
           * TOKEN + NATIVE
           * --------------------------------------------------
           */

          transactions = [
            ...transactions,
            ...nativeTransactions
          ];

          /*
           * --------------------------------------------------
           * GLOBAL SORT
           * --------------------------------------------------
           */

          transactions.sort(
            (a, b) => {
              const blockA =
                Number(
                  a?.blockNumber || 0
                );

              const blockB =
                Number(
                  b?.blockNumber || 0
                );

              if (
                blockA !==
                blockB
              ) {
                return (
                  blockB -
                  blockA
                );
              }

              return String(
                b?.txid || ''
              ).localeCompare(
                String(
                  a?.txid || ''
                )
              );
            }
          );
        } catch (error) {
          console.error(
            `${normalizedNetwork} native transaction discovery error:`,
            error?.shortMessage ||
              error?.message ||
              error
          );
        }

        console.log(
          `[EVM TIMING] nativeTransfers: ${Date.now() - nativeStart} ms`
        );
      } else if (
        disableNativeTxScan
      ) {
        console.log(
          '[EVM] Native transaction scan disabled'
        );
      }

      /*
       * ======================================================
       * TOTAL TIMING
       * ======================================================
       */

      console.log(
        `[EVM TIMING] TOTAL: ${Date.now() - diagnosticTotalStart} ms`
      );

      /*
       * ======================================================
       * FINAL RESPONSE
       * ======================================================
       */

      return {
        success:
          true,

        found:
          true,

        network:
          normalizedNetwork,

        address:
          normalizedAddress,

        chainId:
          config.chainId,

        balance:
          formatNativeBalance(
            balance
          ),

        balanceUnit:
          config.nativeSymbol,

        tokens,

        transactions,

        latestBlock:
          blockNumber,

        account: {
          nativeBalanceWei:
            balance.toString()
        },

        isScam:
          false
      };
    }
  };
};

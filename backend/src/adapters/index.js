import { createTronAdapter } from './tron.js';
import { createEvmAdapter } from './evm.js';
import { createBitcoinAdapter } from './bitcoin.js';
import { createPiAdapter } from './pi.js';
import { createSolanaAdapter } from './solana.js';

export const createAdapters = () => {
  const adapters = [
    createTronAdapter(),
    createEvmAdapter(),
    createBitcoinAdapter(),
    createPiAdapter(),
    createSolanaAdapter()
  ];

  const registry = new Map();

  for (const adapter of adapters) {
    registry.set(adapter.network, adapter);

    if (Array.isArray(adapter.supportedNetworks)) {
      for (const network of adapter.supportedNetworks) {
        registry.set(network, adapter);
      }
    }
  }

  return registry;
};

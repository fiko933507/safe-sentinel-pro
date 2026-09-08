import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';

const projectId = process.env.EXPO_PUBLIC_REOWN_PROJECT_ID;

if (!projectId) {
  throw new Error('EXPO_PUBLIC_REOWN_PROJECT_ID tanımlı değil.');
}

const storage = {
  async getKeys() {
    return await AsyncStorage.getAllKeys();
  },

  async getEntries() {
    const keys = await AsyncStorage.getAllKeys();
    const entries = await AsyncStorage.multiGet(keys);

    return entries.map(([key, value]) => [
      key,
      value === null ? undefined : value,
    ]);
  },

  async getItem(key) {
    const value = await AsyncStorage.getItem(key);

    if (value === null) {
      return undefined;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },

  async setItem(key, value) {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async removeItem(key) {
    await AsyncStorage.removeItem(key);
  },
};

const ethereum = {
  id: 1,
  name: 'Ethereum',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://ethereum-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Etherscan',
      url: 'https://etherscan.io',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:1',
};

const polygon = {
  id: 137,
  name: 'Polygon',
  nativeCurrency: {
    name: 'POL',
    symbol: 'POL',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://polygon-bor-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'PolygonScan',
      url: 'https://polygonscan.com',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:137',
};

const arbitrum = {
  id: 42161,
  name: 'Arbitrum One',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://arbitrum-one-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arbiscan',
      url: 'https://arbiscan.io',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:42161',
};

const bsc = {
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://bsc-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BscScan',
      url: 'https://bscscan.com',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:56',
};

const avalanche = {
  id: 43114,
  name: 'Avalanche',
  nativeCurrency: {
    name: 'Avalanche',
    symbol: 'AVAX',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://avalanche-c-chain-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'SnowTrace',
      url: 'https://snowtrace.io',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:43114',
};


const base = {
  id: 8453,
  name: 'Base',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://base-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BaseScan',
      url: 'https://basescan.org',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:8453',
};

const optimism = {
  id: 10,
  name: 'Optimism',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://optimism-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Optimistic Etherscan',
      url: 'https://optimistic.etherscan.io',
    },
  },
  chainNamespace: 'eip155',
  caipNetworkId: 'eip155:10',
};

const networks = [
  ethereum,
  polygon,
  arbitrum,
  bsc,
  avalanche,
  base,
  optimism,
];

const ethersAdapter = new EthersAdapter();

export const appKit = createAppKit({
  projectId,
  metadata: {
    name: 'Safe Sentinel Pro',
    description: 'Multichain blockchain security application',
    url: 'https://safe-sentinel.pro',
    icons: [],
    redirect: {
      native: 'safesentinel://',
    },
  },
  adapters: [ethersAdapter],
  networks,
  storage,
});

export { networks, ethersAdapter };

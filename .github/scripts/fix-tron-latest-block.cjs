const fs = require('fs');
const path = 'backend/src/adapters/tron.js';
let text = fs.readFileSync(path, 'utf8');

const marker = `      return {\n        found: true,\n        network: 'tron',\n        address,\n        balance,\n        balanceUnit: 'TRX',\n        transactions,`;

if (!text.includes(marker)) {
  throw new Error('Expected TRON wallet return block was not found.');
}

const replacement = `      let latestBlock = null;\n\n      try {\n        const blockResponse = await fetchImpl(\n          \`${'${tronRpc}'}/wallet/getnowblock\`,\n          {\n            method: 'POST',\n            headers: {\n              ...headers,\n              'Content-Type': 'application/json'\n            },\n            body: '{}'\n          }\n        );\n\n        if (blockResponse.ok) {\n          const blockJson = await blockResponse.json();\n          const blockNumber = Number(\n            blockJson?.block_header?.raw_data?.number\n          );\n\n          if (Number.isFinite(blockNumber)) {\n            latestBlock = blockNumber;\n          }\n        }\n      } catch (error) {\n        console.error(\n          'TRON latest block request error:',\n          error?.message || error\n        );\n      }\n\n      return {\n        found: true,\n        network: 'tron',\n        address,\n        balance,\n        balanceUnit: 'TRX',\n        latestBlock,\n        transactions,`;

text = text.replace(marker, replacement);
fs.writeFileSync(path, text, 'utf8');
console.log('TRON latest block support added.');

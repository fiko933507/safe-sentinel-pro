import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const [totalRows, activeRows, byNetwork, byCategory, distinctPairs] = await Promise.all([
    prisma.scamAddress.count(),
    prisma.scamAddress.count({ where: { active: true } }),
    prisma.scamAddress.groupBy({ by: ['network'], _count: { _all: true }, orderBy: { network: 'asc' } }),
    prisma.scamAddress.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { category: 'asc' } }),
    prisma.scamAddress.findMany({ select: { network: true, address: true }, distinct: ['network', 'address'] }),
  ]);

  const distinctAddresses = new Set(distinctPairs.map((r) => String(r.address).trim().toLowerCase())).size;
  const duplicateNetworkAddressRows = totalRows - distinctPairs.length;

  console.log(JSON.stringify({
    success: true,
    totalRows,
    activeRows,
    inactiveRows: totalRows - activeRows,
    uniqueNetworkAddressPairs: distinctPairs.length,
    globallyDistinctAddressStrings: distinctAddresses,
    duplicateNetworkAddressRows,
    byNetwork: Object.fromEntries(byNetwork.map((r) => [r.network, r._count._all])),
    byCategory: Object.fromEntries(byCategory.map((r) => [r.category, r._count._all])),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}

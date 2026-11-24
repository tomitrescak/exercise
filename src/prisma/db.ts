import "temporal-polyfill/global";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";

import type { Contract } from "./contract.d.ts";
import contractJson from "./contract.json" with { type: "json" };

export const contract = contractFromJson<Contract>(contractJson);

function createDb() {
  return postgres({ contract, url: process.env.DATABASE_URL! });
}

// Reuse one pool across Next.js dev hot reloads, but rebuild it when the contract changes
// (otherwise a schema change keeps serving the stale contract until the server restarts).
type Cached = { hash: string; db: ReturnType<typeof createDb> };
const globalForDb = globalThis as unknown as { __db?: Cached };
const hash = (contractJson as { storage: { storageHash: string } }).storage.storageHash;

const cached = globalForDb.__db;
if (cached && cached.hash !== hash) {
  // Older cache entries may be the bare client; close whichever we find.
  const stale = (cached.db ?? cached) as { close?: () => Promise<void> };
  void stale.close?.().catch(() => {});
  globalForDb.__db = undefined;
}
export const db = globalForDb.__db?.db ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.__db = { hash, db };

export type Db = typeof db;

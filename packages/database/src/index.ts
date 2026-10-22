import { PrismaClient } from "@prisma/client";
import { createRepos, type Repos, type DbClient } from "./repositories.js";

// The database client + the repository bundle. The `PrismaClient` is a global
// singleton (a connection pool is created once, shared by the api/worker).

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getPrismaClient(): DbClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  return globalForPrisma.prisma;
}

export function getRepos(): Repos {
  return createRepos(getPrismaClient());
}

export * from "./repositories.js";

// Fastify type augmentation: the `capability` + `public` keys on the route
// schema `config`. Fastify 5's base `FastifySchema` has no `config` field —
// it's a runtime feature (a per-route config object read off
// `req.context.config`). This augmentation adds it so the typed helper + the
// reads are checked.

import type { Capability } from "../plugins/tenant.js";

declare module "fastify" {
  interface FastifySchema {
    config?: {
      public?: boolean;
      capability?: Capability;
    };
  }

  interface FastifyRequestContext {
    config: {
      public?: boolean;
      capability?: Capability;
    } & Record<string, unknown>;
  }
}

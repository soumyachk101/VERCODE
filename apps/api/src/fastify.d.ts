// Fastify type augmentation: the `capability` + `public` keys on the route
// schema config. Fastify ships a built-in `FastifySchema` with a `config?:
// Record<string, any>` field — a module-augmenting `RouteShorthandOptions`
// interface does NOT override it (the built-in wins). So the route helpers'
// `config` is already `Record<string, any>` — no augmentation needed for the
// *type*. What we need is a typed helper so the *capability value* is checked.
//
// This file provides that helper + the module augmentation for the request
// context (the `public`/`capability` read off `req.context.config`).

import type { Capability } from "../plugins/tenant.js";

export const ROUTE = {
  /** A public (no-session) route. */
  public: (capability?: Capability) => ({ public: true, ...(capability ? { capability } : {}) }),
  /** A tenant route requiring a capability. */
  requires: (capability: Capability) => ({ capability }),
} as const;

declare module "fastify" {
  interface FastifyRequestContext {
    config: {
      public?: boolean;
      capability?: Capability;
    } & Record<string, unknown>;
  }
}

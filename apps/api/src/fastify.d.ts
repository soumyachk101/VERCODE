// Fastify type augmentation: the `capability` + `public` route config keys
// (the tenant plugin reads `capability` from `req.context.config`; the auth
// plugin reads `public`). This is the single place the augmentation lives so
// every route file gets it.

import type { Capability } from "../plugins/tenant.js";

declare module "fastify" {
  interface RouteShorthandOptions {
    schema?: {
      body?: unknown;
      querystring?: unknown;
      params?: unknown;
      config?: {
        public?: boolean;
        capability?: Capability;
      };
    };
  }
}

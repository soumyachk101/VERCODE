// Fastify type augmentation: the `capability` + `public` keys on the route
// config. In Fastify 5 the route config is `req.routeOptions.config`, typed as
// `FastifyContextConfig & FastifyRouteConfig`. This augmentation adds our two
// keys to `FastifyContextConfig` so the typed reads are checked.

import type { Capability } from "../plugins/tenant.js";

declare module "fastify" {
  interface FastifyContextConfig {
    public?: boolean;
    capability?: Capability;
  }

  interface FastifySchema {
    config?: {
      public?: boolean;
      capability?: Capability;
    };
  }
}

// The entrypoint.

import { buildServer } from "./server.js";

const app = buildServer();
const port = 4000;
const host = "0.0.0.0";

app
  .listen({ port, host })
  .then(() => app.log.info(`VERCODE api listening on ${app.server.address?.()}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });

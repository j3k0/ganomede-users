import Logger, { createLogger } from "bunyan";

export const log: Logger = createLogger({
  name: "users",
  level: (process.env.LOG_LEVEL || 'info') as any
});

export default log;
// vim: ts=2:sw=2:et:

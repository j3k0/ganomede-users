/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import bunyan from "bunyan";
let log = bunyan.createLogger({
  name: "users",
  level: process.env.LOG_LEVEL || 'info'
});

// class used by elasticsearch for logging
log.ElasticLogger = class {
  constructor(config) {
    log = log;
    this.error = log.error.bind(log);
    this.warning = log.warn.bind(log);
    this.info = log.info.bind(log);
    this.debug = log.debug.bind(log);
    this.trace = (method, requestUrl, body, responseBody, responseStatus) => log.trace({
      method,
      requestUrl,
      body,
      responseBody,
      responseStatus
    });
    // bunyan's loggers do not need to be closed
    this.close = () => undefined;
  }
};

export default log;
// vim: ts=2:sw=2:et:

'use strict';

import cluster from 'cluster';
import restify from 'restify';
import restifyErrors from 'restify-errors';
import main from './main';
import log from './log';
import sendAuditStats from './send-audit-stats';
const pkg = require('../package.json');

const port: number = +(process.env.PORT || '8000');
const routePrefix: string = process.env.ROUTE_PREFIX || pkg.api;

if (cluster.isMaster) {

  // master
  log.info('running with env', process.env);
  cluster.fork();
  cluster.on('disconnect', function (worker) {
    log.error('disconnect!');
    cluster.fork();
  });
}
else {

  // worker
  const server = restify.createServer({
    handleUncaughtExceptions: true,
    log: log
  });

  const shouldLogRequest = (req) =>
        (req.url.indexOf(`/${pkg.api}/ping/_health_check`) < 0);

  const shouldLogResponse = (res) =>
        (res && res.statusCode >= 500);

  const filteredLogger = (errorsOnly, logger) => (req, res, next) => {
    const logError = errorsOnly && shouldLogResponse(res);
    const logInfo = !errorsOnly && (
            shouldLogRequest(req) || shouldLogResponse(res));
    if (logError || logInfo)
      logger(req, res);
    if (next && typeof next === 'function')
      next();
  };

  // Enable restify plugins
  server.use(restify.plugins.bodyParser());
  server.use(restify.plugins.queryParser());
  // server.use(restify.gzipResponse());

  // Audit requests at completion
  server.on('after', filteredLogger(process.env.NODE_ENV === 'production' && process.env.AUDIT_REQUESTS !== 'force',
        restify.plugins.auditLogger({log: log, body: true, event: 'after'})));

  // Send audit statistics
  server.on('after', sendAuditStats);

  // Automatically add a request-id to the response
  server.pre(restify.plugins.pre.reqIdHeaders({
    headers: ['x-request-id', 'request-id', 'cf-request-id']
  }));
  function setRequestId (req, res, next) {
    // @ts-ignore
    res.setHeader('x-request-id', req.id());
    req.log = req.log.child({req_id: req.id()});
    return next();
  }
  server.use(setRequestId);

  // Log incoming requests
  const requestLogger = filteredLogger(false, (req) =>
        req.log.info({req_id: req.id()}, `${req.method} ${req.url}`));
  server.use(requestLogger);

    // Handle uncaughtException, kill the worker
  server.on('uncaughtException', function (req, res, route, err) {

        // Log the error
    log.error(err);

        // Note: we're in dangerous territory!
        // By definition, something unexpected occurred,
        // which we probably didn't want.
        // Anything can happen now!  Be very careful!
    try {
            // make sure we close down within 30 seconds
      setTimeout(function () {
        process.exit(1);
      }, 30000);

            // stop taking new requests
      server.close();

            // Let the master know we're dead.  This will trigger a
            // 'disconnect' in the cluster master, and then it will fork
            // a new worker.
      cluster.worker.disconnect();

      res.send(new restifyErrors.InternalError(err, err.message || 'unexpected error'));
    }
    catch (err2) {
      log.error('Error sending 500!');
      log.error(err2);
    }
  });

    // Intitialize backend, add routes
  main.initialize(function () {
    main.addRoutes(routePrefix, server);

        // Start the server
    server.listen(port, function () {
      log.info(server.name + ' listening at ' + server.url);
    });
  });
}

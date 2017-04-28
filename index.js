'use strict';

require('coffee-script/register');

// Use New Relic if LICENSE_KEY has been specified.
if (process.env.NEW_RELIC_LICENSE_KEY) {
  if (!process.env.NEW_RELIC_APP_NAME) {
    const pk = require('./package.json');
    process.env.NEW_RELIC_APP_NAME = pk.api;
  }
  require('newrelic');
}

const cluster = require('cluster');
const log = require('./src/log');
const pkg = require('./package.json');

const port = +process.env.PORT || 8000;
const routePrefix = process.env.ROUTE_PREFIX || pkg.api;

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
  const restify = require('restify');
  const main = require('./src/main');

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

    // Log incoming requests
  const requestLogger = filteredLogger(false, (req) =>
        req.log.info({req_id: req.id()}, `${req.method} ${req.url}`));
  server.use(requestLogger);

    // Enable restify plugins
  server.use(restify.bodyParser());
    // server.use(restify.gzipResponse());

    // Audit requests at completion
  server.on('after', filteredLogger(process.env.NODE_ENV === 'production',
        restify.auditLogger({log: log, body: true})));

    // Automatically add a request-id to the response
  function setRequestId (req, res, next) {
    res.setHeader('x-request-id', req.id());
    req.log = req.log.child({req_id: req.id()});
    return next();
  }
  server.use(setRequestId);

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

      const InternalError = require('restify').InternalError;
      res.send(new InternalError(err, err.message || 'unexpected error'));
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

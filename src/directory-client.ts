/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//
// Talks to directory server
//

//
// DirectoryAccount: {
//   "id": string
//   aliases: {
//     "<type>": "<value>"
//     ...
//   }
//
// example DirectoryAccount:
// {"id":"aaa","aliases":{"email":"user@email.com","name":"aaa","tag":"aaa"}}
//

import restify from 'restify';

import logMod from './log';
import { CREATE, CHANGE, LOGIN } from './event-sender';

const noop = function() {};

const reduceAliases = aliases => aliases.reduce(
  function(ref, {type, value}) { ref[type] = value; return ref; },
  {}
);

const eventData = function(req_id, userId, aliases) {
  if (aliases == null) { aliases = []; }
  return {
    req_id,
    userId,
    aliases: reduceAliases(aliases)
  };
};

const createClient = function(...args) {

  let obj = args[0],
      {
        jsonClient,
        log
      } = obj,
      val = obj.apiSecret,
      apiSecret = val != null ? val : process.env.API_SECRET,
      val1 = obj.sendEvent,
      sendEvent = val1 != null ? val1 : noop;
  if (!jsonClient) {
    throw new Error('jsonClient required');
  }

  if (sendEvent === noop) {
    log.warn('Directory client created with sendEvent set to noop');
  }

  const jsonPost = (options, reqBody, cb) => jsonClient.post(options, reqBody, function(err, req, res, resBody) {
    log.debug({
      options,
      reqBody,
      req_id: (options.headers != null ? options.headers['x-request-id'] : undefined),
      resErr: err,
      resBody
    }, "directoryClient.post");
    return cb(err, req, res, resBody);
  });

  const jsonGet = (options, cb) => jsonClient.get(options, function(err, req, res, body) {
    log.debug({
      options,
      req_id: (options.headers != null ? options.headers['x-request-id'] : undefined),
      resErr: err,
      resBody: body
    }, "directoryClient.get");
    return cb(err, req, res, body);
  });

  const pathname = (jsonClient.url != null ? jsonClient.url.pathname : undefined) || '';
  log = log || logMod.child({directoryClient:pathname});
  log.info({ pathname }, "DirectoryClient created");

  const endpoint = subpath => pathname + subpath;

  const jsonOptions = function({ path, req_id }) {
    const options =
      {path: endpoint(path)};
    if (req_id) {
      options.headers =
        {"x-request-id": req_id};
    }
    return options;
  };

  const authenticate = function(credentials, callback) {

    const {
      req_id
    } = credentials;
    const options = jsonOptions({path: '/users/auth', req_id});
    const body = {
      id: credentials.id,
      password: credentials.password
    };

    return jsonPost(options, body, function(err, req, res, body) {

      if ((err != null ? err.restCode : undefined) === 'UserNotFoundError') {
        log.info({
          req_id,
          id: credentials.id,
          code: 'UserNotFoundError'
        }, "failed to authenticate");
        return callback(err);

      } else if ((res != null ? res.statusCode : undefined) === 401) {
        return callback(new restify.InvalidCredentialsError());

      } else if (err) {
        log.error({
          req_id,
          err
        }, "authentication error");
        return callback(err);

      } else if ((res != null ? res.statusCode : undefined) !== 200) {
        log.error({
          req_id,
          code: res.statusCode
        }, "failed to authenticate");
        return callback(new Error(`HTTP${res.statusCode}`));

      } else {
        sendEvent(LOGIN, eventData(req_id, credentials.id));
        return callback(null, body);
      }
    });
  };

  const addAccount = function(account, callback) {

    if (account == null) { account = {}; }
    if (!account.id || !account.password) {
      return callback(new restify.InvalidContentError(
        'Missing credentials')
      );
    }

    const options = jsonOptions({
      path: '/users',
      req_id: account.req_id
    });

    const body = {
      secret: apiSecret,
      id: account.id,
      password: account.password,
      aliases: account.aliases
    };

    return postAccount('create', options, body, function(err, bodyResult) {
      if (err) {
        return callback(err);
      }

      sendEvent(CREATE, eventData(account.req_id, account.id, account.aliases));
      return callback(null, bodyResult);
    });
  };

  const editAccount = function(account, callback) {

    if (account == null) { account = {}; }
    if (!account.id) {
      return callback(new restify.InvalidContentError(
        'Missing account id')
      );
    }

    const options = jsonOptions({
      path: "/users/id/" + encodeURIComponent(account.id),
      req_id: account.req_id
    });

    const body = {secret: apiSecret};
    let triggerChangeEvent = false;

    if (account.password) {
      body.password = account.password;
    } else if (account.aliases && account.aliases.length) {
      body.aliases = account.aliases;
      triggerChangeEvent = true;
    } else {
      return callback(new restify.InvalidContentError(
        'Nothing to change')
      );
    }

    return postAccount("edit", options, body, function(err, bodyResult) {
      if (err) {
        return callback(err);
      }

      if (triggerChangeEvent) {
        sendEvent(CHANGE, eventData(account.req_id, account.id, body.aliases));
      }

      return callback(null, bodyResult);
    });
  };

  var postAccount = (description, options, body, callback) => jsonPost(options, body, function(err, req, res, body) {
    if (err) {
      return callback(err);
    } else if (res.statusCode !== 200) {
      log.error({code: res.statusCode}, `failed to ${description} account`);
      return callback(new Error(`HTTP${res.statusCode}`));
    } else if (!body) {
      return callback(new restify.InvalidContentError(
        'Server replied with no data')
      );
    } else {
      return callback(null, body);
    }
  });

  const processGetResponse = callback => (function(err, req, res, body) {
    if (err) {
      return callback(err);
    } else if (res.statusCode !== 200) {
      return callback(new Error(`HTTP${res.statusCode}`));
    } else if (!body) {
      return callback(new restify.InvalidContentError(
        'Server replied with no data')
      );
    } else {
      return callback(null, body);
    }
  });

  const byAlias = function({ type, value, req_id }, callback) {

    const options = jsonOptions({
      path: ("/users/alias/" +
        encodeURIComponent(type) + "/" +
        encodeURIComponent(value)),
      req_id
    });
    return jsonGet(options, processGetResponse(callback));
  };

  // callback(err, DirectoryAccount)
  const byToken = function({ token, req_id }, callback) {

    const options = jsonOptions({
      path: "/users/auth/" + encodeURIComponent(token),
      req_id
    });
    return jsonGet(options, processGetResponse(callback));
  };

  // callback(err, DirectoryAccount)
  const byId = function({ id, req_id }, callback) {

    const options = jsonOptions({
      path: "/users/id/" + encodeURIComponent(id),
      req_id
    });
    return jsonGet(options, processGetResponse(callback));
  };

  return { endpoint, authenticate, addAccount, byId, byAlias, byToken, editAccount };
};

export default { createClient };
// vim: ts=2:sw=2:et:

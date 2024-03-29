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

export interface DirectoryAlias {
  type: string;
  value: string;
  public?: boolean;
}

import restifyErrors from 'restify-errors';

import logMod from './log';
import { USERS_EVENTS_CHANNEL, CREATE, CHANGE, LOGIN, EventSender, DirectoryEventData, AliasesDictionary } from './event-sender';
import { Request, Response } from 'restify';
import { Req } from './backend/directory';
import { JsonClientOptions, jsonClientRetry } from './json-client-retry';

const noop = function() {};

function reduceAliases(aliases: DirectoryAlias[]): AliasesDictionary {
  return aliases.reduce(function (ref: AliasesDictionary, alias: DirectoryAlias): AliasesDictionary {
    ref[alias.type] = alias.value;
    return ref;
  }, {});
}

function eventData(req_id: string | undefined, userId: string, aliases?: DirectoryAlias[]): DirectoryEventData {
  if (!aliases) { aliases = []; }
  return {
    req_id,
    userId,
    aliases: reduceAliases(aliases)
  };
};

export interface DirectoryIdRequest {
  id: string;
  req_id?: string;
  secret?: string;
}

export interface DirectoryAliasRequest {
  type: string;
  value: string;
  req_id?: string;
}

export interface DirectoryTokenRequest {
  token: string;
  req_id?: string;
}

export interface DirectoryCredentials {
  id: string;
  password: string;
  req_id?: string;
}

export interface DirectoryAuthResult {
  id: string;
  token: string;
}

export interface DirectoryPostAccount {
  /** user identifier */
  id: string;
  /** Only specified for updating or creating an account, never returned */
  password?: string;
  /** List of aliases */
  aliases?: DirectoryAlias[];
};

export interface DirectoryGetAccount {
  /** user identifier */
  id: string;
  /** List of aliases */
  aliases: {
    [type: string]: string;
  }
};

export type DirectoryAuthCallback = (err: Error | null, authResult?: DirectoryAuthResult) => void;

export interface DirectoryClient {
  endpoint: (subpath: string) => string;
  authenticate: (credentials: DirectoryCredentials, callback: DirectoryAuthCallback) => void;
  addAccount: (account: Req<DirectoryPostAccount>, callback:DirectoryCallback) => void;
  byId: (options: DirectoryIdRequest, callback:DirectoryCallback) => void;
  byAlias: (options: DirectoryAliasRequest, callback:DirectoryCallback) => void;
  byToken: (options: DirectoryTokenRequest, callback:DirectoryCallback) => void;
  editAccount: (account: Req<DirectoryPostAccount>, callback) => void;
}

export type DirectoryCallback = (err:restifyErrors.HttpError|null, body:DirectoryGetAccount) => void; 

const createClient = function(options): DirectoryClient {

  const jsonClient = options.jsonClient;
  const apiSecret = options.apiSecret ?? process.env.API_SECRET;
  const sendEvent: EventSender = options.sendEvent ?? noop;
  if (!jsonClient) {
    throw new Error('jsonClient required');
  }
  const pathname = jsonClient.url?.pathname ?? '';
  const log = options.log || logMod.child({directoryClient: pathname});

  if (sendEvent === noop) {
    log.warn('Directory client created with sendEvent set to noop');
  }

  const jsonClientR = /* jsonClientRetry(jsonClient) */ jsonClient;

  const jsonPost = (options: JsonClientOptions & { retry: boolean }, reqBody, cb) => {
    const retry = options.retry;
    const jsonOptions = {
      log: log.child({ req_id: (options.headers != null ? options.headers['x-request-id'] : undefined) }),
      path: options.path,
      headers: options.headers,
    };
    (options.retry ? jsonClientR : jsonClient).post(
      jsonOptions,
      reqBody,
      function (err, req, res, resBody) {
        log.debug({
          options,
          reqBody,
          req_id: (options.headers != null ? options.headers['x-request-id'] : undefined),
          resErr: err,
          resBody
        }, "directoryClient.post");
        return cb(err, req, res, resBody);
      });
  }

  const jsonGet = (options, cb) => {
    const jsonOptions = {
      path: options.path,
      headers: options.headers,
      query: options.query,
      log: log.child({ req_id: (options.headers != null ? options.headers['x-request-id'] : undefined) }),
    };
    jsonClientR.get(jsonOptions, function (err, req, res, body) {
      log.debug({
        req_id: (options.headers != null ? options.headers['x-request-id'] : undefined),
        options,
        resErr: err,
        resBody: body
      }, "directoryClient.get");
      return cb(err, req, res, body);
    });
  }

  log.info({ pathname }, "DirectoryClient created");

  const endpoint = subpath => pathname + subpath;

  const jsonOptions = function({ path, req_id, secret }: { path: string, req_id?: string, secret?: string }): {
    path: string;
    headers?: object;
    query?: object;
  } {
    const options: any =
      {path: endpoint(path)};
    if (req_id) {
      options.headers =
        {"x-request-id": req_id};
    }
    if (secret) {
      options.query = { ...(options.query || {}), secret };
    }
    return options;
  };

  const authenticate = function(credentials: DirectoryCredentials, callback: DirectoryAuthCallback) {

    const {
      req_id
    } = credentials;
    const options = {
      ...jsonOptions({path: '/users/auth', req_id}),
      retry: true
    };
    const body = {
      id: credentials.id,
      password: credentials.password
    };

    return jsonPost(options, body, function(err: any, req: Request, res: Response, body) {

      if ((err != null ? err.restCode : undefined) === 'UserNotFoundError') {
        log.info({
          req_id,
          id: credentials.id,
          code: 'UserNotFoundError'
        }, "failed to authenticate");
        callback(err);

      } else if ((res != null ? res.statusCode : undefined) === 401) {
        callback(new restifyErrors.InvalidCredentialsError());
      } else if (err) {
        log.warn({
          req_id,
          err
        }, "authentication error");
        callback(err);
      } else if ((res != null ? res.statusCode : undefined) !== 200) {
        log.warn({
          req_id,
          code: res.statusCode
        }, "failed to authenticate");
        callback(new Error(`HTTP${res.statusCode}`));

      } else {
        sendEvent(USERS_EVENTS_CHANNEL, LOGIN, eventData(req_id, credentials.id));
        callback(null, body);
      }
    });
  };

  const addAccount = function(account, callback) {

    if (account == null) { account = {}; }
    if (!account.id || !account.password) {
      return callback(new restifyErrors.InvalidContentError(
        'Missing credentials')
      );
    }

    const options = {
      ...jsonOptions({
        path: '/users',
        req_id: account.req_id
      }),
      retry: true,
    };

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

      sendEvent(USERS_EVENTS_CHANNEL, CREATE, eventData(account.req_id, account.id, account.aliases));
      return callback(null, bodyResult);
    });
  };

  const editAccount = function(account, callback) {

    if (account == null) { account = {}; }
    if (!account.id) {
      return callback(new restifyErrors.InvalidContentError(
        'Missing account id')
      );
    }

    const options = {
      ...jsonOptions({
        path: "/users/id/" + encodeURIComponent(account.id),
        req_id: account.req_id
        }),
      retry: true,
    };

    const body: any = {secret: apiSecret};
    let triggerChangeEvent = false;

    if (account.password) {
      body.password = account.password;
    } else if (account.aliases && account.aliases.length) {
      body.aliases = account.aliases;
      triggerChangeEvent = true;
    } else {
      return callback(new restifyErrors.InvalidContentError(
        'Nothing to change')
      );
    }

    return postAccount("edit", options, body, function(err, bodyResult) {
      if (err) {
        return callback(err);
      }

      if (triggerChangeEvent) {
        sendEvent(USERS_EVENTS_CHANNEL, CHANGE, eventData(account.req_id, account.id, body.aliases));
      }

      return callback(null, bodyResult);
    });
  };

  var postAccount = (description, options: JsonClientOptions & { retry: boolean; }, body, callback) =>
    jsonPost(options, body, function (err, req, res, body) {
      if (err) {
        return callback(err);
      } else if (res.statusCode !== 200) {
        log.error({ code: res.statusCode }, `failed to ${description} account`);
        return callback(new Error(`HTTP${res.statusCode}`));
      } else if (!body) {
        return callback(new restifyErrors.InvalidContentError(
          'Server replied with no data')
        );
      } else {
        return callback(null, body);
      }
    });

  const processGetResponse = (callback) => (function(err, req, res, body) {
    if (err) {
      return callback(err);
    } else if (res.statusCode !== 200) {
      return callback(new Error(`HTTP${res.statusCode}`));
    } else if (!body) {
      return callback(new restifyErrors.InvalidContentError(
        'Server replied with no data')
      );
    } else {
      return callback(null, body);
    }
  });

  const byAlias = function({ type, value, req_id }: DirectoryAliasRequest, callback) {

    const options = jsonOptions({
      path: ("/users/alias/" +
        encodeURIComponent(type) + "/" +
        encodeURIComponent(value)),
      req_id
    });
    return jsonGet(options, processGetResponse(callback));
  };

  // callback(err, DirectoryAccount)
  const byToken = function({ token, req_id }: DirectoryTokenRequest, callback) {

    const options = jsonOptions({
      path: "/users/auth/" + encodeURIComponent(token),
      req_id
    });
    return jsonGet(options, processGetResponse(callback));
  };

  // callback(err, DirectoryAccount)
  const byId = function({ id, req_id, secret }: DirectoryIdRequest, callback) {

    const options = jsonOptions({
      path: "/users/id/" + encodeURIComponent(id),
      secret,
      req_id
    });
    return jsonGet(options, processGetResponse(callback));
  };

  return { endpoint, authenticate, addAccount, byId, byAlias, byToken, editAccount };
};

export default { createClient };
// vim: ts=2:sw=2:et:

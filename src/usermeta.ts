/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import restifyClients from "restify-clients";
import restifyErrors, { HttpError } from "restify-errors";
import redis, { RedisClient } from "redis";
import urllib from 'url';
import logMod from "./log";
export const log = logMod.child({module:"usermeta"});
import tagizer from 'ganomede-tagizer';
import validator from './validator';
import { AuthdbClient } from "./authentication";
import { DirectoryClient } from "./directory-client";
import { Request, Response } from "restify";
import { callback } from "testdouble";
import { jsonClientRetry } from "./json-client-retry";

export interface UsermetaClientOptions {
  username: string;
  req_id?: string;
  apiSecret?: string;
  authToken?: string;
  tag?: string;
  name?: string;
  email?: string;
}

export type UsermetaClientCallback = (err:Error|null, reply?:string|null) => void;

export interface SimpleUsermetaClient {
  set: (params:UsermetaClientOptions|string, key:string, value:string, callback:UsermetaClientCallback, maxLength?:number) => void;
  get: (params:UsermetaClientOptions|string, key:string, callback:UsermetaClientCallback) => void;
};

export interface RestrictedUsermetaClient extends SimpleUsermetaClient {
  validKeys?: { [key: string]: boolean; };
  isValid(key: string): boolean;
}

export interface ProtectedUsermetaClient extends RestrictedUsermetaClient {
  isReadOnly(key: string): boolean;
  isWriteOnly(key: string): boolean;
};

export type UsermetaClient = SimpleUsermetaClient | RestrictedUsermetaClient | ProtectedUsermetaClient;

const DEFAULT_MAX_LENGTH:number = 1000;

const parseParams = function(obj:UsermetaClientOptions|string):UsermetaClientOptions {
  if (typeof obj === 'string') {
    return {
      username: obj
    };
  }
  else {
    return obj;
  }
};

// Design:
//
// Lets have 2 implementations of a usermeta client:
//  * GanomedeUsermeta will use ganomede-usermeta
//    (instanced twice -- local and central)
//  * DirectoryAliases will use ganomede-directory aliases
//
// Then create a UsermetaRouter that sends requests to the appropriate client
//

// DirectoryAliases* stores metadata as aliases in the directory client.
//
// * all behave as a protected metatata.
//     * read & write requires authToken
// * 'name' behave as a public metadata.
//     * only write requires authToken
// * 'password' is write only
//
// It supports changing 'name', 'email' and 'password'
//


// Code shared between DirectoryAliases implementations
var directory = {

  // The user isn't in the directory, but might be in Stormpath.
  // In stormpath, 'name' and 'username' are the same. 'email'
  // was stored in the authdb. So we have some fallbacks.
  userNotFound: {
    password(_authdbClient:AuthdbClient, params:UsermetaClientOptions, cb:UsermetaClientCallback) {
      return cb(new restifyErrors.NotAuthorizedError({
        code: 'NotAuthorizedError',
        message: "Forbidden"
      }));
    },
    name(_authdbClient:AuthdbClient, params:UsermetaClientOptions, cb:UsermetaClientCallback) {
      return cb(null, (params.name || params.username));
    },
    tag(_authdbClient:AuthdbClient, params:UsermetaClientOptions, cb:UsermetaClientCallback) {
      return cb(null, tagizer.tag(params.tag || params.username));
    },
    email(authdbClient:AuthdbClient, params:UsermetaClientOptions, cb:UsermetaClientCallback) {
      if (params.email) {
        return cb(null, params.email);
      }
      // stormpath users might have their emails in the authdb
      if (authdbClient && params.authToken) {
        return authdbClient.getAccount(params.authToken,
          (err, account) => cb(err, account != null ? account.email : undefined));
      } else {
        return cb(new restifyErrors.NotFoundError({
          message: "no email",
          code: 'NotFoundError'
        }));
      }
    }
  },

  // handles replies from directoryClient's read requests
  handleResponse(authdbClient:AuthdbClient, params:UsermetaClientOptions, key:string, cb:UsermetaClientCallback) { return function(err, account) {

    if (err) {

      // the user isn't in the directory,
      if (err.restCode === 'UserNotFoundError') {
        // let's attempt some fallback.
        if (directory.userNotFound[key]) {
          return directory.userNotFound[key](
            authdbClient, params, cb);
        }
      }

      // unexpectde error, or no fallback
      log.error({err, req_id: params.req_id},
        "directoryClient.get failed");
      return cb(err, null);

    // all but username stored as aliases
    } else if (key === 'username') {
      return cb(null, (account.id || null));
    } else {
      return cb(null, (account.aliases[key] || null));
    }
  }; },

  publicAlias: {
    username: true,
    name: true,
    tag: true
  },

  invalidValue: {
    email(email) { return !validator.email(email); },
    name(name) { return !validator.name(name); },
    password(value) { return !validator.password(value); }
  },

  beforeEdit: {
    // change the tag before changing the name
    name(directoryClient:DirectoryClient, params:UsermetaClientOptions, _key:string, value:string, cb:UsermetaClientCallback) {
      const account = directory.account(params, "tag", tagizer.tag(value));
      directoryClient.editAccount(account, cb);
    },
    // tag and username are read-only
    tag(_directoryClient:DirectoryClient, _params:UsermetaClientOptions, _key:string, _value:string, cb:UsermetaClientCallback) {
      cb(new restifyErrors.NotAuthorizedError({
        message: "tag is read-only",
        code: 'NotAuthorizedError'
      }));
    },
    username(_directoryClient:DirectoryClient, _params:UsermetaClientOptions, _key:string, _value:string, cb:UsermetaClientCallback) {
      cb(new restifyErrors.NotAuthorizedError({
        message: "username is read-only",
        code: 'NotAuthorizedError'
      }));
    }
  },

  // create a directory account object suitable for POSTing
  account(params:UsermetaClientOptions, key:string, value:string) {
    if (key === 'password') {
      return {
        id: params.username,
        password: value,
        req_id: params.req_id
      };
    } else {
      return {
        id: params.username,
        aliases: [{
          public: !!directory.publicAlias[key],
          type: key,
          value
        }],
        req_id: params.req_id
      };
    }
  },

  set(directoryClient:DirectoryClient, options:UsermetaClientOptions|string, key:string, value:string, cb:UsermetaClientCallback) {
    const params = parseParams(options);
    if (!params.authToken) {
      return cb(new restifyErrors.NotAuthorizedError({
        message: "Protected meta",
        code: 'NotAuthorizedError'
      }));
    }

    // special cases:
    //  * 'email', 'name', 'password' have to be valid
    //  * 'name' also changes 'tag'
    if (typeof directory.invalidValue[key] === 'function' ? directory.invalidValue[key](value) : undefined) {
      return cb(new restifyErrors.InvalidContentError({
        message: `${key} is invalid`,
        code: 'InvalidContentError'
      }));
    }

    const passTrough = (_directoryClient, _params, _key, _value, cb) => cb(null);
    const beforeEdit = directory.beforeEdit[key] || passTrough;
    return beforeEdit(directoryClient, params, key, value, function(err) {
      if (err) {
        return cb(err);
      }
      return directoryClient.editAccount(directory.account(params, key, value), cb);
    });
  }
};

// Stores "protected" metadata as directory account aliases
class DirectoryAliasesProtected implements ProtectedUsermetaClient {

  type: string;
  directoryClient: DirectoryClient;
  authdbClient: AuthdbClient;
  validKeys: {
    [key: string]: boolean;
  };

  constructor(directoryClient:DirectoryClient, authdbClient:AuthdbClient) {
    this.directoryClient = directoryClient;
    this.authdbClient = authdbClient;
    this.validKeys = {
      email: true, name: true, tag: true,
      username: true, password: true};
    this.type = "DirectoryAliasesProtected";
  }

  isValid(key:string):boolean { return !!this.validKeys[key]; }
  isReadOnly(key:string):boolean { return key === "tag"; }
  isWriteOnly(key:string):boolean { return key === "password"; }

  set(params:UsermetaClientOptions|string, key:string, value:string, cb:UsermetaClientCallback) {
    if (!this.isValid(key) || this.isReadOnly(key)) {
      return cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError'
      }));
    }
    return directory.set(this.directoryClient, params, key, value, cb);
  }

  get(params:UsermetaClientOptions|string, key:string, cb:UsermetaClientCallback) {
    if (!this.isValid(key) || this.isWriteOnly(key)) {
      return cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError'
      }));
    }
    params = parseParams(params);
    // protected metadata require an authToken for reading
    if (!params.authToken) {
      return cb(new restifyErrors.NotAuthorizedError({
        message: "Protected meta",
        code: 'NotAuthorizedError'
      }));
    }
    if (params[key]) {
      return cb(null, params[key]);
    }
    const account = {
      token: params.authToken,
      req_id: params.req_id
    };
    return this.directoryClient.byToken(account,
      directory.handleResponse(this.authdbClient, params, key, cb));
  }
}

// Stores "public" metadata as directory account aliases
class DirectoryAliasesPublic {

  type: string;
  directoryClient: DirectoryClient;
  authdbClient: AuthdbClient;
  validKeys: {
    [key: string]: boolean;
  };

  constructor(directoryClient:DirectoryClient, authdbClient:AuthdbClient) {
    this.directoryClient = directoryClient;
    this.authdbClient = authdbClient;
    this.validKeys = {name: true, tag: true, username: true};
    this.type = "DirectoryAliasesPublic";
  }

  isValid(key:string):boolean { return !!this.validKeys[key]; }

  set(params:UsermetaClientOptions|string, key:string, value:string, cb:UsermetaClientCallback) {
    if (!this.isValid(key)) {
      return cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError'
      }));
    }
    return directory.set(this.directoryClient, params, key, value, cb);
  }

  get(params:UsermetaClientOptions|string, key:string, cb:UsermetaClientCallback) {
    if (!this.isValid(key)) {
      return cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError',
      }));
    }
    params = parseParams(params);
    if (params[key]) {
      return cb(null, params[key]);
    }
    const account = {
      id: params.username,
      req_id: params.req_id
    };
    return this.directoryClient.byId(account,
      directory.handleResponse(this.authdbClient, params, key, cb));
  }
}

// Stores "public" metadata in redis
class RedisUsermeta implements RestrictedUsermetaClient {

  type: string;
  validKeys?: {
    [key: string]: boolean;
  };
  redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    this.redisClient = redisClient;
    this.type = "RedisUsermeta";
    this.validKeys = undefined;
    if (process.env.USERMETA_VALID_KEYS) {
      const keys = process.env.USERMETA_VALID_KEYS.split(",");
      this.validKeys = {};
      for (let key of Array.from(keys)) {
        this.validKeys[key] = true;
      }
    }
  }

  set(params:UsermetaClientOptions|string, key:string, value:string, cb:UsermetaClientCallback, maxLength?:number) {
    if (maxLength == null) { maxLength = DEFAULT_MAX_LENGTH; }
    const {username} = parseParams(params);
    if (maxLength > 0 && value?.length > maxLength) {
      cb(new restifyErrors.BadRequestError({
        code: 'BadRequestError',
        message: "Value too large"
      }));
    }
    else if (!this.isValid(key)) {
      cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError'
      }));
    }
    else {
      this.redisClient.set(`${username}:${key}`, value, (err, reply) => cb(err, reply));
    }
  }

  get(params:UsermetaClientOptions|string, key:string, cb:UsermetaClientCallback) {
    const {username} = parseParams(params);
    return this.redisClient.get(`${username}:${key}`, (err, reply) => cb(err, reply));
  }

  isValid(key:string):boolean {
    if ((this.validKeys === undefined) || (this.validKeys[key])) { return true; } else { return false; }
  }
}

const endpoint = (subpath:string) => `/usermeta/v1${subpath}`;
const jsonOptions = function({ path, req_id }) {
  const options: {
    path: string;
    headers?: any;
  } = {
    path: endpoint(path)
  };
  if (req_id) {
    options.headers =
      {"x-request-id": req_id};
  }
  return options;
};

const authPath = function(params:UsermetaClientOptions):string {
  if (params.apiSecret) {
    return `/auth/${encodeURIComponent(params.apiSecret)}.${encodeURIComponent(params.username)}`;
  } else if (params.authToken) {
    return `/auth/${encodeURIComponent(params.authToken)}`;
  } else {
    return `/${encodeURIComponent(params.username)}`;
  }
};

// Stores metadata in ganomede-usermeta
// ganomede-usermeta server will take care of key validation
class GanomedeUsermeta implements SimpleUsermetaClient {

  jsonClient: any;
  type: string;

  constructor(jsonClient) {
    this.jsonClient = jsonClient;
    this.type = "GanomedeUsermeta";
  }

  set(pparams:string|UsermetaClientOptions, key:string, value:string, cb:UsermetaClientCallback) {
    const params = parseParams(pparams);
    const { url } = this.jsonClient;
    const options = {
      ...jsonOptions({
        path: authPath(params) + `/${encodeURIComponent(key)}`,
        req_id: params.req_id,
      }),
      log: log.child({ req_id: params.req_id, url })
    };
    const body = { value };
    jsonClientRetry(this.jsonClient).post(options, body, function (err: HttpError | null | undefined, _req, _res, body: string | null | undefined) {
      if (err) {
        log.error({ req_id: params.req_id,
          err, url, options, body, value },
          "GanomedeUsermeta.post failed");
        return cb(err, null);
      } else {
        return cb(null, body);
      }
    });
  }

  get(pparams:string|UsermetaClientOptions, key:string, cb:UsermetaClientCallback) {
    const params = parseParams(pparams);
    const url = this.jsonClient.url;
    const options = {
      ...jsonOptions({
        path: authPath(params) + `/${encodeURIComponent(key)}`,
        req_id: params.req_id
      }),
      log: log.child({ req_id: params.req_id, url })
    };
    jsonClientRetry(this.jsonClient).get(
      options,
      (err: HttpError | null, _req: Request, _res: Response, body?: object | null) => {
        if (err) {
          log.error({err, url, options, body, req_id: params.req_id}, "GanomedeUsermeta.get failed");
          cb(err, null);
        } else {
          const metadata:object = body ? body[params.username] : {};
          cb(err, metadata ? metadata[key] || null : null);
        }
      }
    );
  }
}

interface UsermetaRouterOptions {
  directoryPublic: any,
  directoryProtected: any,
  ganomedeCentral: UsermetaClient,
  ganomedeLocal: UsermetaClient
};

// Routes metadata to one of its children
//
// For now, no complex genericity,
// it's just hard-coded routes for our use case.
//
//  - 'name' -> DirectoryAliasesPublic
//  - 'email' -> DirectoryAliasesProtected
//  - 'password' -> DirectoryAliasesProtected
//  - 'country' -> GanomedeUsermeta.Central
//  - 'yearofbirth' -> GanomedeUsermeta.Central
//  - * -> GanomedeUsermeta.Local
class UsermetaRouter {

  type: string;
  directoryPublic: any;
  directoryProtected: any;
  ganomedeCentral: UsermetaClient;
  ganomedeLocal: UsermetaClient;
  routes: any;

  constructor({
    directoryPublic,
    directoryProtected,
    ganomedeCentral,
    ganomedeLocal
  }: UsermetaRouterOptions) {
    this.directoryPublic = directoryPublic;
    this.directoryProtected = directoryProtected;
    this.ganomedeCentral = ganomedeCentral;
    this.ganomedeLocal = ganomedeLocal;
    this.type = "UsermetaRouter";
    this.routes = {
      username: this.directoryPublic || this.directoryProtected,
      name: this.directoryPublic || this.directoryProtected,
      tag: this.directoryPublic || this.directoryProtected,
      email: this.directoryProtected,
      password: this.directoryProtected,
      country: this.ganomedeCentral,
      yearofbirth: this.ganomedeCentral
    };
  }

  set(params:UsermetaClientOptions|string, key:string, value:string, cb:UsermetaClientCallback) {
    params = parseParams(params);
    const client = this.routes[key] || this.ganomedeLocal;
    return client.set(params, key, value, cb);
  }

  get(params:UsermetaClientOptions|string, key:string, cb:UsermetaClientCallback) {
    params = parseParams(params);
    const client = this.routes[key] || this.ganomedeLocal;
    return client.get(params, key, cb);
  }
}

export default {
  create(config): UsermetaClient {

    // Linked with a ganomede-usermeta jsonClient
    if (config.ganomedeClient) {
      return new GanomedeUsermeta(config.ganomedeClient);
    }
    if (config.ganomedeConfig) {
      return new GanomedeUsermeta(restifyClients.createJsonClient({
        url: urllib.format({
          protocol: config.ganomedeConfig.protocol || 'http',
          hostname: config.ganomedeConfig.host,
          port:     config.ganomedeConfig.port,
          pathname: config.ganomedeConfig.pathname || 'usermeta/v1'
        })
      })
      );
    }

    // Linked with redis
    if (config.redisClient) {
      return new RedisUsermeta(config.redisClient);
    }
    if (config.redisConfig) {
      return new RedisUsermeta(redis.createClient(
        config.redisConfig.port,
        config.redisConfig.host,
        config.redisConfig.options)
      );
    }

    // Linked with a ganomede-directory client
    // (see directory-client.coffee)
    if (config.directoryClient && (config.mode === 'public')) {
      return new DirectoryAliasesPublic(
        config.directoryClient, config.authdbClient);
    }
    if (config.directoryClient) {
      return new DirectoryAliasesProtected(
        config.directoryClient, config.authdbClient);
    }

    // Create a usermeta router
    // ganomedeLocal is required, other children are optional
    if (config.router && config.router.ganomedeLocal) {
      return new UsermetaRouter(config.router);
    }

    throw new Error("usermeta is missing valid config");
  }
};

// vim: ts=2:sw=2:et:

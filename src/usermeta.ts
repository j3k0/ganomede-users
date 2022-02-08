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
export const log = logMod.child({ module: "usermeta" });
import tagizer from 'ganomede-tagizer';
import validator from './validator';
import { AuthdbClient } from "./authentication";
import { DirectoryClient, DirectoryIdRequest } from "./directory-client";
import { Request, Response } from "restify";
import { jsonClientRetry } from "./json-client-retry";
import Logger from "bunyan";
import async, { AsyncFunction } from 'async';

export interface UsermetaClientBaseOptions {
  req_id?: string;
  apiSecret?: string;
  log?: Logger;
}

export interface UsermetaClientSingleOptions extends UsermetaClientBaseOptions {
  authToken?: string;
  tag?: string;
  name?: string;
  email?: string;
  username: string;
};

export interface UsermetaClientBulkOptions extends UsermetaClientBaseOptions {
  usernames: string[];
};

export type KeyValue = {
  key: string,
  value: string,
};
export type UsernameKeyValue = {
  username: string,
  key: string,
  value: string | null,
};

export type BuildTask = AsyncFunction<UsernameKeyValue[], Error | null>;
export type BuildTasksFactory = (clientObj, _keys: string[]) => BuildTask[];

export type UsermetaClientCallback = (err: Error | null, reply?: string | null) => void;
export type UsermetaClientGetBulkCallback = (err: Error | null, reply?: UsernameKeyValue[]) => void;

export interface SimpleUsermetaClient {
  type: string;
  set: (params: UsermetaClientSingleOptions | string, key: string, value: string, callback: UsermetaClientCallback, maxLength?: number) => void;
  get: (params: UsermetaClientSingleOptions | string, key: string, callback: UsermetaClientCallback) => void;
  getBulk: (params: UsermetaClientBulkOptions, keys: string[], cb: UsermetaClientGetBulkCallback) => void;
  getBulkForUser: (pparams: UsermetaClientSingleOptions, keys: string[], cb: UsermetaClientGetBulkCallback) => void;
};

export abstract class BulkedUsermetaClient {

  abstract set(params: UsermetaClientSingleOptions | string, key: string, value: string, callback: UsermetaClientCallback, maxLength?: number): void
  abstract get(params: UsermetaClientSingleOptions | string, key: string, callback: UsermetaClientCallback): void;

  getBulkForUser(pparams: UsermetaClientSingleOptions, keys: string[], cb: UsermetaClientGetBulkCallback) {
    const tasks: AsyncFunction<UsernameKeyValue, Error | null>[] =
      keys.map((key) => cb2 => this.get(pparams, key, (err: Error | null, reply?: string | null) => {
        if (err) {
          // in bulk mode, errors are just logged
          log.warn({ req_id: pparams.req_id }, 'Failed to fetch protected metadata ' + key);
          return cb2(null, { username: pparams.username, key, value: null });
        }
        cb2(err, {
          username: pparams.username,
          key,
          value: typeof reply === 'string' ? reply : null
        });
      }));

    async.parallel(tasks, (err, data) => {
      if (err) {
        cb(err, []);
      }
      else {
        //make the 2 levels array to 1 level => [[], [], []] => []
        // const oneLevelArray = data?.flat();
        cb(null, data as UsernameKeyValue[]);
      }
    });
  }

  getBulk(pparams: UsermetaClientBulkOptions, keys: string[], cb: UsermetaClientGetBulkCallback) {
    const usernames = pparams.usernames;
    const tasks: AsyncFunction<UsernameKeyValue[], Error | null>[] =
      usernames.map((username) => {
        return cb2 => this.getBulkForUser({ ...pparams, username }, keys, cb2);
      });

    async.parallel(tasks, (err, data) => {
      if (err)
        return cb(err, []);
      const flat = (data || []).flat();
      cb(null, flat as UsernameKeyValue[]);
    });
  }
}

export interface RestrictedUsermetaClient extends SimpleUsermetaClient {
  validKeys?: { [key: string]: boolean; };
  isValid(key: string): boolean;
}

export interface ProtectedUsermetaClient extends RestrictedUsermetaClient {
  isReadOnly(key: string): boolean;
  isWriteOnly(key: string): boolean;
};

export type UsermetaClient = SimpleUsermetaClient | /*BulkedUsermetaClient |*/ RestrictedUsermetaClient | ProtectedUsermetaClient;

const DEFAULT_MAX_LENGTH: number = 1000;

const parseParams = function (obj: UsermetaClientSingleOptions | string): UsermetaClientSingleOptions {
  if (typeof obj === 'string') {
    return {
      username: obj
    };
  }
  else {
    return obj as UsermetaClientSingleOptions;
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
    password(_authdbClient: AuthdbClient, params: UsermetaClientSingleOptions, cb: UsermetaClientCallback) {
      return cb(new restifyErrors.NotAuthorizedError({
        code: 'NotAuthorizedError',
        message: "Forbidden"
      }));
    },
    name(_authdbClient: AuthdbClient, params: UsermetaClientSingleOptions, cb: UsermetaClientCallback) {
      return cb(null, (params.name || params.username));
    },
    tag(_authdbClient: AuthdbClient, params: UsermetaClientSingleOptions, cb: UsermetaClientCallback) {
      return cb(null, tagizer.tag(params.tag || params.username));
    },
    email(authdbClient: AuthdbClient, params: UsermetaClientSingleOptions, cb: UsermetaClientCallback) {
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
  handleResponse(authdbClient: AuthdbClient, params: UsermetaClientSingleOptions, key: string, cb: UsermetaClientCallback) {
    return function (err, account) {

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
        log.error({ err, req_id: params.req_id },
          "directoryClient.get failed");
        return cb(err, null);

        // all but username stored as aliases
      } else if (key === 'username') {
        return cb(null, (account.id || null));
      } else {
        return cb(null, (account.aliases[key] || null));
      }
    };
  },

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
    name(directoryClient: DirectoryClient, params: UsermetaClientSingleOptions, _key: string, value: string, cb: UsermetaClientCallback) {
      const account = directory.account(params, "tag", tagizer.tag(value));
      directoryClient.editAccount(account, cb);
    },
    // tag and username are read-only
    tag(_directoryClient: DirectoryClient, _params: UsermetaClientSingleOptions, _key: string, _value: string, cb: UsermetaClientCallback) {
      cb(new restifyErrors.NotAuthorizedError({
        message: "tag is read-only",
        code: 'NotAuthorizedError'
      }));
    },
    username(_directoryClient: DirectoryClient, _params: UsermetaClientSingleOptions, _key: string, _value: string, cb: UsermetaClientCallback) {
      cb(new restifyErrors.NotAuthorizedError({
        message: "username is read-only",
        code: 'NotAuthorizedError'
      }));
    }
  },

  // create a directory account object suitable for POSTing
  account(params: UsermetaClientSingleOptions, key: string, value: string) {
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

  set(directoryClient: DirectoryClient, options: UsermetaClientSingleOptions | string, key: string, value: string, cb: UsermetaClientCallback) {
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
    return beforeEdit(directoryClient, params, key, value, function (err) {
      if (err) {
        return cb(err);
      }
      return directoryClient.editAccount(directory.account(params, key, value), cb);
    });
  }
};

// Stores "protected" metadata as directory account aliases
class DirectoryAliasesProtected extends BulkedUsermetaClient implements ProtectedUsermetaClient {

  type: string;
  directoryClient: DirectoryClient;
  authdbClient: AuthdbClient;
  validKeys: {
    [key: string]: boolean;
  };

  constructor(directoryClient: DirectoryClient, authdbClient: AuthdbClient) {
    super();
    this.directoryClient = directoryClient;
    this.authdbClient = authdbClient;
    this.validKeys = {
      email: true, name: true, tag: true,
      username: true, password: true
    };
    this.type = "DirectoryAliasesProtected";
  }

  isValid(key: string): boolean { return !!this.validKeys[key]; }
  isReadOnly(key: string): boolean { return key === "tag"; }
  isWriteOnly(key: string): boolean { return key === "password"; }

  set(params: UsermetaClientSingleOptions | string, key: string, value: string, cb: UsermetaClientCallback) {
    if (!this.isValid(key) || this.isReadOnly(key)) {
      return cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError'
      }));
    }
    return directory.set(this.directoryClient, params, key, value, cb);
  }

  get(pparams: UsermetaClientSingleOptions | string, key: string, cb: UsermetaClientCallback) {
    if (!this.isValid(key) || this.isWriteOnly(key)) {
      return cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError'
      }));
    }
    const params = parseParams(pparams);
    // protected metadata require an authToken for reading
    if (params.apiSecret && params.username) {
      return this.directoryClient.byId({ id: params.username, secret: params.apiSecret }, 
        directory.handleResponse(this.authdbClient, params, key, cb));
    }
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
class DirectoryAliasesPublic extends BulkedUsermetaClient implements SimpleUsermetaClient {

  type: string;
  directoryClient: DirectoryClient;
  authdbClient: AuthdbClient;
  validKeys: {
    [key: string]: boolean;
  };

  constructor(directoryClient: DirectoryClient, authdbClient: AuthdbClient) {
    super();
    this.directoryClient = directoryClient;
    this.authdbClient = authdbClient;
    this.validKeys = { name: true, tag: true, username: true };
    this.type = "DirectoryAliasesPublic";
  }

  isValid(key: string): boolean { return !!this.validKeys[key]; }

  set(params: UsermetaClientSingleOptions | string, key: string, value: string, cb: UsermetaClientCallback) {
    if (!this.isValid(key)) {
      return cb(new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError'
      }));
    }
    return directory.set(this.directoryClient, params, key, value, cb);
  }

  private checkAccountParams(params: UsermetaClientSingleOptions | string, key: string): Error | string | DirectoryIdRequest {
    if (!this.isValid(key)) {
      return new restifyErrors.BadRequestError({
        message: "Forbidden meta key",
        code: 'BadRequestError',
      });
    }
    params = parseParams(params);
    if (params[key]) {
      // return a response without making a outgoing request if we already
      // have the data in the incoming request.
      return params[key];
    }
    return {
      id: params.username,
      req_id: params.req_id
    };
  }

  get(params: UsermetaClientSingleOptions | string, key: string, cb: UsermetaClientCallback) {
    const value = this.checkAccountParams(params, key);
    if (value instanceof (Error)) {
      return cb(value);
    }
    if (typeof value === "string") {
      return cb(null, value);
    }
    if (typeof value === "object") {
      params = parseParams(params);
      return this.directoryClient.byId(value,
        directory.handleResponse(this.authdbClient, params, key, cb));
    }
  }

  getBulkForUser(pparams: UsermetaClientSingleOptions, keys: string[], cb: UsermetaClientGetBulkCallback) {
    const username = pparams.username;
    const account = {
      id: username,
      req_id: pparams.req_id
    };

    //first we get the values of existing keys.
    const mappedKeyValues = keys.map((key): UsernameKeyValue => {
      const value = this.checkAccountParams(pparams, key);
      if (value instanceof (Error))
        return { username, key, value: '' };
      if (typeof value === "string")
        return { username, key, value };
      return { username, key, value: null };
    });

    //check if there are undefined values.
    //if no undefined values, then we will callback, cause we have now all the values needed.
    const hasUndefinedValues = mappedKeyValues.find(item => (item.value === undefined || item.value === null));
    if (!hasUndefinedValues) {
      return cb(null, mappedKeyValues);
    }

    //if there is undefined keys, then we need to getById from directory
    return this.directoryClient.byId(account, (byIdError, byIdBody) => {
      const params = parseParams(pparams);
      // for each undefined value, we need to get the value of the key from the account of the user.
      // we already have the account in body object.
      keys.forEach((key) => {
        directory.handleResponse(this.authdbClient, params, key, (err2, reply2) => {
          if (err2) {
            reply2 = '';
            log.warn({
              req_id: params.req_id,
              err2, account, key: key
            });
          }
          //update the value in the mappedkeyValues array.
          const elementInResult = mappedKeyValues.find((elem) => elem.key === key);
          if (elementInResult && (reply2 || !elementInResult.value)) elementInResult.value = reply2 || '';
        })(byIdError, byIdBody);
      });
      //callback the full mappedkeyvalues.
      cb(null, mappedKeyValues);
    });
  }
}

// Stores "public" metadata in redis
class RedisUsermeta extends BulkedUsermetaClient implements RestrictedUsermetaClient {

  type: string;
  validKeys?: {
    [key: string]: boolean;
  };
  redisClient: RedisClient;

  constructor(redisClient: RedisClient) {
    super();
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

  set(params: UsermetaClientSingleOptions | string, key: string, value: string, cb: UsermetaClientCallback, maxLength?: number) {
    if (maxLength == null) { maxLength = DEFAULT_MAX_LENGTH; }
    const { username } = parseParams(params);
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

  get(params: UsermetaClientSingleOptions | string, key: string, cb: UsermetaClientCallback) {
    const { username } = parseParams(params);
    return this.redisClient.get(`${username}:${key}`, (err, reply) => cb(err, reply));
  }

  isValid(key: string): boolean {
    if ((this.validKeys === undefined) || (this.validKeys[key])) { return true; } else { return false; }
  }
}

const endpoint = (subpath: string) => `/usermeta/v1${subpath}`;
const jsonOptions = function ({ path, req_id }) {
  const options: {
    path: string;
    headers?: any;
  } = {
    path: endpoint(path)
  };
  if (req_id) {
    options.headers =
      { "x-request-id": req_id };
  }
  return options;
};

const authPath = function (params: UsermetaClientSingleOptions): string {
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
class GanomedeUsermeta extends BulkedUsermetaClient implements SimpleUsermetaClient {

  jsonClient: any; // restify-clients.JsonClient
  type: string;

  constructor(jsonClient, userMetaType) {
    super();
    this.jsonClient = jsonClient;
    this.type = "GanomedeUsermeta@" + userMetaType;
  }

  set(pparams: string | UsermetaClientSingleOptions, key: string, value: string, cb: UsermetaClientCallback) {
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
        log.error({
          req_id: params.req_id,
          err, url, options, body, value
        },
          "GanomedeUsermeta.post failed");
        return cb(err, null);
      } else {
        return cb(null, body);
      }
    });
  }

  prepareGet(pparams: string | UsermetaClientSingleOptions, keys: string[]) {
    // if (typeof pparams === 'object' && pparams.hasOwnProperty('usernames') && (pparams as UsermetaClientBulkOptions).usernames !== undefined &&
    //   (pparams as UsermetaClientBulkOptions).usernames.length > 0) {
    //   (pparams as UsermetaClientBulkOptions).username = (pparams as UsermetaClientBulkOptions).usernames.join(',');
    // }
    const params = parseParams(pparams);
    const keyString = keys.join(',');
    const url = this.jsonClient.url;
    const options = {
      ...jsonOptions({
        path: authPath(params) + `/${encodeURIComponent(keyString)}`,
        req_id: params.req_id
      }),
      log: log.child({ req_id: params.req_id, url })
    };
    return { params, url, options };
  }

  get(pparams: string | UsermetaClientSingleOptions, key: string, cb: UsermetaClientCallback) {

    const { params, url, options } = this.prepareGet(pparams, [key]);

    jsonClientRetry(this.jsonClient).get(
      options,
      (err: HttpError | null, _req: Request, _res: Response, body?: object | null) => {
        if (err) {
          log.error({ err, url, options, body, req_id: params.req_id }, "GanomedeUsermeta.get failed");
          cb(err, null);
        } else {
          const metadata: object = body ? body[params.username] : {};
          cb(err, metadata ? metadata[key] || null : null);
        }
      }
    );
  }

  getBulkForUser(pparams: UsermetaClientSingleOptions, keys: string[], cb: UsermetaClientGetBulkCallback) {
    this.getBulk({ ...pparams, usernames: [pparams.username] }, keys, cb);
  }

  getBulk(pparams: UsermetaClientBulkOptions, keys: string[], cb: UsermetaClientGetBulkCallback) {
    const singleParams = { ...pparams, username: pparams.usernames.join(',') };
    const { params, url, options } = this.prepareGet(singleParams, keys);

    jsonClientRetry(this.jsonClient).get(
      options,
      (err: HttpError | null, _req: Request, _res: Response, body?: object | null) => {
        if (err) {
          log.error({ err, url, options, body, req_id: params.req_id }, "GanomedeUsermeta.getBulk failed");
          cb(err);
        } else {
          const usernames = params.username.split(',').filter(x => x);
          type Metadata = { [key:string]: string } & { username: string };
          let result: Metadata[] = [];
          usernames.forEach((name) => {
            const metadata: Metadata = {
              ...(body?.[name] || {}),
              username: name
            };
            keys.forEach((k) => {
              if (typeof metadata[k] !== 'string')
                delete metadata[k];
            });
            result.push(metadata);
          });
          //format final result to be [{username, key, value}]
          const finalResult: UsernameKeyValue[] = [];
          result.forEach((meta) => {
            Object.keys(meta).forEach((kk) => {
              if (kk !== 'username')
                finalResult.push({ username: meta.username, key: kk, value: meta[kk] });
            });
          });
          cb(err, finalResult);
        }
      }
    );
  }
}

interface UsermetaRouterOptions {
  directoryPublic: UsermetaClient,
  directoryProtected: UsermetaClient,
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
class UsermetaRouter extends BulkedUsermetaClient implements SimpleUsermetaClient {

  type: string;
  directoryPublic: UsermetaClient;
  directoryProtected: UsermetaClient;
  ganomedeCentral: UsermetaClient;
  ganomedeLocal: UsermetaClient;
  routes: any;

  constructor({
    directoryPublic,
    directoryProtected,
    ganomedeCentral,
    ganomedeLocal
  }: UsermetaRouterOptions) {
    super();
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

  set(params: UsermetaClientSingleOptions | string, key: string, value: string, cb: UsermetaClientCallback) {
    params = parseParams(params);
    const client = this.routes[key] || this.ganomedeLocal;
    return client.set(params, key, value, cb);
  }

  get(params: UsermetaClientSingleOptions | string, key: string, cb: UsermetaClientCallback) {
    params = parseParams(params);
    const client = this.routes[key] || this.ganomedeLocal;
    return client.get(params, key, cb);
  }

  private groupedClients(keys: string[]): { [type: string]: { keys: string[], client: UsermetaClient } }  {
    let clients: { [type: string]: { keys: string[], client: UsermetaClient } } = {};
    //sorting keys as per the client from routes.
    //grouping each clients with its own keys.
    keys.forEach((key) => {
      const client: UsermetaClient = this.routes[key] || this.ganomedeLocal;
      const clientType: string = client.type;
      if (!clients[clientType]) {
        clients[clientType] = {
          keys: [],
          client,
        };
      }
      clients[clientType].keys.push(key);
    });
    return clients;
  }

  private getTasksForBulk(params: UsermetaClientBulkOptions, keys: string[]): BuildTask[] {
    const clients = this.groupedClients(keys);
    let tasks: BuildTask[] = [];
    //generate the tasks for parallel
    Object.keys(clients).forEach((clientType: string) => {
      const client = clients[clientType];
      tasks.push(cb => client.client.getBulk(params, client.keys, cb));
    });
    return tasks;
  }

  private getTasksForBulkForUser(params: UsermetaClientSingleOptions, keys: string[]): BuildTask[] {
    const clients = this.groupedClients(keys);
    let tasks: BuildTask[] = [];
    //generate the tasks for parallel
    Object.keys(clients).forEach((clientType: string) => {
      const client = clients[clientType];
      tasks.push(cb => client.client.getBulkForUser(params, client.keys, cb));
    });
    return tasks;
  }

  getBulk(params: UsermetaClientBulkOptions, keys: string[], cb: UsermetaClientGetBulkCallback) {
    //generate tasks for get.
    //if (keys.length === 0)
    //return cb(null, []);
    const tasks: BuildTask[] = this.getTasksForBulk(params, keys);
    this._runBuildTasks(tasks, cb);
  }

  getBulkForUser(params: UsermetaClientSingleOptions, keys: string[], cb: UsermetaClientGetBulkCallback) {
    const tasks: BuildTask[] = this.getTasksForBulkForUser(params, keys);
    this._runBuildTasks(tasks, cb);
  }

  private _runBuildTasks(tasks:BuildTask[], cb: UsermetaClientGetBulkCallback) {
    async.parallel(tasks, (err, data) => {
      if (err)
        return cb(err);
      const flat = (data || []).flat();
      cb(null, flat as UsernameKeyValue[]);
    });
  }

}

export default {
  create(config): UsermetaClient {

    // Linked with a ganomede-usermeta jsonClient
    if (config.ganomedeClient) {
      return new GanomedeUsermeta(config.ganomedeClient, config.ganomedeEnv);
    }
    if (config.ganomedeConfig) {
      return new GanomedeUsermeta(restifyClients.createJsonClient({
        url: urllib.format({
          protocol: config.ganomedeConfig.protocol || 'http',
          hostname: config.ganomedeConfig.host,
          port: config.ganomedeConfig.port,
          pathname: config.ganomedeConfig.pathname || 'usermeta/v1'
        })
      }), config.ganomedeEnv);
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

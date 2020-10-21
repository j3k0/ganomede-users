/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// Users API
//
// Implements the users API
//

import _ from 'lodash';

import async from "async";
import authentication, { AuthdbClient } from "./authentication";
import restifyClients from "restify-clients";
import restifyErrors from "restify-errors";
import restify from "restify";
import logMod from "./log";
let log = logMod.child({module: "users-api"});
import helpers from "ganomede-helpers";
import ganomedeDirectory from "ganomede-directory";
const serviceConfig = helpers.links.ServiceEnv.config;
import usermeta, { UsermetaClientOptions } from "./usermeta";
import {UsermetaClient} from "./usermeta";
import aliases from "./aliases";
import fullnames from "./fullnames";
import friendsStore from "./friends-store";
import facebook from "./facebook";
import usernameValidator from "./username-validator";
import { Bans } from './bans';
import urllib from 'url';
import mailer from './mailer';
import parseTagMod from './middlewares/parse-tag';
import eventSender, { USERS_EVENTS_CHANNEL, EventSender } from './event-sender';
import deferredEvents from './deferred-events';
import emails from './emails';
import statsdWrapper from './statsd-wrapper';
import facebookFriends from './facebook-friends';
import friendsApiMod, { FriendsApi } from './friends-api';
import blockedUsersMod, { BlockedUsersApi } from './blocked-users/api';
import directoryClientMod, { DirectoryClient } from './directory-client';
import mailTemplate from './mail-template';
import backendDirectoryMod, { BackendInitializer, BackendOptions } from './backend/directory';
import Logger from 'bunyan';

export interface UsersApiOptions {
  log?: Logger;
  directoryClient?: DirectoryClient;
  sendEvent?: EventSender;
  authdbClient?: AuthdbClient;

// rootUsermetaClient: UsermetaClient|null;
// localUsermetaClient: UsermetaClient|null;
// centralUsermetaClient:UsermetaClient|null;
// aliasesClient: any;
// fullnamesClient: any;
// friendsClient: any;
  friendsApi?: FriendsApi|null;
  bannedUsersApi?: BlockedUsersApi|null;
  bans?: Bans;
  //createBackend?: () => Backend;
// authenticator: any;
// directoryClient: DirectoryClient|null;
// storeFacebookFriends: (options: any) => void | null;
// sendEvent: EventSender|null;
  createBackend?: (options: BackendOptions) => BackendInitializer;
};

const sendError = function(req, err, next) {
  if (err.code === 'InvalidCredentialsError' || err.code == 'UnauthorizedError' || err.code == 'InvalidCredentials' || err.code == 'StormpathResourceError2006') {
   req.log.info(err);
  }
  else if (err.rawError) {
    req.log.warn(err.rawError);
  } else {
    req.log.warn(err);
  }
  return next(err);
};

const stats = statsdWrapper.createClient();

// Retrieve Stormpath configuration from environment
const apiSecret = process.env.API_SECRET || null;

// Facebook
const facebookClient = facebook.createClient({});

// Connection to AuthDB
let authdbClient: any = null;

// Extra user data
let rootUsermetaClient: UsermetaClient|undefined = undefined;
let localUsermetaClient: UsermetaClient|undefined = undefined;
let centralUsermetaClient:UsermetaClient|undefined = undefined;
let aliasesClient: any = null;
let fullnamesClient: any = null;
let friendsClient: any = null;
let friendsApi: FriendsApi|undefined = undefined;
let blockedUsersApi: BlockedUsersApi|undefined = undefined;
let bans: any = null;
let authenticator: any = null;
let directoryClient: DirectoryClient|undefined = undefined;
let storeFacebookFriends: (options: any) => void | null;
let sendEvent: EventSender|null = null;

// backend, once initialized
let backend: any = null;

// Create a user account
const createAccount = function(req, res, next) {

  let usernameError: any;
  if (usernameError = usernameValidator(req.body.username)) {
    return sendError(req, usernameError, next);
  }

  const account = {
    req_id:   req.id(), // pass over request id for better tracking
    id:       (req.body.username != null ? req.body.username.replace(/ /g, '') : undefined),
    username: (req.body.username != null ? req.body.username.replace(/ /g, '') : undefined),
    email:    (req.body.email != null ? req.body.email.replace(/ /g, '') : undefined),
    password: req.body.password
  };
  req.log.info({account}, "createAccount");

  return backend.createAccount(account, function(err, data) {
    if (err) {
      return sendError(req, err, next);
    } else {
      const params = {
        username: account.username,
        authToken: data.token,
        req_id: req.id()
      };
      let {
        metadata
      } = req.body;
      const add = (value, key, callback) => rootUsermetaClient!.set(params, key, value, function(err, reply) {
        if (err) {
          req.log.warn({key, value, err}, "failed to set metadata");
        }
        return callback();
      });
      if (typeof metadata !== 'object') {
        metadata = {};
      }

      // Make sure aliases are not set (createAccount already did)
      delete metadata.email;
      delete metadata.name;
      delete metadata.tag;

      return async.eachOf(metadata, add, function() {
        req.log.info({metadata}, 'Adding metadata to CREATE event');
        if (emails.isGuestEmail(account.email) || emails.isNoEmail(account.email)) {
          metadata.newsletter = "false";
        }
        deferredEvents.editEvent(req.id(),
          USERS_EVENTS_CHANNEL, eventSender.CREATE, "metadata", metadata);
        res.send(data);
        return next();
      });
    }
  });
};

// Login a user account
const login = function(req, res, next) {
  if (req.body.facebookToken) {
    req.log.debug({body:req.body}, 'facebook token found, using loginFacebook');
    return loginFacebook(req, res, next);
  }

  return checkBanMiddleware(req, res, function(err) {
    if (err) {
      return next(err);
    }

    return loginDefault(req, res, next);
  });
};

// Login (or register) a facebook user account
var loginFacebook = function(req, res, next) {
  const account = {
    req_id: req.id(), // pass over request id for better tracking
    accessToken: req.body.facebookToken,
    username: req.body.username,
    password: req.body.password,
    facebookId: req.body.facebookId
  };

  req.log.debug({account}, 'backend.loginFacebook');
  return backend.loginFacebook(account, function(err, result) {
    if (err) {
      req.log.warn({err}, 'backend.loginFacebook failed');
      return next(err);
    } else if (typeof result !== 'undefined') {
      req.log.debug({result}, 'backend.loginFacebook succeeded');
      res.send(result);
    } else {
      req.log.warn('backend.loginFacebook returns no result');
    }
    return next();
  });
};

var loginDefault = function(req, res, next) {

  const account = {
    req_id:   req.id(), // pass over request id for better tracking
    username: req.body.username,
    password: req.body.password
  };
  return backend.loginAccount(account, function(err, data) {
    if (err) {
      return sendError(req, err, next);
    }

    // login successful.
    // however, there may be an an alias for this account.
    // in this case, we need to log the user as the alias!
    return aliasesClient.get(account.username, function(err, alias) {

      if (err) {
        log.warn("Error retrieving alias", err);
      }

      // No alias found, return the source user.
      if (err || !alias) {
        res.send(data);
      } else {
        res.send(authenticator.add(alias));
      }
      return next();
    });
  });
};

// callback(error, isBannedBoolean)
const checkBan = (username, callback) => bans.get({username,apiSecret}, function(err, ban) {
  if (err) {
    log.error('checkBan() failed', {err, username});
    return callback(err);
  }

  return callback(null, ban.exists);
});

// next() - no error, no ban
// next(err) - error
// next(ForbiddenError) - ban
var checkBanMiddleware = function(req, res, next) {
  const username = (req.params && req.params.username) ||
             (req.body && req.body.username) ||
             null;

  if (!username) {
    return sendError(req, new restifyErrors.BadRequestError({
      code: 'BadRequestError'
    }), next);
  }

  return checkBan(username, function(err, exists) {
    if (err) {
      return next(err);
    }

    if (exists) {
      // Remove authToken of banned accounts
      if (req.params.authToken) {
        authdbClient.addAccount(req.params.authToken, null, function() {});
      }

      return next(new restifyErrors.ForbiddenError({
        message: 'user is banned', 
        code: 'ForbiddenError'
      }));
    } else {
      return next();
    }
  });
};

// Load account details. This call most generally made by a client connecting
// to the server, using a restored session. It's a good place to check
// and refresh a few things, namely facebook friends for now.
const getAccountFromAuthDb = function(req, res, next) {
  // We're loading the account from a token (required)
  const token = req.params.authToken;
  if (!token) {
    const err = new restifyErrors.InvalidContentError({
      message: "invalid content",
      code: 'InvalidContentError'
    });
    return sendError(req, err, next);
  }

  // Use the authentication database to retrieve more about the user.
  // see `addAuth` for details of what's in the account, for now:
  //  - username
  //  - email
  //  - facebookToken (optionally)
  return authdbClient.getAccount(token, function(err, account) {
    if (err) {
      req.log.warn({err}, "NotAuthorizedError");
      err = new restifyErrors.NotAuthorizedError({
        message: "not authorized",
        code: 'InvalidContentError'
      });
      return sendError(req, err, next);
    }

    req._store = {account};
    req.body = req.body || {};
    req.body.username = req.body.username || account.username;
    // console.log 'next', account
    return next();
  });
};

const getAccountMetadata = function(req, res, next) {
  // console.log 'getAccountMetadata'
  const { account } = req._store;
  const params: UsermetaClientOptions = {
    req_id: req.id(),
    authToken: req.params.authToken,
    username: account.username
  };
  // fill in already loaded info when we have them
  if (req.params.user) {
    params.username = account.username;
    params.tag      = account.tag;
    params.name     = account.name;
    params.email    = account.email;
  }
  return rootUsermetaClient!.get(params, "country", (err, country) => rootUsermetaClient!.get(params, "yearofbirth", function(err, yearofbirth) {
    req._store.account.metadata = {country, yearofbirth};
    return next();
  }));
};

const getAccountSend = function(req, res, next) {
  // console.log 'getAccountSend'
  // Respond to request.
  const { account } = req._store;
  res.send(account);

  // Reload facebook friends in the background
  // (next has been called)
  if (account.facebookToken) {
    storeFacebookFriends({
      username: account.username,
      accessToken: account.facebookToken,
      callback(err) {
        if (err) {
          return log.error(`Failed to store friends for ${account.username}`, err);
        }
      }
    });
  }

  // Update the "auth" metadata
  if (account.username) {
    authenticator.updateAuthMetadata(account);
  }

  return next();
};

// Send a password reset email
const passwordResetEmail = function(req, res, next) {

  const token = req.params != null ? req.params.authToken : undefined;
  const email = req.body != null ? req.body.email : undefined;

  // Send emails using backend, check for failure
  req.log.info("reset password", {token, email});

  if (!token && !email) {
    const err = new restifyErrors.InvalidContentError({
      message: "invalid content",
      code: 'InvalidContentError'
    });
    return sendError(req, err, next);
  }

  return backend.sendPasswordResetEmail({email, token, req_id: req.id()}, function(err) {
    if (err) {
      log.error(err);
      return sendError(req, err, next);
    } else {
      res.send({ok:true});
      return next();
    }
  });
};

const jsonBody = function(req, res, next) {
  if (typeof req.params !== 'object') {
    return sendError(req, new restifyErrors.BadRequestError({
      message: 'Body is not json',
      code: 'BadRequestError'
    }), next);
  }
  return next();
};

const authMiddleware = function(req, res, next) {

  let username;
  const authToken = req.params.authToken || req.context.authToken;
  if (!authToken) {
    return sendError(req, new restifyErrors.InvalidContentError({
      message: 'invalid content',
      code: 'InvalidContentError'
    }), next);
  }

  if (apiSecret) {
    const separatorIndex = authToken.indexOf(":");
    if (separatorIndex > 0) {
      const reqApiSecret = authToken.substr(0, separatorIndex);
      username = authToken.substr(separatorIndex + 1, authToken.length);
      if (apiSecret === reqApiSecret) {
        req.params.apiSecret = apiSecret;
        req.params.user = req.params.user || {};
        req.params.user.username = username;
      }
      next();
      return;
    }
  }

  return authdbClient.getAccount(authToken, function(err, account) {
    if (err || !account) {
      return sendError(req, new restifyErrors.UnauthorizedError({
        message: 'not authorized',
        code: 'UnauthorizedError'
      }), next);
    }

    req.params.user = req.params.user || {};
    req.params.user.username = account.username;
    if (account.email) {
      req.params.user.email = account.email;
    }
    return next();
  });
};

// Set metadata
const postMetadata = function(req, res, next) {
  // send who is the calling user, or null if not known
  // (so GanomedeUsermeta can check access rights)
  const params = {
    username: req.params.user.username,
    authToken: req.params.authToken || req.context.authToken,
    apiSecret: req.params.apiSecret,
    req_id: req.id()
  };
  const {
    key
  } = req.params;
  const {
    value
  } = req.body;
  return rootUsermetaClient!.set(params, key, value, function(err, reply) {
    if (err) {
      log.error({
        err,
        reply
      });
    }
    res.send({ok:!err});
    return next();
  });
};

// Get metadata
const getMetadata = function(req, res, next) {
  const params: UsermetaClientOptions = {
    req_id: req.id(),
    authToken: req.params?.authToken || req.context?.authToken,
    username: req.params?.username
  };
  // fill in already loaded info when we have them
  if (req.params.user) {
    params.username = req.params.user.username;
    params.tag      = req.params.user.tag;
    params.name     = req.params.user.name;
    params.email    = req.params.user.email;
  }
  const key = req.params.key;
  return rootUsermetaClient!.get(params, key, function(err, reply) {
    res.send({
      key,
      value: reply
    });
    return next();
  });
};


// Initialize the module
const initialize = function(cb, options: UsersApiOptions = {}) {

  if (options.log)
    log = options.log;

  // Initialize the directory client (if possible)
  directoryClient = options.directoryClient || undefined;
  let directoryJsonClient = null;
  const createDirectoryClient = function() {
    const directoryService = serviceConfig('DIRECTORY', 8000);
    if (!directoryService.exists) {
      throw new Error('Directory is not properly configured');
    }
    log.info({directoryService}, "Link to ganomede-directory");
    directoryJsonClient = restifyClients.createJsonClient({
      url: urllib.format({
        protocol: directoryService.protocol || 'http',
        hostname: directoryService.host,
        port:     directoryService.port,
        pathname: 'directory/v1'
      })
    });
    return directoryClientMod.createClient({
      log,
      jsonClient: directoryJsonClient,
      sendEvent: deferredEvents.sendEvent
    });
  };
  directoryClient = directoryClient || createDirectoryClient();

  sendEvent = options.sendEvent ?? eventSender.createSender();

  if (options.authdbClient) {
    ({
      authdbClient
    } = options);
  } else {
    authdbClient = ganomedeDirectory.createAuthdbClient({
      jsonClient: directoryJsonClient, log, apiSecret});
  }

  const createGanomedeUsermetaClient = function(name, ganomedeEnv) {
    const ganomedeConfig = serviceConfig(ganomedeEnv, 8000);
    if (options[name]) {
      return options[name];
    } else if (ganomedeConfig.exists) {
      log.info({ganomedeConfig}, `usermeta[${name}]`);
      return usermeta.create({ganomedeConfig});
    } else {
      log.warn(`cant create usermeta client, no ${ganomedeEnv} config`);
      return null;
    }
  };

  localUsermetaClient = createGanomedeUsermetaClient(
    "localUsermetaClient", 'LOCAL_USERMETA');
  centralUsermetaClient = createGanomedeUsermetaClient(
    "centralUsermetaClient", 'CENTRAL_USERMETA');
  rootUsermetaClient = usermeta.create({router: {
    directoryPublic: usermeta.create({
      directoryClient, authdbClient, mode: 'public'}),
    directoryProtected: usermeta.create({
      directoryClient, authdbClient}),
    ganomedeLocal: localUsermetaClient,
    ganomedeCentral: centralUsermetaClient
  }
  });

  bans = options.bans ?? new Bans({usermetaClient: centralUsermetaClient});

  // Aliases
  aliasesClient = aliases.createClient({
    usermetaClient: centralUsermetaClient});

  // Full names
  fullnamesClient = fullnames.createClient({
    usermetaClient: centralUsermetaClient});

  // Friends
  friendsClient = friendsStore.createClient({
    log, usermetaClient: centralUsermetaClient });

  // Authenticator
  authenticator = authentication.createAuthenticator({
    authdbClient, localUsermetaClient, centralUsermetaClient });

  // Facebook friends
  storeFacebookFriends = options => facebookFriends.storeFriends({
    username: options.username,
    accessToken: options.accessToken,
    callback: options.callback || function() {},
    aliasesClient: options.aliasesClient || aliasesClient,
    friendsClient: options.friendsClient || friendsClient,
    facebookClient: options.facebookClient || facebookClient
  });

  friendsApi = options.friendsApi ?? friendsApiMod.createApi({
    friendsClient,
    authMiddleware
  });

  blockedUsersApi = options.bannedUsersApi || blockedUsersMod.createApi({
    usermetaClient: centralUsermetaClient!,
    directoryClient,
    authMiddleware,
    sendEvent: deferredEvents.sendEvent
  });

  const backendOpts: BackendOptions = {
    // apiId: options.stormpathApiId,
    // apiSecret: options.stormpathApiSecret,
    // appName: options.stormpathAppName,
    usermetaClient: rootUsermetaClient,
    log,
    deferredEvents,
    authdbClient,
    aliasesClient,
    fullnamesClient,
    checkBan,
    facebookClient,
    facebookFriends,
    friendsClient,
    authenticator,
    stats
  };

  const prepareDirectoryBackend = function() {
    directoryClient = directoryClient || createDirectoryClient();
    if (!directoryClient) {
      throw new Error("directory service not configured properly");
    }
    backendOpts.directoryClient = directoryClient;
    backendOpts.passwordResetTemplate = mailTemplate
      .createTemplate({
        subject: process.env.MAILER_SEND_SUBJECT,
        text: process.env.MAILER_SEND_TEXT,
        html: process.env.MAILER_SEND_HTML });
    return backendOpts.mailerTransport = mailer.createTransport();
  };

  let createBackend = options.createBackend;
  if (!createBackend) {
    log.info("Using directory backend only");
    prepareDirectoryBackend();
    createBackend = backendDirectoryMod.createBackend;
  }

  const be = createBackend(backendOpts);
  return be.initialize(function(err, be) {
    if (err) {
      log.error(err, "failed to create backend");
      return cb(err);
    } else {
      backend = be;
      return cb();
    }
  });
};

const validateSecret = function(req, res, next) {
  const present = apiSecret && req.body && req.body.apiSecret;
  const ok = present ? apiSecret === req.body.apiSecret : false;

  if (ok) {
    return next();
  } else {
    return next(new restifyErrors.ForbiddenError({
      code: 'ForbiddenError'
    }));
  }
};

const banAdd = function(req, res, next) {
  const params = {
    username: req.body.username,
    apiSecret: req.body.apiSecret
  };
  return bans.ban(params, function(err) {
    if (err) {
      log.error('banAdd() failed', {err, username: params.username});
      return next(err);
    }

    res.send(200);
    return next();
  });
};

const banRemove = function(req, res, next) {
  const params = {
    username: req.params.username,
    apiSecret: req.body.apiSecret
  };
  return bans.unban(params, function(err) {
    if (err) {
      log.error('banRemove() failed', {err, username: params.username});
      return next(err);
    }

    res.send(200);
    return next();
  });
};

const banStatus = function(req, res, next) {
  const {username} = req.params;
  return bans.get({username,apiSecret}, function(err, ban) {
    if (err) {
      log.error('banStatus() failed', {err, username});
      return next(err);
    }

    res.json(ban);
    return next();
  });
};

// Register routes in the server
const addRoutes = function(prefix: string, server: restify.Server): void {

  const parseTag = parseTagMod.createParamsMiddleware({
    directoryClient: directoryClient!, log});
  Object.defineProperty(parseTag, "name", {value: "parseTag"});
  const bodyTag = parseTagMod.createBodyMiddleware({
    directoryClient: directoryClient!, log, tagField: "username"});
  Object.defineProperty(bodyTag, "name", {value: "bodyTag"});

  server.post(`/${prefix}/accounts`, createAccount);

  server.post(`/${prefix}/login`, bodyTag, login);

  server.get(
    `/${prefix}/auth/:authToken/me`,
    getAccountFromAuthDb,
    checkBanMiddleware,
    getAccountMetadata,
    getAccountSend
  );

  server.post(`/${prefix}/banned-users`,
    jsonBody, validateSecret, bodyTag, banAdd);
  server.del(`/${prefix}/banned-users/:tag`,
    validateSecret, parseTag, banRemove);
  server.get(`/${prefix}/banned-users/:tag`,
    parseTag, banStatus);

  let endPoint = `/${prefix}/auth/:authToken/passwordResetEmail`;
  server.post(endPoint, jsonBody, passwordResetEmail);

  endPoint = `/${prefix}/passwordResetEmail`;
  server.post(endPoint, jsonBody, passwordResetEmail);

  // access to public metadata
  server.get(`/${prefix}/:tag/metadata/:key`,
    parseTag, getMetadata);

  // access to protected metadata
  server.get(`/${prefix}/auth/:authToken/metadata/:key`,
    authMiddleware, getMetadata);
  server.post(`/${prefix}/auth/:authToken/metadata/:key`,
    jsonBody, authMiddleware, postMetadata);

  friendsApi?.addRoutes(prefix, server);
  blockedUsersApi?.addRoutes(prefix, server);

  server.on("after", deferredEvents.finalize(sendEvent!));
};

export default {
  initialize,
  addRoutes
};

// vim: ts=2:sw=2:et:

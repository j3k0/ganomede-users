// Users API
//
// Implements the users API
//

import _ from 'lodash';

import async from "async";
import authentication, { AuthdbClient, Authenticator } from "./authentication";
import restifyClients from "restify-clients";
import restifyErrors, { BadRequestError, HttpError } from "restify-errors";
import restify, { Next, Request, Response } from "restify";
import logMod from "./log";
let log = logMod.child({ module: "users-api" });
import helpers from "ganomede-helpers";
import ganomedeDirectory from "ganomede-directory";
const serviceConfig = helpers.links.ServiceEnv.config;
import usermeta, { UsermetaClientBulkOptions, UsermetaClientSingleOptions } from "./usermeta";
import { UsermetaClient } from "./usermeta";
import aliases, { AliasesClient } from "./aliases";
import fullnames from "./fullnames";
import friendsStore, { FriendsClient } from "./friends-store";
import facebook, { FacebookClient } from "./facebook";
import usernameValidator from "./username-validator";
import { Bans } from './bans';
import urllib from 'url';
import mailer, { CreatedMailerTransportResult, MailerSendOptions } from './mailer';
import eventSender, { USERS_EVENTS_CHANNEL, EventSender } from './event-sender';
import deferredEvents from './deferred-events';
import emails from './emails';
import statsdWrapper from './statsd-wrapper';
import friendsApiMod, { FriendsApi } from './friends-api';
import blockedUsersMod, { BlockedUsersApi } from './blocked-users/api';
import directoryClientMod, { DirectoryClient } from './directory-client';
import mailTemplate from './mail-template';
import backendDirectoryMod, { Backend, BackendInitializer, BackendOptions } from './backend/directory';
import Logger from 'bunyan';
import apiMe from './api/api-me';
import apiLogin from './api/api-login';
import { sendError } from './utils/send-error';
import parseTagMiddleware from './middlewares/mw-parse-tag';
import facebookFriends from './facebook-friends';
import eventLatest, { LatestEvents } from './latest-events';
import reportedUsersApi from './reported-users/api';
import { createReportedUsersProcessor, ProcessReportedUsers } from './reported-users/events-processor';
import getBlocksApi from './blocked-users/get-blocks-api';
import postUserReviews from './blocked-users/reviews-api';
import { EmailConfirmation, SendMailInfo } from './email-confirmation/api';
import * as semver from 'semver';
import config from './config';

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
  friendsApi?: FriendsApi | null;
  bannedUsersApi?: BlockedUsersApi | null;
  bans?: Bans;
  //createBackend?: () => Backend;
  // authenticator: any;
  // directoryClient: DirectoryClient|null;
  // storeFacebookFriends: (options: any) => void | null;
  // sendEvent: EventSender|null;
  createBackend?: (options: BackendOptions) => BackendInitializer;
  mailer?: any;
};

const stats = statsdWrapper.createClient();

// Retrieve Stormpath configuration from environment
const apiSecret = process.env.API_SECRET || '';

// Facebook
const facebookClient: FacebookClient = facebook.createClient({});

// Connection to AuthDB
let authdbClient: any = null;

// Extra user data
let rootUsermetaClient: UsermetaClient | undefined = undefined;
let localUsermetaClient: UsermetaClient | undefined = undefined;
let centralUsermetaClient: UsermetaClient | undefined = undefined;
let aliasesClient: AliasesClient | null = null;
let fullnamesClient: any = null;
let friendsClient: FriendsClient | null = null;
let friendsApi: FriendsApi | undefined = undefined;
let blockedUsersApi: BlockedUsersApi | undefined = undefined;
let bans: Bans | null = null;
let authenticator: Authenticator | null = null;
let directoryClient: DirectoryClient | undefined = undefined;
let storeFacebookFriends: (options: any) => void | null;
let sendEvent: EventSender | null = null;
let eventsLatest: LatestEvents | null = null;
let processReportedUsers: ProcessReportedUsers | null = null;
let emailConfirmation: EmailConfirmation | null = null;
let mailerTransport: CreatedMailerTransportResult | null = null;

// backend, once initialized
let backend: any = null;

// Create a user account
const createAccount = function (req, res, next) {

  let usernameError: any;
  if (usernameError = usernameValidator(req.body.username)) {
    return sendError(req, usernameError, next);
  }

  const account = {
    req_id: req.id(), // pass over request id for better tracking
    id: (req.body.username != null ? req.body.username.replace(/ /g, '') : undefined),
    username: (req.body.username != null ? req.body.username.replace(/ /g, '') : undefined),
    email: (req.body.email != null ? req.body.email.replace(/ /g, '') : undefined),
    password: req.body.password
  };
  req.log.info({ account }, "createAccount");

  return backend.createAccount(account, function (err, data) {
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
      const add = (value, key, callback) => rootUsermetaClient!.set(params, key, '' + value, function (err, reply) {
        if (err) {
          req.log.warn({ key, value, err }, "failed to set metadata");
        }
        return callback();
      });
      if (typeof metadata !== 'object') {
        metadata = {};
      }
      metadata["$chatdisabled"] = "true";

      if (requiresEmailConfirmation(req) && !emails.isGuestEmail(account.email) && !emails.isNoEmail(account.email)) {
        emailConfirmation?.sendEmailConfirmation(params, account.username, account.username, account.email, false, confirmationEmailStatus);
        function confirmationEmailStatus(err: HttpError | undefined, info: SendMailInfo) {
          if (err) {
            req.log.warn({ info, err }, "Failed to send confirmation email");
          }
        }
      }

      // Make sure aliases are not set (createAccount already did)
      delete metadata.email;
      delete metadata.name;
      delete metadata.tag;

      return async.eachOf(metadata, add, function () {
        req.log.info({ metadata }, 'Adding metadata to CREATE event');
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

// Send a password reset email
const passwordResetEmail = function (req, res, next) {

  const token = req.params != null ? req.params.authToken : undefined;
  const email = req.body != null ? req.body.email : undefined;

  // Send emails using backend, check for failure
  req.log.info("reset password", { token, email });

  if (!token && !email) {
    const err = new restifyErrors.InvalidContentError({
      message: "invalid content",
      code: 'InvalidContentError'
    });
    return sendError(req, err, next);
  }

  return backend.sendPasswordResetEmail({ email, token, req_id: req.id() }, function (err) {
    if (err) {
      log.error(err);
      return sendError(req, err, next);
    } else {
      res.send({ ok: true });
      return next();
    }
  });
};

const jsonBody = function (req, res, next) {
  if (typeof req.params !== 'object') {
    return sendError(req, new restifyErrors.BadRequestError({
      message: 'Body is not json',
      code: 'BadRequestError'
    }), next);
  }
  return next();
};

const authMiddleware = function (req, res, next) {

  let username;
  const authToken = req.params.authToken || (req as any).context.authToken;
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

  return authdbClient.getAccount(authToken, function (err, account) {
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
const postMetadata = function (req, res, next) {
  // send who is the calling user, or null if not known
  // (so GanomedeUsermeta can check access rights)
  const params = {
    username: req.params.user.username,
    authToken: req.params.authToken || (req as any).context.authToken,
    apiSecret: req.params.apiSecret,
    req_id: req.id()
  };
  const {
    key
  } = req.params;
  const {
    value
  } = req.body;
  return rootUsermetaClient!.set(params, key, value, function (err, reply) {
    if (err) {
      req.log.warn({ reply }, `Failed to set usermeta "${key}" to "${value}": ERROR ${err.name}: ${err.message}`);
      res.send(err);
      return next();
    }
    if (requiresEmailConfirmation(req) && key === 'email' && req.params.user.email && !emails.isGuestEmail(value) && !emails.isNoEmail(value)) {
      emailConfirmation?.sendEmailConfirmation(params, params.username, req.params.user.name, value, true, (err, info) => {
        if (err) {
          req.log.warn({ reply }, `Failed to send confirmation email to ${params.username}: ERROR ${err.name}: ${err.message}`);
        }
        res.send({ ok: !err, needEmailConfirmation: !err && info.sent });
        next();
      });
    }
    else {
      res.send({ ok: true });
      next();
    }
  });
};

// Get metadata
const getMetadata = function (req, res, next) {
  const params: UsermetaClientSingleOptions = {
    req_id: req.id(),
    authToken: req.params?.authToken || req.context?.authToken,
    username: req.params?.username
  };
  // fill in already loaded info when we have them
  if (req.params.user) {
    params.username = req.params.user.username;
    params.tag = req.params.user.tag;
    params.name = req.params.user.name;
    params.email = req.params.user.email;
  }
  const key = req.params.key;
  return rootUsermetaClient!.get(params, key, function (err, reply) {
    res.send({
      key,
      value: reply
    });
    return next();
  });
};


// Get multi metadata
const getMultiMetadata = function (req:Request, res:Response, next:Next) {
  const params: UsermetaClientBulkOptions = {
    apiSecret: req.query?.secret,
    req_id: req.id(),
    usernames: (req.params?.userIds?.split(',')?.filter(x => x)) || [],
  };
  const keys = req.params.keys.split(',').filter(x => x);
  return rootUsermetaClient!.getBulk(params, keys, function (err, reply) {
    if (err) {
      log.error({ err, reply }, 'Failed to get bulk usermeta.');
      return next(err);
    }
    res.send(reply);
    next();
  });
};

const getUserMultiMetadata = function (req, res, next) {
  const params: UsermetaClientSingleOptions = {
    req_id: req.id(),
    authToken: req.params?.authToken || req.context?.authToken,
    username: req.params?.username,
  };
  // fill in already loaded info when we have them
  if (req.params.user) {
    params.username = req.params.user.username;
    params.tag = req.params.user.tag;
    params.name = req.params.user.name;
    params.email = req.params.user.email;
  }

  const keys = req.params.keys.split(',').filter(x => x);
  return rootUsermetaClient!.getBulkForUser(params, keys, function (err, reply) {
    if (err) {
      log.error({ err, reply }, 'Failed to get user\' bulk usermeta.');
      return next(err);
    }
    res.send(reply);
    next();
  });
};

// Initialize the module
const initialize = function (cb, options: UsersApiOptions = {}) {

  if (options.log)
    log = options.log;

  // Initialize the directory client (if possible)
  directoryClient = options.directoryClient || undefined;
  let directoryJsonClient = null;
  const createDirectoryClient = function () {
    const directoryService = serviceConfig('DIRECTORY', 8000);
    if (!directoryService.exists) {
      throw new Error('Directory is not properly configured');
    }
    log.info({ directoryService }, "Link to ganomede-directory");
    directoryJsonClient = restifyClients.createJsonClient({
      url: urllib.format({
        protocol: directoryService.protocol || 'http',
        hostname: directoryService.host,
        port: directoryService.port,
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
  eventsLatest = eventLatest.createLatestEventsClient();

  authdbClient = options.authdbClient ?? ganomedeDirectory.createAuthdbClient({
    jsonClient: directoryJsonClient, log, apiSecret
  });

  const createGanomedeUsermetaClient = function (name, ganomedeEnv) {
    const ganomedeConfig = serviceConfig(ganomedeEnv, 8000);
    if (options[name]) {
      return options[name];
    } else if (ganomedeConfig.exists) {
      log.info({ ganomedeConfig }, `usermeta[${name}]`);
      return usermeta.create({ ganomedeConfig });
    } else {
      log.warn(`cant create usermeta client, no ${ganomedeEnv} config`);
      return null;
    }
  };

  localUsermetaClient = createGanomedeUsermetaClient(
    "localUsermetaClient", 'LOCAL_USERMETA');
  centralUsermetaClient = createGanomedeUsermetaClient(
    "centralUsermetaClient", 'CENTRAL_USERMETA');
  rootUsermetaClient = usermeta.create({
    router: {
      directoryPublic: usermeta.create({
        directoryClient, authdbClient, mode: 'public'
      }),
      directoryProtected: usermeta.create({
        directoryClient, authdbClient
      }),
      ganomedeLocal: localUsermetaClient,
      ganomedeCentral: centralUsermetaClient
    }
  });

  bans = options.bans ?? new Bans({ usermetaClient: centralUsermetaClient! });
  mailerTransport = options.mailer ? options.mailer.createTransport() : mailer.createTransport();

  processReportedUsers = createReportedUsersProcessor(log);
  emailConfirmation = new EmailConfirmation(centralUsermetaClient!,
    mailerTransport!,
    mailTemplate.createTemplate({
      subject: process.env.MAILER_SEND_CONFIRMATION_SUBJECT,
      text: process.env.MAILER_SEND_CONFIRMATION_TEXT,
      html: process.env.MAILER_SEND_CONFIRMATION_HTML
    }));

  // Aliases
  aliasesClient = aliases.createClient({
    usermetaClient: centralUsermetaClient!
  });

  // Full names
  fullnamesClient = fullnames.createClient({
    usermetaClient: centralUsermetaClient!
  });

  // Friends
  friendsClient = friendsStore.createClient({
    log, usermetaClient: centralUsermetaClient!
  });

  // Authenticator
  authenticator = authentication.createAuthenticator({
    authdbClient, localUsermetaClient, centralUsermetaClient
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
    // checkBan,
    facebookClient,
    facebookFriends,
    friendsClient,
    authenticator,
    stats
  };

  const prepareDirectoryBackend = function () {
    directoryClient = directoryClient || createDirectoryClient();
    if (!directoryClient) {
      throw new Error("directory service not configured properly");
    }
    backendOpts.directoryClient = directoryClient;
    backendOpts.passwordResetTemplate = mailTemplate
      .createTemplate({
        subject: process.env.MAILER_SEND_SUBJECT,
        text: process.env.MAILER_SEND_TEXT,
        html: process.env.MAILER_SEND_HTML
      });
    return backendOpts.mailerTransport = mailerTransport;
  };

  let createBackend = options.createBackend;
  if (!createBackend) {
    log.info("Using directory backend only");
    prepareDirectoryBackend();
    createBackend = backendDirectoryMod.createBackend;
  }

  const be = createBackend(backendOpts);
  return be.initialize(function (err, be) {
    if (err) {
      log.error(err, "failed to create backend");
      return cb(err);
    } else {
      backend = be;
      return cb();
    }
  });
};

const validateSecret = function (req, res, next) {
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

const banAdd = function (req: Request, res: Response, next: Next) {
  const params = {
    username: req.body.username,
    apiSecret: req.body.apiSecret
  };
  return bans!.ban(params, function (err) {
    if (err) {
      log.error('banAdd() failed', { err, username: params.username });
      return next(err);
    }

    postUserReviews.sendDataReview(deferredEvents.sendEvent, req, req.body.username, "BAN");

    res.send(200);
    return next();
  });
};

const banRemove = function (req, res, next) {
  const params = {
    username: req.params.username,
    apiSecret: req.body.apiSecret
  };
  return bans!.unban(params, function (err) {
    if (err) {
      log.error('banRemove() failed', { err, username: params.username });
      return next(err);
    }

    res.send(200);
    return next();
  });
};

const banStatus = function (req, res, next) {
  const { username } = req.params;
  return bans!.get({ username, apiSecret }, function (err, ban) {
    if (err) {
      log.error('banStatus() failed', { err, username });
      return next(err);
    }

    res.json(ban);
    return next();
  });
};


function postDeleteProfileRequest (req: Request, res: Response, next: Next) {
  const auth: UsermetaClientSingleOptions = {
    username: req.params.user.username,
    apiSecret: config.secret,
  };
  if (!auth.username) {
    return next(new BadRequestError());
  }
  req.log.info(auth, 'Deleting profile...');
  bans!.ban(auth, function (err) {
    req.log.info(auth, 'User banned (from delete profile)');
    // send an email to the admin to finalize the deletion.
    const email = {
      from: process.env.MAILER_SEND_FROM,
      to:  process.env.ADMIN_EMAIL || process.env.MAILER_SEND_FROM,
      req_id: req.id(),
      subject: 'Delete account: ' + auth.username,
      text: 'Account deletion requested: ' + auth.username + ' email: ' + auth.email,
      html: `<p>Account deletion requested: <b>${auth.username}</b> email: <b>${auth.email}</b></p>
        <p>Admin UI: <a href="https://prod.ggs.ovh/admin/v1/web/users/${auth.username}">here</a></p>
        <p>TODO:<br/>- remove the email from directory<br/>- delete avatar picture<br/>- clean the metadata<br/>- remove games in progress.</p>`,
    }
    mailerTransport?.sendMail(email, (err, info) => {
      if (err) {
        req.log.warn({err, info, ...auth, ...email}, 'Failed to send email to admin.');
        bans?.unban(auth, (err) => {
          req.log.error(err, 'Failed to unban user.');
          // ... nothing we can do
        });
        return next(err);
      }
      else {
        req.log.info({info, username: auth.username, ...email}, 'Email sent to admin.');
        res.json({ok:true});
      }
    });    
  });
}

const requiresEmailConfirmation = function (req) {
  //  -- check req.headers['X-App-Version'] and process.env.CONFIRM_EMAIL_FOR_APP_VERSION
  // if both defined, use the semver module to check that X-App-Version statisfies the process.env.CONFIRM_EMAIL_FOR_APP_VERSION condition
  var userVersion: String = req.headers['x-app-version'];
  if (process.env.CONFIRM_EMAIL_FOR_APP_VERSION && userVersion)
    return semver.satisfies(userVersion, process.env.CONFIRM_EMAIL_FOR_APP_VERSION);
  return false;
}

const postOtpRequest = function (req, res, next) {
  const params = {
    username: req.params.user.username,
    email: req.params.user.email
  };
  if (requiresEmailConfirmation(req) && !emails.isGuestEmail(params.email) && !emails.isNoEmail(params.email)) {
    emailConfirmation?.sendEmailConfirmation(params, params.username, req.params.user.name, params.email, false, confirmationEmailStatus);
    function confirmationEmailStatus(err: HttpError | undefined, info: SendMailInfo) {
      if (err) {
        req.log.warn({ info, err }, "Failed to send confirmation email");
        next(err);
        return;
      }
      res.json({
        ok: info.sent,
        sent: info.sent
      });
      next();
    }
  }
  else {
    req.log.warn({
      CONFIRM_EMAIL_FOR_APP_VERSION: process.env.CONFIRM_EMAIL_FOR_APP_VERSION,
      appVersion: req.headers['x-app-version']
    }, 'email confirmation not required');
    res.json({ok: true, sent: false, message: "Email confirmation isn't required"});
    next();
  }
}

/**
 * Register routes in the server
 * 
 * Notes, this MUST be called after `initialize` callback has been called.
 */
const addRoutes = function (prefix: string, server: restify.Server): void {

  const parseTag = parseTagMiddleware.createParamsMiddleware({
    directoryClient: directoryClient!, log
  });
  Object.defineProperty(parseTag, "name", { value: "parseTag" });
  const bodyTag = parseTagMiddleware.createBodyMiddleware({
    directoryClient: directoryClient!, log, tagField: "username"
  });
  Object.defineProperty(bodyTag, "name", { value: "bodyTag" });

  server.post(`/${prefix}/accounts`, createAccount);

  const apiOptions = {
    prefix,
    server,
    apiSecret,
    bans: bans as Bans,
    authdbClient: authdbClient as AuthdbClient,
    aliasesClient: aliasesClient! as AliasesClient,
    authenticator: authenticator! as Authenticator,
    backend: backend! as Backend,
    directoryClient: directoryClient!,
    friendsClient: friendsClient!,
    rootUsermetaClient: rootUsermetaClient!,
    facebookClient,
  };

  apiLogin.addRoutes(apiOptions);
  apiMe.addRoutes(apiOptions);

  getBlocksApi.addRoutes(prefix, server);
  reportedUsersApi.addRoutes(prefix, eventsLatest, processReportedUsers, server);
  postUserReviews.addRoutes(prefix, server, deferredEvents.sendEvent);

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

  // access to metadata for multi-users
  server.get(`/${prefix}/multi/metadata/:userIds/:keys`,
    getMultiMetadata);

  // access to protected multi metadata
  server.get(`/${prefix}/auth/:authToken/multi/metadata/:keys`,
    authMiddleware, getUserMultiMetadata);

  server.post(`/${prefix}/auth/:authToken/deleteAccount`,
    jsonBody, authMiddleware, postDeleteProfileRequest);

  server.post(`/${prefix}/auth/:authToken/otp/submit`,
    jsonBody, authMiddleware, emailConfirmation!.confirmEmailCode);

  server.post(`/${prefix}/auth/:authToken/otp/request`,
    jsonBody, authMiddleware, postOtpRequest);

  friendsApi?.addRoutes(prefix, server);
  blockedUsersApi?.addRoutes(prefix, server);

  server.on("after", deferredEvents.finalize(sendEvent!));
};

export default {
  initialize,
  addRoutes
};

// vim: ts=2:sw=2:et:

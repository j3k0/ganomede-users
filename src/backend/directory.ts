/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// returns a BackendInitializer object:
//   an object with a initialize method.
//
// BackendInitializer.initialize(callback)
//   initializes the backend,
//   callback has the following signature:
//     callback(err, backend)

import restifyClients from "restify-clients";
import restifyErrors, { HttpError } from "restify-errors";
import vasync from "vasync";
import * as tagizerMod from 'ganomede-tagizer';

import logMod from '../log';
import emailsMod from '../emails';
import passwordGeneratorMod from 'password-generator';
import { DirectoryClient, DirectoryCallback, DirectoryAlias, DirectoryPostAccount, DirectoryGetAccount } from "../directory-client";
import { USERS_EVENTS_CHANNEL } from "../event-sender";
import { UsermetaClient } from "../usermeta";
import Logger from "bunyan";
import { DeferredEvents } from "../deferred-events";
import { AuthdbClient } from "../authentication";
import { validateIdentityToken } from "./apple-identity-token";
import { Translate } from "../translation";
import { DataKeys, DocumentContent } from "../data-client";
import mailTemplate from "../mail-template";

export type BackendInitializerCallback =(err?: HttpError|null, backend?: Backend) => void;

export interface BackendInitializer {
  initialize: (callback: BackendInitializerCallback) => void;
};

export interface BackendOptions {
  usermetaClient: UsermetaClient;
  log?: Logger;
  deferredEvents: DeferredEvents;
  authdbClient?: AuthdbClient;
  aliasesClient?: any;
  directoryClient?: DirectoryClient;
  fullnamesClient?: any;
  // checkBan?: any;
  facebookClient?: any;
  facebookFriends?: any;
  friendsClient?: any;
  authenticator?: any;
  stats?: any;
  facebookAppId?: string;
  generatePassword?: any;
  mailerTransport?: any;
  translate: Translate;
  passwordResetTemplate?: any;
  tagizer?: any;
  allowCreate?: any;
  fbgraphClient?: any;
  emails?: any;
};

const createBackend = function(options: BackendOptions): BackendInitializer {

  let legacyError;
  let val = options.facebookAppId,
    facebookAppId = val != null ? val : process.env.FACEBOOK_APP_ID,
    directoryClient: DirectoryClient = options.directoryClient!,
    {
      authenticator,
      aliasesClient,
      usermetaClient,
      friendsClient,
      facebookClient,
      // checkBan,
      facebookFriends,
      mailerTransport,
      deferredEvents,
      translate
    } = options,
    val1 = options.tagizer,
    tagizer = val1 != null ? val1 : tagizerMod,
    val2 = options.log,
    log = val2 != null ? val2 : logMod,
    {
      fbgraphClient
    } = options,
    val3 = options.emails,
    emails = val3 != null ? val3 : emailsMod,
    val4 = options.generatePassword,
    generatePassword = val4 != null ? val4 : passwordGeneratorMod.bind(null, 8),
    {
      passwordResetTemplate
    } = options,
    val5 = options.allowCreate,
    allowCreate = val5 != null ? val5 : true;
  if (!directoryClient) {
    throw new Error("directoryClient missing");
  }

  if (!facebookAppId) {
    throw new Error("facebookAppId missing." +
      "You might like to define env FACEBOOK_APP_ID");
  }

  if (!passwordResetTemplate) {
    throw new Error("passwordResetTemplate missing");
  }

  if (!mailerTransport) {
    throw new Error("mailerTransport missing");
  }

  if (!usermetaClient) {
    throw new Error("usermetaClient missing");
  }

  if (!deferredEvents) {
    throw new Error("deferredEvents missing");
  }

  if (!fbgraphClient) {
    fbgraphClient = restifyClients.createJsonClient({
      url: "https://graph.facebook.com",
      version: '*'
    });
  }

  if (process.env.LEGACY_ERROR_CODES) {
    legacyError = function(err, req_id) {
      const conversions = {
        UserAlreadyExistsError_409: 'StormpathResourceError2001',
        BadUserId_400: 'StormpathResourceError2006',
        BadPassword_400: 'StormpathResourceError2007',
        UserNotFoundError_404: 'StormpathResourceError2006',
        InvalidCredentials_401: 'StormpathResourceError2006',
        AliasAlreadyExistsError_409: 'StormpathResourceError2001'
      };
      if (err && (err.body != null ? err.body.code : undefined)) {
        const id = `${err.restCode}_${err.statusCode}`;
        const legacyCode = conversions[id] || err.body.code;
        log.debug({
          restCode: err.restCode,
          statusCode: err.statusCode,
          legacyCode,
          req_id
        }, "Converted to legacy error");
        err.rawCode = err.restCode;
        err.body.code = (err.restCode = legacyCode);
      }
      return err;
    };
  } else {
    legacyError = x => x;
  }

  const loginApple = async function({
    username,
    password,
    appleId,
    appleIdentityToken,
    appleAuthorizationCode,
    givenName,
    surname,
    req_id,
  }: Req<UserAppleToken>, callback) {

    let ret;
    try {
      log.info({ req_id, appleId }, 'login with apple');
      const identityToken = Buffer.from(appleIdentityToken, 'base64').toString('utf-8');
      const identity = await validateIdentityToken(identityToken);
      if (!identity || typeof identity === 'string') {
        // invalid identity token.
        log.warn({ req_id, identityToken, identity }, 'Invalid Apple Identity Token');
        callback(new restifyErrors.BadRequestError('Invalid Apple Identity Token'));
        return;
      }
      let directoryAccount = await loadDirectoryAccount(appleId);
      if (!directoryAccount && identity.claim.email) {
        directoryAccount = await loadDirectoryAccountByEmail(identity?.claim.email);
      }
      let account: { username: string, email: string } | undefined;
      if (!directoryAccount) {
        account = await registerDirectoryAccount({
          username,
          password,
          email: identity.claim.email,
          appleId,
        });
      }
      else {
        account = await updateDirectoryAccount(directoryAccount, { appleId });
      }

      ret = await loginUser(account);
    }
    catch (err) {
      callback(err);
      return;
    }
    callback(null, ret);
    
    let fullName: string = '';
    if (givenName || surname) {
      if (!givenName)
        fullName = surname!;
      else if (!surname)
        fullName = givenName!;
      else
        fullName = givenName + ' ' + surname;
      saveFullName({ username, fullName });
    }

    // Load directory account
    // check in ganomede-directory if there's already a user with
    // this facebookId
    function loadDirectoryAccount(appleId:string):Promise<DirectoryGetAccount | undefined> {
      return new Promise((resolve) => {
        const alias = {
          type: `apple.id`,
          value: appleId
        };
        directoryClient.byAlias(alias, (err, directoryAccount) => resolve(directoryAccount));
      });
    };

    // Load directory account by email
    // check in ganomede-directory if there's already a user with
    // this email
    function loadDirectoryAccountByEmail(email:string):Promise<DirectoryGetAccount | undefined> {
      return new Promise((resolve, reject) => {
        const alias = {
          type: "email",
          value: email
        };        
        directoryClient.byAlias(alias, (err, directoryAccount) => resolve(directoryAccount));
      });
    };

    // when user is neither in directory nor in stormpath
    // register it in the directory.
    function registerDirectoryAccount({ username, password, email, appleId }): Promise<{ username: string, email: string }> {
      return new Promise((resolve, reject) => {
        const account: Req<DirectoryPostAccount> = {
          req_id,
          id: username,
          password,
          aliases: [{
            type: 'apple.id',
            value: appleId,
            public: false,
          }, {
            type: 'email',
            value: email,
            public: false
          }, {
            type: 'name',
            value: username,
            public: true
          }, {
            type: 'tag',
            value: tagizer.tag(username),
            public: true
          }],
        };
        directoryClient.addAccount(account, function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ username, email });
          }
        });
      });
    }

    async function updateDirectoryAccount(account: DirectoryGetAccount, { appleId }): Promise<{ username: string, email: string }> {
      return new Promise((resolve, reject) => {
        log.info({ account }, 'update directory account');
        if (!account.aliases?.['apple.id']) {
          // account found has no apple.id, linking it
          const aliases = [{
            type: 'apple.id',
            value: appleId,
            public: false
          }];
          const email = account.aliases?.email;
          const request:Req<DirectoryPostAccount> = {
            req_id,
            id: account.id,
            aliases,
          };
          return directoryClient.editAccount(request, function (err) {
            if (err) {
              return reject(err);
            } else {
              return resolve({
                username: account.id,
                email: email!,
              });
            }
          });
        }
        else {
          // account found that has an apple id.
          const email = account.aliases?.email;
          return resolve({
            username: account.id,
            email: email!,
          })
        }
      });
    }

    // log user in
    async function loginUser(user: { username: string, email: string }): Promise<{ username: string, email: string, token: string }> {
      return new Promise((resolve, reject) => {
        const { username, email } = user;
        if (!username) {
          reject(new Error("missing username"));
        } else if (!password) {
          reject(new Error("missing password"));
        } else {
          const authResult = authenticator.add({ username, email });
          resolve({
            ...user,
            token: authResult.token
          });
        }
      });
    };

    // save the user's full name (for future reference)
    async function saveFullName(user: { username: string, fullName?: string }) {
      return new Promise((resolve) => {
        const fullName = user.fullName;
        const username = user.username;
        if (username && fullName) {
          const data = usermetaData(user);
          usermetaClient.set(data, "fullname", fullName, function (err, _reply) {
            if (err)
              log.warn("failed to store full name", err, { username, fullName });
            resolve(user);
          });
        }
        else {
          resolve(user);
        }
      });
    }

    const apiSecret = process.env.API_SECRET;
    const usermetaData = user => ({
      username: user.username,
      apiSecret,
      req_id
    });
  };

  const loginFacebook = function({
    facebookId,  // the facebook id of the user
    accessToken, // the facebook access token
    username,    // the backend username
    password,    // the backend password
    req_id
  }: Req<UserFacebookToken>, callback) {

    if (!accessToken) {
      // log.warn('missing access token');
      return setImmediate(() => callback(new restifyErrors.BadRequestError("Missing accessToken")));
    }
    if (!username) {
      // log.warn('missing username');
      return setImmediate(() => callback(new restifyErrors.BadRequestError("Missing username")));
    }
    if (!password) {
      // log.warn('missing password');
      return setImmediate(() => callback(new restifyErrors.BadRequestError("Missing password")));
    }

    // Load facebook data from fbgraph API
    const loadFacebookAccount = function(cb) {
      const token = `access_token=${accessToken}`;
      const location = "location{location{country_code,longitude,latitude}}";
      const uri = `/v2.8/me?fields=id,name,email,${location},birthday&${token}`;
      log.debug({req_id, accessToken, uri}, 'loadFacebookAccount');
      return fbgraphClient.get(uri, function(err, req, res, account) {
        log.debug({req_id, uri, err, account}, 'fbgraph.get response');
        if (err) {
          log.warn({req_id, uri, err}, 'fbgraph.get failed');
          return cb(err);
        } else if (!account) {
          log.warn({req_id, uri}, 'fbgraph.get returned no account');
          return cb(new restifyErrors.NotFoundError("Account not found"));
        } else {
          const defaultEmail = () => `${account.id}@${emails.noEmailDomain}`;
          facebookId = account.id;
          return cb(undefined, {
            facebookId: account.id,
            fullName:   account.name,
            email:      account.email || defaultEmail(),
            birthday:   account.birthday || '',
            location:   account.location
          });
        }
      });
    };

    // Load directory account
    // check in ganomede-directory if there's already a user with
    // this facebookId
    const loadDirectoryAccount = function(facebookAccount, cb) {
      const alias = {
        type: `facebook.id.${facebookAppId}`,
        value: facebookAccount.facebookId
      };

      return directoryClient.byAlias(alias, (err, directoryAccount) => cb(null, { facebookAccount, directoryAccount }));
    };

    // Load directory account by email
    // check in ganomede-directory if there's already a user with
    // this email
    const loadDirectoryAccountByEmail = function({ facebookAccount, directoryAccount }, cb) {
      if (directoryAccount) {
        return cb(null, { facebookAccount, directoryAccount });
      }
      const alias = {
        type: "email",
        value: facebookAccount.email
      };

      return directoryClient.byAlias(alias, (err, directoryAccountAlt) => cb(null, { facebookAccount, directoryAccountAlt, directoryAccount }));
    };

    // when user isn't in ganomede-directory,
    // check fb:#{facebookId} alias (for legacy support)
    // if there's a username saved there, we'll log him in
    const loadLegacyAlias = function({
      facebookAccount, directoryAccount, directoryAccountAlt
    }, cb) {
      if (directoryAccount || directoryAccountAlt) {
        return cb(null, { facebookAccount, directoryAccount, directoryAccountAlt });
      } else {
        return aliasesClient.get(`fb:${facebookId}`, function(err, value) {
          if (err) {
            return cb(err);
          } else if (!value) {
            // User doesn't exist anywhere:
            // it will need to be registered
            return cb(null, { facebookAccount });
          } else {
            // User exists only in stormpath, let's format it
            // as a directory account.
            username = value;
            directoryAccount = {
              id: username,
              aliases: {
                name: username,
                tag: tagizer.tag(username),
                email: facebookAccount.email
              }
            };
            return cb(null, { facebookAccount, directoryAccount });
          }
      });
      }
    };

    // when user is neither in directory nor in stormpath
    // register it in the directory.
    const registerDirectoryAccount = function({
      facebookAccount, directoryAccount, directoryAccountAlt
    }, cb) {
      let account, aliases, birthday, email, fullName, id, location;
      if (directoryAccountAlt) {
        ({
          id
        } = directoryAccountAlt);
        ({
          email
        } = facebookAccount);
        ({
          fullName
        } = facebookAccount);
        ({
          birthday
        } = facebookAccount);
        ({
          location
        } = facebookAccount);
        aliases = [{
          type: 'facebook.id.' + facebookAppId,
          value: facebookAccount.facebookId,
          public: false
        }];
        account = { id, aliases, req_id };
        return directoryClient.editAccount(account, function(err) {
          if (err) {
            return cb(err);
          } else {
            return cb(null, { username:id, email, fullName, birthday, location });
          }
      });
      } else if (directoryAccount) {
        return cb(null, {
          username: directoryAccount.id,
          email: facebookAccount.email,
          fullName: facebookAccount.fullName,
          birthday: facebookAccount.birthday,
          location: facebookAccount.location
        }
        );
      } else {
        if (!allowCreate) {
          return cb(new restifyErrors.ForbiddenError({
            message: 'Cannot register new facebook users',
            restCode: 'ForbiddenError'
          }));
        }
        id = username;
        ({
          email
        } = facebookAccount);
        ({
          fullName
        } = facebookAccount);
        ({
          birthday
        } = facebookAccount);
        ({
          location
        } = facebookAccount);
        aliases = [{
          type: 'email',
          value: email,
          public: false
        }, {
          type: 'name',
          value: username,
          public: true
        }, {
          type: 'tag',
          value: tagizer.tag(username),
          public: true
        }, {
          type: 'facebook.id.' + facebookAppId,
          value: facebookAccount.facebookId,
          public: false
        }];
        account = { id, password, aliases, req_id };
        log.info(account, 'registerDirectoryAccount > add account');
        return directoryClient.addAccount(account, function(err) {
          if (err) {
            return cb(err);
          } else {
            return cb(null, { username, email, fullName, birthday, location });
          }
      });
      }
    };

    // log user in
    const loginUser = function(user, cb) {
      let email;
      ({ username, email } = user);
      if (!username) {
        return cb(new Error("missing username"));
      } else if (!password) {
        return cb(new Error("missing password"));
      } else {
        const authResult = authenticator.add({ username, email });
        user.token = authResult.token;
        return cb(null, user);
      }
    };

    // if login triggers a CREATE event,
    // it'll be extended with extra metadata
    const extendCreateEvent = function(user, cb) {
      deferredEvents.editEvent(req_id, USERS_EVENTS_CHANNEL, 'CREATE', 'metadata', {
        yearofbirth: yearofbirth(user.birthday),
        country: __guard__(__guard__(user.location != null ? user.location.location : undefined, x1 => x1.country_code), x => x.toLowerCase()),
        latitude: String(__guard__(user.location != null ? user.location.location : undefined, x2 => x2.latitude)),
        longitude: String(__guard__(user.location != null ? user.location.location : undefined, x3 => x3.longitude))
      }
      );
      return cb(null, user);
    };

    // extract yearofbirth from birthday
    var yearofbirth = function(birthday) {
      if (birthday) {
        const ret = birthday.split('/');
        return ret[ret.length - 1];
      }
      return null;
    };

    const apiSecret = process.env.API_SECRET;
    const usermetaData = user => ({
      username: user.username,
      apiSecret,
      req_id
    });

    // save the user's birthday
    const saveBirthday = function(user, cb) {
      if (user.username && user.birthday) {
        const yob = yearofbirth(user.birthday);
        if (yob) {
          const data = usermetaData(user);
          usermetaClient.set(data, "yearofbirth", yob, function(err, reply) {
            if (err) {
              log.warn({err, user}, "failed to store birthday");
            }
            return cb(null, user);
          });
          return;
        }
      }
      return cb(null, user);
    };

    // save the user's country
    const saveCountry = function(user, cb) {
      if (user.username && __guard__(user.location != null ? user.location.location : undefined, x => x.country_code)) {
        const cc = __guard__(user.location != null ? user.location.location : undefined, x1 => x1.country_code.toLowerCase());
        const data = usermetaData(user);
        return usermetaClient.set(data, "country", cc, function(err, reply) {
          if (err) {
            log.warn({err, user}, "failed to store country code");
          }
          return cb(null, user);
        });
      } else {
        return cb(null, user);
      }
    };

    // save the user's full name (for future reference)
    const saveFullName = function(user, cb) {
      let fullName;
      ({ username, fullName } = user);
      if (username && fullName) {
        const data = usermetaData(user);
        return usermetaClient.set(data, "fullname", fullName, function(err, reply) {
          if (err) {
            log.warn("failed to store full name", err, {
              username, fullName });
          }
          return cb(null, user);
        });
      } else {
        return cb(null, user);
      }
    };

    // save the user's friends
    const saveFriends = (user, cb) => facebookFriends.storeFriends({
      aliasesClient,
      friendsClient,
      facebookClient,
      accessToken,
      username: user.username,
      apiSecret,
      callback(err, usernames) {
        if (err) {
          log.warn("Failed to store friends", err);
        }
        //else
        //  log.info "Friends stored", usernames
        return cb(null, user);
      }
    });

    // Generate the requests' output
    const formatOutput = (user, cb) => cb(null, {
      username: user.username,
      email: user.email,
      token: user.token
    }
    );

    return vasync.waterfall([
      loadFacebookAccount,
      loadDirectoryAccount,
      loadDirectoryAccountByEmail,
      loadLegacyAlias,
      registerDirectoryAccount,
      extendCreateEvent,
      loginUser,
      saveBirthday,
      saveCountry,
      saveFullName,
      saveFriends,
      formatOutput
    ], callback);
  };

  // credentials: { username, password }
  const loginAccount = function({req_id, username, password}: Req<UserPassword>, cb: LoginCallback) {
    const id = username;
    const credentials = { id, password, req_id };
    return directoryClient.authenticate(credentials, function(err, authResult) {
      if (err) {
        return cb(legacyError(err, req_id));
      } else {
        return cb(null, {username: id, token: authResult!.token});
      }
  });
  };

  const createAccount = function({
    id,
    username,
    password,
    email,
    req_id
  }: Req<Account>, cb: LoginCallback) {
    id = username;
    const aliases = [{
      type: 'email',
      value: email,
      public: false
    }, {
      type: 'name',
      value: username,
      public: true
    }, {
      type: 'tag',
      value: tagizer.tag(username),
      public: true
    }];
    const account = { id, password, aliases, req_id };
    return directoryClient.addAccount(account, function(err) {
      if (err) {
        return cb(legacyError(err, req_id));
      } else {
        log.info(account, "registered");
        return loginAccount({ req_id, username: id, password }, cb);
      }
    });
  };

  const sendPasswordResetEmail = function({token, email, req_id}:Req<PasswordResetToken>, callback: PasswordResetCallback) {
    let id: string | null = null;
    let name: string | null = null;
    let password: string | null = null;
    return vasync.waterfall([

      // Retrieve the user account from directory
      function(cb) {
        if (email) {
          return directoryClient.byAlias({
            type: 'email',
            value: email,
            req_id
          }, cb);
        } else if (token) {
          return directoryClient.byToken({token, req_id}, cb);
        } else {
          return cb(new restifyErrors.BadRequestError(
            'sendPasswordResetEmail requires email or auth token')
          );
        }
      },

      // Edit the user's password
      function(account, cb) {
        id = account.id;
        password = generatePassword();
        email = email || (account.aliases != null ? account.aliases.email : undefined);
        name = account.aliases != null ? account.aliases.name : undefined;
        return directoryClient.editAccount({ id: id!, password: password!, req_id }, cb);
      },

      // localize email content
      function (result, cb) {
        cb = cb || result;
        return translate(DataKeys.resetPassword, { username: id!, req_id }, passwordResetTemplate.template, (content) => {
          cb(null, content);
        });
      },

      // Send the new password by email
      function (localizedContent, cb) {
        const templateValues = { id, name, email, password };
        const content = (localizedContent ? mailTemplate.createTemplate(localizedContent) : passwordResetTemplate).render(templateValues);
        content.to = `${id} <${email}>`;
        content.to = email;
        content.req_id = req_id;
        return mailerTransport.sendMail(content, cb);
      }
    ], callback);
  };

  return {
    initialize(cb: (err?:HttpError|null, backend?:Backend) => void) {
      return cb(null, {
        loginFacebook,
        loginApple, 
        loginAccount,
        createAccount,
        sendPasswordResetEmail });
    }
  };
};

export type Req<T> = T & {
  req_id?: string;
}

export interface UserToken {
  username: string;
  token: string;
}

export interface UserPassword {
  username: string;
  password: string;
}

export interface UserFacebookToken extends UserPassword {
  facebookId: string; // the facebook id of the user
  accessToken: string; // the facebook access token
}

export interface UserAppleToken extends UserPassword {
  appleId: string;
  appleIdentityToken: string;
  appleAuthorizationCode: string;
  givenName?: string;
  surname?: string;
}

export interface FacebookUser {
  facebookId: string;
  fullName: string;
  email: string;
  birthday: string;
  location: string;
}

export interface AppleUser {
  appleId: string;
  // fullName: string;
  email: string;
}

export interface Account {
  id: string;
  username: string;
  password: string;
  email: string;
}

export interface PasswordResetToken {
  token: string;
  email: string;
}

export type LoginCallback = (err: HttpError | null | undefined, data?: UserToken) => void;

export type FacebookLoginCallback = (err: HttpError | null | undefined, data?: FacebookUser) => void;

export type AppleLoginCallback = (err: HttpError | null | undefined, data?: AppleUser) => void;

export type PasswordResetCallback = DirectoryCallback;

export interface Backend {
  loginApple: (token: Req<UserAppleToken>, callback: AppleLoginCallback) => void;
  loginFacebook: (token: Req<UserFacebookToken>, callback: FacebookLoginCallback) => void;
  loginAccount: (userpass: Req<UserPassword>, callback: LoginCallback) => void;
  createAccount: (account: Req<Account>, callback: LoginCallback) => void;
  sendPasswordResetEmail: (req: Req<PasswordResetToken>, callback: PasswordResetCallback) => void;
};

export default {
  createBackend
};

// vim: ts=2:sw=2:et:

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
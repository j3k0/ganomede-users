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
import restifyErrors from "restify-errors";
import vasync from "vasync";
import * as tagizerMod from 'ganomede-tagizer';

import logMod from '../log';
import emailsMod from '../emails';
import passwordGeneratorMod from 'password-generator';
import { DirectoryClient } from "../directory-client";

const createBackend = function(options) {

  let legacyError;
  let val = options.facebookAppId,
      facebookAppId = val != null ? val : process.env.FACEBOOK_APP_ID,
      directoryClient: DirectoryClient = options.directoryClient,
      {
        authenticator,
        aliasesClient,
        usermetaClient,
        friendsClient,
        facebookClient,
        // checkBan,
        facebookFriends,
        mailerTransport,
        deferredEvents
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
      generatePassword = val4 != null ? val4 : passwordGeneratorMod.bind(null,8),
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

  const loginFacebook = function({
    facebookId,  // the facebook id of the user
    accessToken, // the facebook access token
    username,    // the backend username
    password,    // the backend password
    req_id
  }, callback) {

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
      deferredEvents.editEvent(req_id, 'CREATE', 'metadata', {
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
  const loginAccount = function({req_id, username, password}, cb) {
    const id = username;
    const credentials = { id, password, req_id };
    return directoryClient.authenticate(credentials, function(err, authResult) {
      if (err) {
        return cb(legacyError(err, req_id));
      } else {
        return cb(null, {username: id, token: authResult.token});
      }
  });
  };

  const createAccount = function({
    id,
    username,
    password,
    email,
    req_id
  }, cb) {
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

  const sendPasswordResetEmail = function({token, email, req_id}, callback) {
    let id = null;
    let name = null;
    let password = null;
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
        ({
          id
        } = account);
        password = generatePassword();
        email = email || (account.aliases != null ? account.aliases.email : undefined);
        name = account.aliases != null ? account.aliases.name : undefined;
        return directoryClient.editAccount({id, password, req_id}, cb);
      },

      // Send the new password by email
      function(result, cb) {
        cb = cb || result;
        const templateValues = {id, name, email, password};
        const content = passwordResetTemplate.render(templateValues);
        content.to = `${id} <${email}>`;
        content.to = email;
        content.req_id = req_id;
        return mailerTransport.sendMail(content, cb);
      }
    ], callback);
  };

  return {
    initialize(cb) {
      return cb(null, {
        loginFacebook,
        loginAccount,
        createAccount,
        sendPasswordResetEmail });
    }
  };
};

export default { createBackend };

// vim: ts=2:sw=2:et:

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
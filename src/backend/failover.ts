/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import vasync from 'vasync';
import restify from "restify";

const createBackend = function(...args) {

  const obj = args[0],
        {
          directoryClient,
          authenticator,
          aliasesClient,
          fullnamesClient,
          facebookClient,
          checkBan
        } = obj,
        val = obj.log,
        log = val != null ? val : require('../log'),
        {
          primary,
          secondary,
          createAccountFromSecondary
        } = obj;
  if (!primary) {
    throw new Error("primary backend not specified");
  }
  if (!secondary) {
    throw new Error("secondary backend not specified");
  }

  const isUserNotFound = restCode => [ 'UserNotFoundError', 'ResourceNotFound'
  ].indexOf(restCode) >= 0;

  const backend = function(...args1) {

    // attempts to login with primary,
    // tries secondary on failure
    let primary, secondary;
    [ primary, secondary ] = Array.from(args1[0]);
    const loginAccount = function(credentials, cb) {
      const {
        req_id
      } = credentials;
      return primary.loginAccount(credentials, function(err, result) {
        if (err) {
          log.debug({err, req_id},
            "loginAccount with primary failed");
          if (isUserNotFound(err.rawCode || err.restCode)) {
            log.debug({req_id}, "let's attempt with secondary");
            return secondary.loginAccount(credentials, cb);
          } else {
            return cb(err);
          }
        } else {
          return cb(null, result);
        }
      });
    };

    const loginFacebook = function(account, cb) {
      const {
        req_id
      } = account;
      return primary.loginFacebook(account, function(err, result) {
        if (err) {
          log.debug({err, req_id},
            "loginFacebook with primary failed");
          return secondary.loginFacebook(account, cb);
        } else {
          return cb(null, result);
        }
      });
    };

    if (createAccountFromSecondary) {
      log.info("failover backend will create accounts in secondary");
    }
    const createAccount = (
      {
        username,
        password,
        email,
        req_id
      },
      cb
    ) => // only attempts to create the account if it does not exists
    authenticator.getAuthMetadata({username}, function(err, reply) {
      if (reply) {
        return cb(new restify.RestError({
          statusCode: 409,
          restCode: 'StormpathResourceError2001',
          message: 'User already exists'
        })
        );
      } else if (createAccountFromSecondary) {
        return secondary.createAccount({username, password, email, req_id}, cb);
      } else {
        return primary.createAccount({username, password, email, req_id}, cb);
      }
    });

    // attempts password reset with primary,
    // tries secondary on failure
    const sendPasswordResetEmail = function(options, cb) {
      const {
        req_id
      } = options;
      const {
        email
      } = options;
      return primary.sendPasswordResetEmail(options, function(err) {
        if (err) {
          log.debug({err, email, req_id},
            "sendPasswordResetEmail with primary failed");
          if (err.statusCode === 404) {
            log.debug({req_id},
              "let's attempt with secondary");
            return secondary.sendPasswordResetEmail(options, cb);
          } else {
            return cb(err);
          }
        } else {
          return cb(null);
        }
      });
    };

    return { loginAccount, createAccount,
      loginFacebook, sendPasswordResetEmail,
      primary, secondary };
  };

  return {
    initialize(cb) {
      return vasync.forEachParallel({
        inputs: [ primary, secondary ],
        func(backend, done) {
          return backend.initialize(done);
        }
      }
      , function(err, results) {
        if (err) {
          return cb(err);
        } else {
          return cb(null, backend(results.successes));
        }
      });
    }
  };
};

export default { createBackend };
// vim: ts=2:sw=2:et:

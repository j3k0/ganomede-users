/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// Test for the "failover" backend
//
// failover backend is configured to handle accounts
// using a primary backend, and failover to a secondary
// backend on failure.

import _ from 'lodash';

import restify from "restify";
import td from 'testdouble';
import { expect } from 'chai';
import tagizer from 'ganomede-tagizer';
import failover from '../src/backend/failover';

import {
  EXISTING_USER,
  SECONDARY_USER,
  NEW_USER,
  credentials,
  publicAccount,
  authResult,
  account,
  authAccount,
  facebookAccount,
  directoryAccount,
  facebookLogin,
} from './directory-data.coffee';

const authenticatorTD = function() {

  const authenticator = td.object([ 'add', 'getAuthMetadata' ]);
  td.when(authenticator.add(
    td.matchers.contains(publicAccount(EXISTING_USER))))
      .thenReturn(authAccount(EXISTING_USER));

  td.when(authenticator.getAuthMetadata(td.matchers.anything()))
      .thenCallback(null, null);
  td.when(authenticator.getAuthMetadata(
    td.matchers.contains({username: EXISTING_USER.username})))
      .thenCallback(null, 1);
  td.when(authenticator.getAuthMetadata(
    td.matchers.contains({username: SECONDARY_USER.username})))
      .thenCallback(null, 1);

  return authenticator;
};


const backendTD = function(existing) {
  const ret = td.object([ 'initialize' ]);
  const backend = td.object([
    'loginAccount',
    'createAccount',
    'loginFacebook',
    'sendPasswordResetEmail'
  ]);

  // login any user fails with UserNotFoundError
  td.when(backend.loginAccount(td.matchers.anything()))
    .thenCallback(new restify.ResourceNotFoundError());

  // login any user fails with InvalidCredentialsError
  td.when(backend.loginAccount,
    td.matchers.contains({username: existing.username}))
      .thenCallback(new restify.InvalidCredentialsError());

  // login the existing user succeeds
  td.when(backend.loginAccount(
    td.matchers.contains(credentials(existing))))
    .thenCallback(null, authResult(existing));

  // login with facebook
  td.when(backend.loginFacebook(
    td.matchers.anything()))
    .thenCallback(new Error("failed facebook login"));

  // login with facebook
  td.when(backend.loginFacebook(
    td.matchers.contains(facebookLogin(existing))))
    .thenCallback(null, authResult(existing));

  // initialize() returns the backend object
  td.when(ret.initialize()).thenCallback(null, backend);
  return ret;
};

const baseTest = function() {
  const log = td.object([ 'debug', 'info', 'warn', 'error' ]);
  //tb = require('bunyan').createLogger({name:'tbf'})
  //td.when(log.debug(), {ignoreExtraArgs:true})
  //  .thenDo(tb.info.bind tb)
  const authenticator = authenticatorTD();
  const primary = backendTD(EXISTING_USER);
  const secondary = backendTD(SECONDARY_USER);
  const backend = failover.createBackend({
    log, authenticator, primary, secondary });
  const callback = td.function('callback');
  return { callback, backend, primary, secondary, authenticator };
};

const backendTest = function() {
  const ret = baseTest();
  ret.backend.initialize(function(err, backend) {
    ret.backend = backend;
    ret.primary = backend.primary;
    return ret.secondary = backend.secondary;
  });
  return ret;
};

describe('backend/failover', function() {

  describe('.createBackend()', () => it('create a directory backend', function() {
    const { backend } = baseTest();
    return expect(backend).to.be.an('object');
  }));

  describe('backend.initialize()', () => it('loads the backend object', function() {
    const { backend, callback } = baseTest();
    backend.initialize(callback);
    return td.verify(callback(null, td.matchers.isA(Object)));
  }));

  describe('backend.loginAccount()', function() {

    const loginAccount = function(credentials) {
      const ret = backendTest();
      ret.backend.loginAccount(credentials, ret.callback);
      return ret;
    };
    
    it('attempts to authenticate with primary', function() {
      const { primary } = loginAccount(credentials(EXISTING_USER));
      return td.verify(primary.loginAccount(credentials(EXISTING_USER), td.callback));
    });

    it('creates a auth token when login user from primary', function() {
      const { callback } = loginAccount(credentials(EXISTING_USER));
      return td.verify(callback(null, authResult(EXISTING_USER)));
    });

    it('creates a auth token when login user from secondary', function() {
      const { primary, secondary, callback
      } = loginAccount(credentials(SECONDARY_USER));
      td.verify(callback(null, authResult(SECONDARY_USER)));
      // also checks that it indeed checked the primary, then secondary
      td.verify(primary.loginAccount(credentials(SECONDARY_USER), td.callback));
      return td.verify(secondary.loginAccount(credentials(SECONDARY_USER), td.callback));
    });

    return it('fails when credentials are invalid', function() {
      const { callback } = loginAccount(credentials(NEW_USER));
      return td.verify(callback(td.matchers.isA(restify.ResourceNotFoundError)));
    });
  });

  describe('backend.createAccount()', function() {

    const createAccount = function(account) {
      const ret = backendTest();
      ret.backend.createAccount(account, ret.callback);
      return ret;
    };

    it('does not create users that exist in primary', function() {
      const { directoryClient, callback } = createAccount(account(EXISTING_USER));
      return td.verify(callback(td.matchers.isA(restify.RestError)));
    });

    it('does not create users that exist in secondary', function() {
      const { directoryClient, callback } = createAccount(account(SECONDARY_USER));
      return td.verify(callback(td.matchers.isA(restify.RestError)));
    });

    it('creates users that do not exist', function() {
      const { directoryClient, primary } = createAccount(account(NEW_USER));
      return td.verify(primary.createAccount(
        td.matchers.contains({username: NEW_USER.username}),
        td.callback)
      );
    });

    it.skip('adds the email as a private alias', function() {
      const { directoryClient } = createAccount(account(NEW_USER));
      const emailAlias = {
        type: 'email',
        public: false,
        value: NEW_USER.email
      };
      return td.verify(directoryClient.addAccount(
        directoryAccount(NEW_USER),
        td.matchers.argThat(hasAlias(emailAlias)),
        td.callback)
      );
    });

    it.skip('adds the name as a public alias', function() {
      const { directoryClient } = createAccount(account(NEW_USER));
      const nameAlias = {
        type: 'name',
        public: true,
        value: NEW_USER.username
      };
      return td.verify(directoryClient.addAccount(
        directoryAccount(NEW_USER),
        td.matchers.argThat(hasAlias(nameAlias)),
        td.callback)
      );
    });

    it.skip('adds the tag as a public alias', function() {
      const { directoryClient } = createAccount(account(NEW_USER));
      const tagAlias = {
        type: 'tag',
        public: true,
        value: tagizer.tag(NEW_USER.username)
      };
      return td.verify(directoryClient.addAccount(
        directoryAccount(NEW_USER),
        td.matchers.argThat(hasAlias(tagAlias)),
        td.callback)
      );
    });

    it.skip('calls back on success', function() {
      const { callback } = createAccount(account(NEW_USER));
      return td.verify(callback(null));
    });

    return it.skip('fails when the given ID is not available', function() {
      const { backend, directoryClient, callback } = backendTest();
      backend.createAccount(account(EXISTING_USER), callback);
      return td.verify(callback(td.matchers.isA(restify.ConflictError)));
    });
  });

  describe.skip('backend.sendPasswordResetEmail()', function() {

    const sendPasswordResetEmail = function(email) {
      const ret = backendTest();
      ret.backend.sendPasswordResetEmail(email, ret.callback);
      return ret;
    };

    it('calls the callback with success when email exists', function() {
      const { callback } = sendPasswordResetEmail(EMAIL);
      return td.verify(callback(null));
    });

    return it('fails when the email is not known', function() {
      const { callback } = sendPasswordResetEmail("wrong-email");
      return td.verify(callback(td.matchers.isA(Error)));
    });
  });

  return describe('backend.loginFacebook()', function() {

    const loginFacebook = function(account) {
      const ret = backendTest();
      ret.backend.loginFacebook(account, ret.callback);
      return ret;
    };
    
    return it('attempts login with primary backend', function() {
      account = facebookLogin(EXISTING_USER);
      const { callback, primary } = loginFacebook(account);
      td.verify(primary.loginFacebook(account, td.callback));
      return td.verify(callback(null, authResult(EXISTING_USER)));
    });
  });
});


// vim: ts=2:sw=2:et:

// vim: ts=2:sw=2:et:

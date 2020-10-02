/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import restifyErrors from 'restify-errors';
import { expect } from 'chai';
import td from 'testdouble';
import directoryClientMod from '../src/directory-client';
import tagizer from 'ganomede-tagizer';
import bunyan from 'bunyan';
import logMod from '../src/log';

import {
  EXISTING_USER,
  NEW_USER,
  API_SECRET,
  authResult,
  directoryAccount,
  findAlias,
  directoryAliasesObj,
} from './directory-data';


const CREDS = directoryAccount(EXISTING_USER);
const WRONG_CREDS = directoryAccount(NEW_USER);
const ADD_ACCOUNT = directoryAccount(NEW_USER);
ADD_ACCOUNT.secret = API_SECRET;

const REQ_ID = "my-request-id";
CREDS.req_id = REQ_ID;

const jsonClientTD = function() {
  const jsonClient = td.object([ 'post', 'get' ]);

  // attempt to authenticate with unknown credentials
  const status = code => ({
    statusCode:code
  });

  // attempt to create a user with random data
  td.when(jsonClient.post(
    td.matchers.contains({path: '/users'}), td.matchers.anything()))
  // @ts-ignore
  .thenCallback(null, null, status(400));

  // attempt to create a user with valid account data from NEW_USER
  td.when(jsonClient.post(
    td.matchers.contains({path: '/users'}), td.matchers.contains(ADD_ACCOUNT)))
  // @ts-ignore
  .thenCallback(null, null, status(200), {id: NEW_USER.id});

  // attempt to login with wrong credentials
  td.when(jsonClient.post(
    td.matchers.contains({path: '/users/auth'}), td.matchers.anything()))
  // @ts-ignore
  .thenCallback(null, null, status(401));

  // attempt to authenticate with valid credentials
  td.when(jsonClient.post(
    td.matchers.contains({path: '/users/auth'}),
    td.matchers.contains(directoryAccount(EXISTING_USER))))
  // @ts-ignore
  .thenCallback(null, null, status(200), authResult(EXISTING_USER));

  // fails when loading unknown aliases
  td.when(jsonClient.get(
    td.matchers.anything()))
  // @ts-ignore
  .thenCallback(null, null, status(404));

  // loads existing user by alias
  const uri = `/users/alias/email/${encodeURIComponent(EXISTING_USER.email)}`;
  td.when(jsonClient.get(td.matchers.contains({path: uri})))
  // @ts-ignore
  .thenCallback(null, null, status(200), {
      id: EXISTING_USER.id,
      aliases: directoryAliasesObj(EXISTING_USER)
    }
  );

  return jsonClient;
};

const baseTest = function() {
  const callback = td.function('callback');
  const sendEvent = td.function('sendEvent');
  const jsonClient = jsonClientTD();
  // log = td.object [ 'debug', 'info', 'warn', 'error' ]
  const log = logMod;
  // const log = bunyan.createLogger({
  //   name: "users",
  //   level: "debug"
  // });
  const directoryClient = directoryClientMod.createClient({
    log, jsonClient, sendEvent, apiSecret:API_SECRET });

  return { directoryClient, jsonClient, callback, sendEvent };
};

describe('directory-data', () => it('provides test data', function() {
  expect(findAlias("email", EXISTING_USER)).to.eql({
    type: "email",
    value: EXISTING_USER.email,
    public: false
  });
  return expect(directoryAliasesObj(EXISTING_USER)).to.eql({
    name: EXISTING_USER.username,
    tag: tagizer.tag(EXISTING_USER.username)
  });
}));

describe('directory-client', function() {

  describe('.authenticate()', function() {

    const authenticate = function(creds) {
      const ret = baseTest();
      ret.directoryClient.authenticate(creds, ret.callback);
      return ret;
    };

    it('sends a POST request to /directory/v1/users/auth with credentials', function() {
      const { jsonClient } = authenticate(CREDS);
      return td.verify(jsonClient.post(
        td.matchers.contains({path: '/users/auth'}),
        directoryAccount(CREDS), td.callback)
      );
    });

    it('reports failure when response status is not 200', function() {
      const { callback } = authenticate(WRONG_CREDS);
      return td.verify(callback(td.matchers.isA(Error)));
    });

    it('returns the generated token when response status is 200', function() {
      const { callback } = authenticate(CREDS);
      return td.verify(callback(null, td.matchers.contains(authResult(EXISTING_USER))));
    });

    return it('invokes sendEvent(LOGIN, userId) on succesful creation', function() {
      const { sendEvent } = authenticate(CREDS);
      return td.verify(sendEvent('LOGIN', {
        userId: EXISTING_USER.id, aliases: {}, req_id: REQ_ID})
      );
    });
  });

  describe('.byAlias()', function() {

    const byAlias = function(alias) {
      const ret = baseTest();
      ret.directoryClient.byAlias(alias, ret.callback);
      return ret;
    };

    it('GET data from /directory/v1/users/alias/:type/:value', function() {
      const alias = findAlias("email", EXISTING_USER);
      const { jsonClient } = byAlias(alias);

      const uri = `/users/alias/${alias.type}/${encodeURIComponent(alias.value)}`;
      return td.verify(jsonClient.get(
        td.matchers.contains({path: uri}),
        td.callback)
      );
    });

    it('reports failure if alias is unknown', function() {
      const { callback } = byAlias(findAlias("email", NEW_USER));
      return td.verify(callback(td.matchers.isA(Error)));
    });

    return it('provides the account to the callback if exists', function() {
      const { callback } = byAlias(findAlias("email", EXISTING_USER));
      return td.verify(callback(null, td.matchers.contains({
        id: EXISTING_USER.id,
        aliases: directoryAliasesObj(EXISTING_USER)}))
      );
    });
  });

  describe('.addAccount()', function() {

    const addAccount = function(account) {
      const ret = baseTest();
      ret.directoryClient.addAccount(account, ret.callback);
      return ret;
    };

    it('requires credentials as argument', function() {
      const { callback } = addAccount(null);
      return td.verify(callback(
        td.matchers.isA(restifyErrors.InvalidContentError))
      );
    });

    it('requires an argument with id and password fields', function() {
      let { callback } = addAccount({});
      td.verify(callback(
        td.matchers.isA(restifyErrors.InvalidContentError))
      );
      ({ callback } = addAccount({id:CREDS.id}));
      td.verify(callback(
        td.matchers.isA(restifyErrors.InvalidContentError))
      );
      ({ callback } = addAccount({password:CREDS.password}));
      return td.verify(callback(
        td.matchers.isA(restifyErrors.InvalidContentError))
      );
    });

    it('reports success', function() {
      const { callback } = addAccount(directoryAccount(NEW_USER));
      return td.verify(callback(null, {id:NEW_USER.id}));
    });

    it('sends a POST request to /directory/v1/users', function() {
      const { jsonClient } = addAccount(directoryAccount(NEW_USER));
      return td.verify(jsonClient.post(
        td.matchers.contains({path: '/users'}),
        td.matchers.contains(ADD_ACCOUNT), td.callback)
      );
    });

    it('reports failure when response status is not 200', function() {
      const { callback } = addAccount(directoryAccount(EXISTING_USER));
      return td.verify(callback(td.matchers.isA(Error)));
    });

    it('invokes sendEvent(CREATE, userId) on succesful creation', function() {
      const account = {
        secret: API_SECRET,
        req_id: REQ_ID,
        id: NEW_USER.id,
        password: '12345678',
        aliases: [
          {type: 'email', value: 'me@me.me', public: false}
        ]
      };

      const { sendEvent } = addAccount(account);
      return td.verify(sendEvent('CREATE', {
        userId: NEW_USER.id,
        req_id: REQ_ID,
        aliases: {
          email: 'me@me.me'
        }
      })
      );
    });

    return it.skip('reports failure when directory server is not reachable', function() {
      throw new Error("TODO");
    });
  });

  return describe('.editAccount()', function() {
    it('sends a POST request to /directory/v1/users/id/:id');
    it('reports failure when response status is not 200');
    it('reports failure when directory server is not reachable');

    /* return it.skip('calls sendEvent(CHANGE, userId) on alias change', function() {
      const { sendEvent } = editAccount({id: EXISTING_USER.id, alias: {
        type: 'email',
        value: 'new@email',
        public: false
      }});

      return td.verify(sendEvent('CHANGE', {
        userId: EXISTING_USER.id,
        aliases: {email: 'new@email'}
      })
      );
    }); */
  });
});

// vim: ts=2:sw=2:et:

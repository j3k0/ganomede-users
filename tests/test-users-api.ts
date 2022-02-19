/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import superagent from 'superagent';
import fakeAuthdb from "./fake-authdb";
import fakeUsermeta from "./fake-usermeta";
import restify from 'restify';
import restifyErrors from 'restify-errors';
import userApis, { UsersApiOptions } from '../src/users-api';
import { expect } from 'chai';
import { Bans, BanInfo } from '../src/bans';
import td from 'testdouble';
import { GanomedeSubscriptionClient, UsermetaClient, UsernameKeyValue } from "../src/usermeta";
import { BackendOptions, BackendInitializer } from "../src/backend/directory";
import Logger from "bunyan";
import { DirectoryClient } from "../src/directory-client";
const {contains} = td.matchers;

const PREFIX = 'users/v1';
const VALID_AUTH_TOKEN = 'deadbeef';
const data = {
  validLogin: {
    username: 'jeko',
    password: '12345678'
  },
  createAccount: {
    tooshort: { username: '01'
  },
    toolong: { username: '01234567890'
  },
    invalid: { username: 'café'
  },
    valid: {
      username: 'jeko',
      password: undefined,
      email: undefined
    }
  },
  passwordReset: {
    email: 'test@fovea.cc'
  },
  tokens: [{
    createAccountKey: 'valid',
    token: VALID_AUTH_TOKEN
  }],
  accounts: {
    jeko: {
      id: "jeko",
      aliases: {
        name: "jeko-name",
        tag: "jeko-tag",
        email: "jeko@fovea.cc"
      }
    }
  }
};
const apiSecret = process.env.API_SECRET;


const ukv = (username, key) => ({
  username,
  key,
  value: username !== 'n0b0dy' ? `${username}-${key}` : null
});


const baseTest = function () {
  //log = require '../src/log'
  const log = td.object(['info', 'warn', 'error']) as Logger;
  const localUsermetaClient = td.object<UsermetaClient>();
  localUsermetaClient.type = 'GanomedeUsermeta@local';
  const centralUsermetaClient = td.object<UsermetaClient>();
  centralUsermetaClient.type = 'GanomedeUsermeta@central';
  const ganomedeSubscriptionClient = td.object<GanomedeSubscriptionClient>();
  ganomedeSubscriptionClient.type = 'GanomedeSubscriptionClient';

  const backend = td.object([
    'initialize',
    'loginAccount',
    'createAccount',
    'sendPasswordResetEmail'
  ]);
  const createBackend = td.function('createBackend') as (options: BackendOptions) => BackendInitializer;
  td.when(createBackend(td.matchers.isA(Object)))
    .thenReturn(backend);
  const missAuthenticator = ({ authenticator }) => !authenticator;
  td.when(createBackend(td.matchers.argThat(missAuthenticator)))
    .thenThrow(new Error());

  const authenticator = td.object([ 'add' ]);

  td.when(backend.loginAccount(td.matchers.anything()))
  // @ts-ignore
    .thenCallback(new restifyErrors.InvalidCredentialsError());
  td.when(backend.loginAccount(data.validLogin))
    .thenCallback(null, {token:VALID_AUTH_TOKEN});

  const directoryClient = td.object(['editAccount', 'byId', 'byToken', 'byAlias']) as DirectoryClient;
  td.when(directoryClient.byAlias(
    td.matchers.contains({type: "tag"}),
    td.matchers.isA(Function)))
    .thenDo((alias, cb) => cb(null, { id: alias.value }));

  td.when(directoryClient.byId(
    td.matchers.contains({ id: data.accounts.jeko.id }), td.callback))
    .thenCallback(null, data.accounts.jeko);

  const callback = td.function('callback');
  const authdbClient = fakeAuthdb.createClient();
  const options = {
    log, localUsermetaClient, centralUsermetaClient,
    createBackend, authdbClient, authenticator, directoryClient, ganomedeSubscriptionClient
  };
  return {
    callback, options,
    createBackend, backend, localUsermetaClient, centralUsermetaClient,
    authdbClient, directoryClient, ganomedeSubscriptionClient
  };
};

// @ts-ignore
let i:number = 0;
const restTest = function(done) {
  const ret: any = baseTest();
  td.when(ret.backend.initialize()).thenCallback(null, ret.backend);

  ret.endpoint = function(token, path) {
    if (!path) {
      path = token;
      token = null;
    }
    const host = `http://localhost:${server.address().port}`;
    if (token) {
      return `${host}/${PREFIX}/auth/${token}${path}`;
    } else {
      return `${host}/${PREFIX}${path}`;
    }
  };

  i += 1;
  var server = restify.createServer();
  //const localUsermeta = fakeUsermeta.createClient();
  //const centralUsermeta = fakeUsermeta.createClient();
  ret.bans = td.object(Bans.prototype);

  data.tokens.forEach(info => ret.authdbClient.addAccount(info.token, {
    username: data.createAccount[info.createAccountKey].username
  }));

  ret.close = function(done) {
    server.close();
    return done();
  };

  ret.start = function(cb) {
    const options = {
      // log: td.object [ 'info', 'warn', 'error' ]
      localUsermetaClient: ret.localUsermetaClient,
      centralUsermetaClient: ret.centralUsermetaClient,
      authdbClient: ret.authdbClient,
      createBackend: ret.createBackend,
      directoryClient: ret.directoryClient,
      ganomedeSubscriptionClient: ret.ganomedeSubscriptionClient,
      bans: ret.bans
    };
    return userApis.initialize(function (err) {
      if (err) {
        throw err;
      }
      server.use(restify.plugins.bodyParser());
      userApis.addRoutes(PREFIX, server);
      return server.listen(1337, cb);
    }
      , options);
  };

  ret.mockBulkForUserResponse = (username: string, keys: string[], type: 'local' | 'central' | 'purchases') => {
    const client = type === 'purchases' ? ret.ganomedeSubscriptionClient : type === 'local' ? ret.localUsermetaClient : ret.centralUsermetaClient;
    const response: UsernameKeyValue[] = [username].reduce((acc: UsernameKeyValue[], username: string) => {
      return [...acc, ...keys.map(key => ukv(username, key))];
    }, []);
    td.when(client.getBulkForUser(td.matchers.contains({ username }), keys, td.callback))
      .thenCallback(null, response);
  }

  return ret;
};

describe('users-api', function() {

  describe('initialize()', function() {

    it('callbacks when done', function() {
      const { callback, options, backend } = baseTest();
      td.when(backend.initialize()).thenCallback(null, null);
      userApis.initialize(callback, options);
      return td.verify(callback());
    });

    return it('fails when backend initialization fails', function() {
      const err = new Error("failed");
      const { callback, options, backend } = baseTest();
      td.when(backend.initialize()).thenCallback(err, null);
      userApis.initialize(callback, options);
      return td.verify(callback(err));
    });
  });

  describe('REST API', function () {

    let test: any = null;
    let endpoint: any = null;
    beforeEach(function(done) {
      test = restTest(() => {});
      endpoint = test.endpoint;
      test.start(done);
    });
    afterEach(done => test.close(done));

    const noError = function(err) {
      if (err) {
        if (err.response) {
          console.dir(err.response.error);
        } else {
          console.dir(err);
        }
      }
      assert.ok(!err);
    };

    describe.skip('/login [POST] - Logs in a user', () => it("should accept valid credentials", function(done) {
      ({ test } = test);
      superagent
        .post(endpoint('/login'))
        .send(data.validLogin)
        .end(function(err, res) {
          noError(err);
          assert.equal(200, res.status);
          expect(res.body).to.eql({token:VALID_AUTH_TOKEN});
          done();
      });
    }));

    describe('/auth/:token/me [GET] - Retrieve user data', () => {
      it("responds with user data", (done) => {

        test.mockBulkForUserResponse('jeko', ['country', 'yearofbirth'], 'central');
        test.mockBulkForUserResponse('jeko', ['$chatdisabled', '$blocked', 'location',
          'singleplayerstats'], 'local');

        test.mockBulkForUserResponse('jeko', ['productId', 'purchaseId', 'purchaseDate', 'expirationDate'], 'purchases');
        const {
          username
        } = data.createAccount.valid;
        td.when(test.bans.get({ username, apiSecret }))
          .thenCallback(null, new BanInfo(username, 0));
        superagent
          .get(endpoint(VALID_AUTH_TOKEN, "/me"))
          .end(function (err, res) {
            noError(err);
            assert.strictEqual(200, res.status);
            expect(res.body).to.eql({
              username,
              metadata: {
                "$blocked": "jeko-$blocked",
                "$chatdisabled": "jeko-$chatdisabled",
                country: "jeko-country",
                location: "jeko-location",
                singleplayerstats: "jeko-singleplayerstats",
                yearofbirth: "jeko-yearofbirth",
                expirationDate: "jeko-expirationDate",
                productId: "jeko-productId",
                purchaseDate: "jeko-purchaseDate",
                purchaseId: "jeko-purchaseId"
              }
            });
            done();
          });
      });

      it("checks that meta-values are correclty read from the usermeta module", (done) => {
        const {
          username
        } = data.createAccount.valid;
        td.when(test.bans.get({ username, apiSecret }))
          .thenCallback(null, new BanInfo(username, 0));

        test.mockBulkForUserResponse('jeko', ['country', 'yearofbirth'], 'central');
        test.mockBulkForUserResponse('jeko', ['$chatdisabled', '$blocked', 'location',
          'singleplayerstats'], 'local');

        test.mockBulkForUserResponse('jeko', ['productId', 'purchaseId', 'purchaseDate', 'expirationDate'], 'purchases');

        superagent
          .get(endpoint(VALID_AUTH_TOKEN, "/me"))
          .end(function (err, res) {
            noError(err);
            assert.strictEqual(200, res.status);

            td.verify(test.centralUsermetaClient.getBulkForUser(
              td.matchers.contains({ username: 'jeko' }), ['country', 'yearofbirth'], td.matchers.anything()),
              { times: 1 });

            td.verify(test.localUsermetaClient.getBulkForUser(
              td.matchers.contains({ username: 'jeko' }), ['$chatdisabled', '$blocked', 'location',
              'singleplayerstats'], td.matchers.anything()),
              { times: 1 });

            td.verify(test.ganomedeSubscriptionClient.getBulkForUser(
              td.matchers.contains({ username: 'jeko' }), ['productId', 'purchaseId',
              'purchaseDate', 'expirationDate'], td.matchers.anything()),
              { times: 1 });

            td.verify(test.centralUsermetaClient.get(
              td.matchers.contains({ username: 'jeko' }), td.matchers.anything(), td.matchers.anything()),
              { times: 0 });

            td.verify(test.localUsermetaClient.get(
              td.matchers.contains({ username: 'jeko' }), td.matchers.anything(), td.matchers.anything()),
              { times: 0 });

            expect(res.body).to.eql({
              username,
              metadata: {
                "$blocked": "jeko-$blocked",
                "$chatdisabled": "jeko-$chatdisabled",
                country: "jeko-country",
                location: "jeko-location",
                singleplayerstats: "jeko-singleplayerstats",
                yearofbirth: "jeko-yearofbirth",
                expirationDate: "jeko-expirationDate",
                productId: "jeko-productId",
                purchaseDate: "jeko-purchaseDate",
                purchaseId: "jeko-purchaseId"
              }
            });
            done();
          });
      });

    });


    describe('/passwordResetEmail [POST] - Reset password', () => it("should send an email", function (done) {
      const { backend } = test;
      td.when(backend.sendPasswordResetEmail(
        contains({email:data.passwordReset.email})))
          .thenCallback(null, null);
      superagent
        .post(endpoint("/passwordResetEmail"))
        .send(data.passwordReset)
        .end(function(err, res) {
          noError(err);
          assert.equal(200, res.status);
          expect(res.body).to.eql({ok:true});
          return done();
      });
    }));

    describe('/accounts [POST] - Create user account', function() {

      it("should refuse short usernames", function(done) {
        superagent
          .post(endpoint("/accounts"))
          .send(data.createAccount.tooshort)
          .end(function(err, res) {
            assert.equal(400, res.status);
            assert.equal('TooShortError', res.body.code);
            assert.ok(err);
            return done();
        });
      });

      it("should refuse special characters", function(done) {
        superagent
          .post(endpoint("/accounts"))
          .send(data.createAccount.invalid)
          .end(function(err, res) {
            assert.equal(400, res.status);
            assert.equal('BadUsernameError', res.body.code);
            assert.ok(err);
            return done();
        });
      });

      it("should refuse long usernames", function(done) {
        superagent
          .post(endpoint("/accounts"))
          .send(data.createAccount.toolong)
          .end(function(err, res) {
            assert.equal(400, res.status);
            assert.equal('TooLongError', res.body.code);
            assert.ok(err);
            return done();
        });
      });

      return it("should register valid users", function(done) {

        // Backend's create account will be called with this
        const { backend } = test;
        const createAccountData = {
          id:       data.createAccount.valid.username,
          username: data.createAccount.valid.username,
          email:    data.createAccount.valid.email,
          password: data.createAccount.valid.password
        };
        td.when(backend.createAccount(
          td.matchers.contains(createAccountData)))
            .thenCallback(null, data.createAccount.valid);

        superagent
          .post(endpoint("/accounts"))
          .send(data.createAccount.valid)
          .end(function(err, res) {
            noError(err);
            assert.equal(200, res.status);
            assert.equal(data.createAccount.valid.username, res.body.username);
            return done();
        });
      });
    });

    return describe('/banned-users Banning Users', function() {

      const {
        username
      } = data.createAccount.valid;
      const BAN_TIMESTAMP=Date.now();
      beforeEach(() => td.when(test.bans.get({username,apiSecret}))
        .thenCallback(null, new BanInfo(username, String(BAN_TIMESTAMP))));

      describe('POST', function() {

        it('bans people', function(done) {
          td.when(test.bans.ban({
            username,
            apiSecret
          })).thenCallback(null, null);
          superagent
            .post(endpoint('/banned-users'))
            .send({username, apiSecret})
            .end(function(err, res) {
              noError(err);
              expect(res.status).to.equal(200);
              return done();
          });
        });

        return it('requires apiSecret', function(done) {
          superagent
            .post(endpoint('/banned-users'))
            .send({username})
            .end(function(err, res) {
              expect(err).to.be.instanceof(Error);
              expect(res.status).to.equal(403);
              return done();
          });
        });
      });

      describe('Banned users…', function() {

        it('can\'t login', function(done) {
          superagent
            .post(endpoint('/login'))
            .send({username, password: 'wever'})
            .end(function(err, res) {
              expect(err).to.be.instanceof(Error);
              expect(res.status).to.be.equal(403);
              expect(res.body.code).to.be.equal('ForbiddenError');
              return done();
          });
        });

        it('can\'t access profile at /me', function(done) {
          superagent
            .get(endpoint(VALID_AUTH_TOKEN, '/me'))
            .end(function(err, res) {
              expect(err).to.be.instanceof(Error);
              expect(res.status).to.be.equal(403);
              expect(res.body.code).to.be.equal('ForbiddenError');
              return done();
          });
        });

        return it(`nullifies authdb accounts after banned username \
tries to access any :authToken endpoint`, function(done) {
          expect(test.authdbClient.store[VALID_AUTH_TOKEN]).to.be.ok;
          superagent
            .get(endpoint(VALID_AUTH_TOKEN, '/me'))
            .end(function(err, res) {
              expect(err).to.be.instanceof(Error);
              expect(res.status).to.be.equal(403);
              expect(test.authdbClient.store[VALID_AUTH_TOKEN]).to.be.null;
              return done();
          });
        });
      });

      describe('GET /banned-users/:username', () => it('returns ban timestamp', function(done) {
        superagent
          .get(endpoint(`/banned-users/${username}`))
          .end(function(err, res) {
            if (err) {
              console.dir(err);
            }
            expect(err).to.be.null;
            expect(res.status).to.equal(200);
            expect(res.body).to.be.instanceof(Object);
            expect(res.body).to.be.ok;
            expect(res.body.username).to.equal(username);
            expect(res.body.exists).to.be.true;
            expect(res.body.createdAt).to.equal(BAN_TIMESTAMP);
            return done();
        });
      }));

      return describe('DELETE', function() {
        it('removes bans', function(done) {
          td.when(test.bans.unban(td.matchers.isA(Object)))
            .thenCallback(null, null);
          superagent
            .del(endpoint(`/banned-users/${username}`))
            .send({apiSecret})
            .end(function(err, res) {
              noError(err);
              td.verify(test.bans.unban({username, apiSecret}, td.callback));
              return done();
          });
        });

        return it('requires apiSecret', function(done) {
          superagent
            .del(endpoint(`/banned-users/${username}`))
            .end(function(err, res) {
              expect(err).to.be.instanceof(Error);
              expect(res.status).to.equal(403);
              return done();
          });
        });
      });
    });
  });

  describe('integrated tests', () => {

    let server = restify.createServer();
    let ganomedeUserMetaLocalServer = restify.createServer();
    let ganomedeUserMetaCentralServer = restify.createServer();
    let ganomedePurchasesServer = restify.createServer();
    let port = 12911;
    let portLocal = 15911;
    let portCentral = 15311;
    let portPurchases = 18311;

    function endpoint(token, path) {
      if (!path) {
        path = token;
        token = null;
      }
      const host = `http://localhost:${server.address().port}`;
      if (token) {
        return `${host}/${PREFIX}/auth/${token}${path}`;
      } else {
        return `${host}/${PREFIX}${path}`;
      }
    };

    beforeEach(function (done) {
      ++port;
      ++portLocal;
      ++portCentral;
      ++portPurchases;
      server = restify.createServer();
      ganomedeUserMetaLocalServer = restify.createServer();
      ganomedeUserMetaCentralServer = restify.createServer();
      ganomedePurchasesServer = restify.createServer();
      [server, ganomedeUserMetaLocalServer, ganomedeUserMetaCentralServer, ganomedePurchasesServer].forEach((s) => {
        s.use(restify.plugins.bodyParser());
        s.use(restify.plugins.queryParser());
      });

      const backend = td.object([
        'initialize',
        'loginAccount',
        'createAccount',
        'sendPasswordResetEmail'
      ]);
      const createBackend = td.function('createBackend') as (options: BackendOptions) => BackendInitializer;
      td.when(createBackend(td.matchers.isA(Object)))
        .thenReturn(backend);
      const missAuthenticator = ({ authenticator }) => !authenticator;
      td.when(createBackend(td.matchers.argThat(missAuthenticator)))
        .thenThrow(new Error());


      td.when(backend.loginAccount(td.matchers.anything()))
        // @ts-ignore
        .thenCallback(new restifyErrors.InvalidCredentialsError());
      td.when(backend.loginAccount(data.validLogin))
        .thenCallback(null, { token: VALID_AUTH_TOKEN });

      const directoryClient = td.object(['editAccount', 'byId', 'byToken', 'byAlias']) as DirectoryClient;
      td.when(directoryClient.byAlias(
        td.matchers.contains({ type: "tag" }),
        td.matchers.isA(Function)))
        .thenDo((alias, cb) => cb(null, { id: alias.value }));

      td.when(directoryClient.byId(
        td.matchers.contains({ id: data.accounts.jeko.id }), td.callback))
        .thenCallback(null, data.accounts.jeko);

      td.when(backend.initialize()).thenCallback(null, backend);
      const authdbClient = fakeAuthdb.createClient();
      const bans = td.object(Bans.prototype);

      td.when(bans.get(td.matchers.anything(), td.callback))
        .thenCallback(null, new BanInfo('jeko', 0));

      data.tokens.forEach(info => authdbClient.addAccount(info.token, {
        username: data.createAccount[info.createAccountKey].username
      }));

      const options: UsersApiOptions = {
        log: td.object<Logger>(),
        createBackend,
        authdbClient,
        directoryClient,
        bans
      };

      Object.assign(process.env, {
        CENTRAL_USERMETA_PORT_8000_TCP_ADDR: 'localhost',
        CENTRAL_USERMETA_PORT_8000_TCP_PORT: '' + portCentral,
        LOCAL_USERMETA_PORT_8000_TCP_ADDR: 'localhost',
        LOCAL_USERMETA_PORT_8000_TCP_PORT: '' + portLocal,
        GANOMEDE_PURCHASES_PORT_8000_TCP_ADDR: 'localhost',
        GANOMEDE_PURCHASES_PORT_8000_TCP_PORT: '' + portPurchases,
        FACEBOOK_APP_ID: '0'
      });
      userApis.initialize(() => {
        userApis.addRoutes('users/v1', server);
        server.listen(port, () => {
          done();
        });
      }, options);

      ganomedeUserMetaLocalServer.listen(portLocal);
      ganomedeUserMetaCentralServer.listen(portCentral);
      ganomedePurchasesServer.listen(portPurchases);
    });

    afterEach(done => {
      [server, ganomedeUserMetaLocalServer, ganomedeUserMetaCentralServer, ganomedePurchasesServer].forEach((s) => {
        s.close();
      });
      done();
    });

    it('checks that protected meta-values are correclty read from the usermeta module', done => {

      const {
        username
      } = data.createAccount.valid;

      // Fake usermeta local response
      ganomedeUserMetaLocalServer.get('/usermeta/v1/auth/:authToken/:keys', (req, res, next) => {
        expect(req.params.authToken).to.equal(VALID_AUTH_TOKEN);
        expect(req.params.keys).to.equal('$chatdisabled,$blocked,location,singleplayerstats');
        // req.log.info("GET from usermeta");
        const keyValues = {};
        req.params.keys.split(',').forEach(k => {
          const kv = ukv(username, k);
          keyValues[kv.key] = kv.value
        });

        res.json({
          [username]: keyValues
        });
        next();
      });

      // Fake usermeta central response
      ganomedeUserMetaCentralServer.get('/usermeta/v1/auth/:authToken/:keys', (req, res, next) => {
        expect(req.params.authToken).to.equal(VALID_AUTH_TOKEN);
        expect(req.params.keys).to.equal('country,yearofbirth');
        // req.log.info("GET from usermeta");
        const keyValues = {};
        req.params.keys.split(',').forEach(k => {
          const kv = ukv(username, k);
          keyValues[kv.key] = kv.value
        });

        res.json({
          [username]: keyValues
        });
        next();
      });

      // Fake ganomede purchases response
      ganomedePurchasesServer.get('/purchases/v1/auth/:authToken/subscription', (req, res, next) => {
        expect(req.params.authToken).to.equal(VALID_AUTH_TOKEN);
        const keys = ['productId', 'purchaseId', 'purchaseDate', 'expirationDate'];
        // req.log.info("GET from usermeta");
        const keyValues = {};
        keys.forEach(k => {
          const kv = ukv(username, k);
          keyValues[kv.key] = kv.value
        });
        res.json(keyValues);
        next();
      });

      superagent
        .get(endpoint(VALID_AUTH_TOKEN, "/me"))
        .end((err, res) => {
          expect(err, 'response error').to.be.null;
          expect(res?.status, 'response status').to.equal(200);
          expect(res?.body, 'response').to.eql({
            username,
            metadata: {
              "$blocked": "jeko-$blocked",
              "$chatdisabled": "jeko-$chatdisabled",
              country: "jeko-country",
              location: "jeko-location",
              singleplayerstats: "jeko-singleplayerstats",
              yearofbirth: "jeko-yearofbirth",
              expirationDate: "jeko-expirationDate",
              productId: "jeko-productId",
              purchaseDate: "jeko-purchaseDate",
              purchaseId: "jeko-purchaseId",
            }
          });
          done();
        });
    });

  });
});

// vim: ts=2:sw=2:et:

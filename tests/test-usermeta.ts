/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import usermeta from "../src/usermeta";
import fakeRedis from 'fakeredis';
import td from 'testdouble';
import { expect } from 'chai';
import restifyErrors from "restify-errors";

describe("usermeta", function() {

  describe("DirectoryAliases", function() {

    const publicAccount = {
      id: "username",
      aliases: {
        name: "name",
        tag: "guttentag"
      }
    };

    const protectedAccount = {
      id: "username",
      aliases: {
        name: "myname",
        tag: "guttentag",
        email: "user@email.com"
      }
    };

    let usermetaClient: any = null;
    let directoryClient: any = null;
    beforeEach(function() {
      directoryClient = td.object(['editAccount', 'byId', 'byToken']);
      td.when(directoryClient.editAccount(td.matchers.anything()))
        .thenCallback(null, {});
      td.when(directoryClient.byId(td.matchers.contains({id:"username"})))
        .thenCallback(null, publicAccount);
      td.when(directoryClient.byToken(td.matchers.contains({token:"abc"})))
        .thenCallback(null, protectedAccount);
      return usermetaClient = usermeta.create({directoryClient});});

    it("is created from a directoryClient", () => assert.equal("DirectoryAliasesProtected", usermetaClient.type));

    it("also works in 'public' mode", function() {
      usermetaClient = usermeta.create({directoryClient, mode: "public"});
      return assert.equal("DirectoryAliasesPublic", usermetaClient.type);
    });

    describe('.get', function() {
      it("calls back with (BadRequestError, null) for invalid data", done => usermetaClient.get("username", "location", function(err, data) {
        expect(err).to.be.instanceof(restifyErrors.BadRequestError);
        assert.equal(null, data);
        return done();
      }));

      it("requires an authToken in protected mode", done => usermetaClient.get("username", "name", function(err, data) {
        expect(err).to.be.instanceof(restifyErrors.NotAuthorizedError);
        return done();
      }));

      it("does not require the authToken in public mode", function(done) {
        usermetaClient = usermeta.create({directoryClient, mode: "public"});
        return usermetaClient.get("username", "name", function(err, data) {
          expect(err).to.be.null;
          expect(data).to.equal("name");
          return done();
        });
      });

      return it("does not allow 'password' to be read", done => usermetaClient.get("username", "password", function(err, data) {
        expect(err).to.be.instanceof(restifyErrors.BadRequestError);
        return done();
      }));
    });

    return describe('.set', function() {
      it("requires an authToken", done => usermetaClient.set("username", "name", "newname", function(err, data) {
        expect(err).to.be.instanceof(restifyErrors.NotAuthorizedError);
        return done();
      }));

      it("accepts valid emails", done => usermetaClient.set({authToken:"abc"}, "email", "user@email.com",
        function(err, data) {
          expect(err).to.be.null;
          return done();
      }));

      it("refuses invalid emails", done => usermetaClient.set({authToken:"abc"}, "email", "useremail.com",
        function(err, data) {
          expect(err).to.be.instanceof(restifyErrors.InvalidContentError);
          return done();
      }));

      it("accepts valid names", done => usermetaClient.set({authToken:"abc"}, "name", "abcdefgh",
        function(err, data) {
          expect(err).to.be.null;
          return done();
      }));

      it("refuses invalid names", done => usermetaClient.set({authToken:"abc"}, "name", "ab",
        function(err, data) {
          expect(err).to.be.instanceof(restifyErrors.InvalidContentError);
          return done();
      }));

      it("accepts valid passwords", done => usermetaClient.set({authToken:"abc"}, "password", "abcdefgh",
        function(err, data) {
          console.log(err);
          expect(err).to.be.null;
          return done();
      }));

      it("refuses short passwords", done => usermetaClient.set({authToken:"abc"}, "password", "12345",
        function(err, data) {
          expect(err).to.be.instanceof(restifyErrors.InvalidContentError);
          return done();
      }));

      return it("sets and gets data", done => usermetaClient.set({authToken:"abc"}, "email", "user@email.com",
      function(err, data) {
        expect(err).to.be.null;
        return usermetaClient.get({authToken:"abc"}, "email", function(err, data) {
          console.log(err);
          expect(err).to.be.null;
          assert.equal("user@email.com", data);
          return done();
        });
      }));
    });
  });

  describe("RedisUsermeta", function() {

    let usermetaClient: any = null;
    let redisClient: any = null;
    beforeEach(function() {
      process.env.USERMETA_VALID_KEYS = "k1,ke2,key3,age,age1";
      redisClient = fakeRedis.createClient(__filename);
      return usermetaClient = usermeta.create({redisClient});});

    it("is created from a redisClient", () => assert.equal("RedisUsermeta", usermetaClient.type));

    it("parse USERMETA_VALID_KEYS", function() {
      assert.equal(true, usermetaClient.validKeys.k1);
      assert.equal(true, usermetaClient.validKeys.ke2);
      assert.equal(true, usermetaClient.validKeys.key3);
      assert.equal(true, usermetaClient.isValid("key3"));
      return assert.equal(false, usermetaClient.isValid("key4"));
    });

    it("returns null for invalid data", done => usermetaClient.get("username", "location", function(err, data) {
      assert.equal(null, data);
      return done();
    }));

    it("sets and gets data", done => usermetaClient.set("username", "age", "25", function(err, data) {
      assert.ok(!err);
      return usermetaClient.get("username", "age", function(err, data) {
        assert.ok(!err);
        assert.equal("25", data);
        return done();
      });
    }));

    return it("refuses data over 200 bytes", function(done) {
      let i;
      usermetaClient = usermeta.create({redisClient});
      const s200 = ((() => {
        const result: string[] = [];
        for (i = 0; i < 200; i++) {
          result.push("X");
        }
        return result;
      })()).join('');
      const s201 = ((() => {
        const result1: string[] = [];
        for (i = 0; i < 201; i++) {
          result1.push("X");
        }
        return result1;
      })()).join('');
      return usermetaClient.set("username", "age1", s200, function(err, data) {
        assert.ok(!err);
        return usermetaClient.set("username", "age2", s201, function(err, data) {
          assert.ok(err);
          assert.equal(err.statusCode, 400);
          assert.equal(err.body.code, 'BadRequestError');
          return done();
        });
      });
    });
  });

  describe("GanomedeUsermeta", function() {

    let jsonClient: any = null;
    let usermetaClient: any = null;
    beforeEach(function() {
      jsonClient = td.object(['get', 'post']);
      return usermetaClient = usermeta.create({ganomedeClient: jsonClient});
    });

    it("is created from a ganomedeClient", () => assert.equal("GanomedeUsermeta", usermetaClient.type));

    describe(".get", function() {
      it("delegates to the jsonClient", function() {
        usermetaClient.get("username", "age", td.function('callback'));
        return td.verify(jsonClient.get(
          td.matchers.contains({path: '/usermeta/v1/username/age'}),
          td.callback));
      });

      it("uses apiSecret if defined", function() {
        usermetaClient.get({
          username: "username", apiSecret: "1234", authToken: "token"},
          "age", td.function('callback'));
        return td.verify(jsonClient.get(
          td.matchers.contains({path: '/usermeta/v1/auth/1234.username/age'}),
          td.callback));
      });

      return it("uses authToken if defined", function() {
        usermetaClient.get({
          username: "username", authToken: "token"},
          "age", td.function('callback'));
        return td.verify(jsonClient.get(
          td.matchers.contains({path: '/usermeta/v1/auth/token/age'}),
          td.callback));
      });
    });

    describe(".getBulk", function () {
      it("delegates to the jsonClient", function () {
        usermetaClient.getBulk({ usernames: ["username1", "username2"] }, ["age"], td.function('callback'));
        return td.verify(jsonClient.get(
          td.matchers.contains({ path: '/usermeta/v1/username1%2Cusername2/age' }),
          td.callback));
      });

      it("uses apiSecret if defined", function() {
        usermetaClient.getBulk({
          usernames: ["username1", "username2"], apiSecret: "1234", authToken: "token"
        }, ["age"], td.function('callback'));
        return td.verify(jsonClient.get(
          td.matchers.contains({path: '/usermeta/v1/auth/1234.username1%2Cusername2/age'}),
          td.callback));
      });

      return it("uses authToken if defined", function() {
        usermetaClient.getBulk({
          usernames: ["username1", "username2"], authToken: "token"
        }, ["age"], td.function('callback'));
        return td.verify(jsonClient.get(
          td.matchers.contains({path: '/usermeta/v1/auth/token/age'}),
          td.callback));
      });
    });

    return describe(".set", () => it("delegates to the jsonClient", function() {
      usermetaClient.set("username", "age", "25", td.function('callback'));
      return td.verify(jsonClient.post(
        td.matchers.contains({path: '/usermeta/v1/username/age'}),
        {value: "25"},
        td.callback));
    }));
  });

  return describe("UsermetaRouter", function() {

    let ganomedeLocal: any = null;
    let ganomedeCentral: any = null;
    let directoryPublic: any = null;
    let directoryProtected: any = null;
    let usermetaClient: any = null;
    const username = "username";

    const usermetaTD = function() {
      const client = td.object(['get', 'post']);
      return client;
    };

    beforeEach(function() {
      ganomedeLocal = usermetaTD();
      ganomedeCentral = usermetaTD();
      directoryProtected = usermetaTD();
      directoryPublic = usermetaTD();
      return usermetaClient = usermeta.create({router: {
        ganomedeLocal, ganomedeCentral, directoryProtected, directoryPublic}});});

    it("is created from a router configuration", () => assert.equal("UsermetaRouter", usermetaClient.type));

    return describe(".get", function() {

      it("delegates 'email' to the directoryProtected client", function() {
        usermetaClient.get({username}, "email", td.function('callback'));
        return td.verify(directoryProtected.get({username}, "email", td.callback));
      });

      it("delegates 'name' to the directoryPublic client", function() {
        usermetaClient.get({username}, "name", td.function('callback'));
        return td.verify(directoryPublic.get({username}, "name", td.callback));
      });

      it("delegates 'country' to the ganomedeCentral client", function() {
        usermetaClient.get({username}, "country", td.function('callback'));
        return td.verify(ganomedeCentral.get({username}, "country", td.callback));
      });

      return it("delegates all others to the ganomedeLocal client", function() {
        usermetaClient.get({username}, "any", td.function('callback'));
        return td.verify(ganomedeLocal.get({username}, "any", td.callback));
      });
    });
  });
});

// vim: ts=2:sw=2:et:

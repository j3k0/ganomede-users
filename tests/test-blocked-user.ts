import assert from "assert";
import restify from "restify";
import restifyErrors from "restify-errors";
import td, { DoubledObjectWithKey } from 'testdouble';
import usersApi from "../src/users-api";
import fakeRestify from "./fake-restify";
import fakeAuthdb from "./fake-authdb";
import expect from "expect.js";
import logMod from '../src/log';
import fakeUsermeta from './fake-usermeta';
import { UsermetaClient } from "../src/usermeta";
import { EventSender } from "../src/event-sender";
import Logger from "bunyan";
import { DirectoryClient } from "../src/directory-client";
import { BackendOptions, BackendInitializer } from "../src/backend/directory";
import tagizer from 'ganomede-tagizer';
import { AuthdbClient } from "../src/authentication";

const TAGS = {
  "charies-tag": "charles",
};

const server = fakeRestify.createServer();

class Test {

  directoryClient: DirectoryClient;
  log: Logger;
  localUsermetaClient: UsermetaClient;
  centralUsermetaClient: UsermetaClient;
  backend: DoubledObjectWithKey<string>;
  createBackend: (options: BackendOptions) => BackendInitializer;
  authdbClient: AuthdbClient;
  sendEvent: EventSender;

  constructor() {
    // Some mocks so we can initialize the `users` module.
    this.directoryClient = td.object(['editAccount', 'byId', 'byToken', 'byAlias']) as DirectoryClient;

    td.when(this.directoryClient.byAlias(
      td.matchers.contains({ type: "tag" }),
      td.matchers.isA(Function)))
      .thenDo((alias, cb) => {
        cb(null, TAGS[alias.value] ? { id: TAGS[alias.value] } : null);
      });

    this.sendEvent = td.function('sendEvent') as EventSender;
    this.log = logMod;
    this.log = td.object([ 'info', 'warn', 'error', 'debug' ]) as Logger;
    this.localUsermetaClient = fakeUsermeta.createClient();
    this.centralUsermetaClient = fakeUsermeta.createClient();
    this.backend = td.object(['initialize']);
    this.createBackend = td.function('createBackend') as (options: BackendOptions) => BackendInitializer;

    td.when(
      this.createBackend(td.matchers.isA(Object)))
      .thenReturn(this.backend);
    td.when(
      this.backend.initialize())
      .thenCallback(null, this.backend);
    this.authdbClient = fakeAuthdb.createClient();
    this.authdbClient.addAccount("valid-token", {
      username: "alice"
    });
  }

  initialize(done) {
    usersApi.initialize(() => {
      usersApi.addRoutes("users/v1", server as unknown as restify.Server);
      done();
    }, this);
  }
}

describe("blocked-users-api", function () {

  let test: Test = new Test();

  beforeEach(function (done) {
    test = new Test();
    test.initialize(done);
  });

  it("should have GET, POST and DEL routes", function () {
    assert.ok(server.routes.get["/users/v1/auth/:authToken/blocked-users"]);
    assert.ok(server.routes.post["/users/v1/auth/:authToken/blocked-users"]);
    assert.ok(server.routes.del["/users/v1/auth/:authToken/blocked-users/:tag"]);
  });

  describe('GET', function () {

    it("rejects invalid authentication token", function (done) {
      server.request("get", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "invalid-token" }
      },
        function (res) {
          expect(res?.body).to.be.a(restifyErrors.UnauthorizedError);
          done();
        }
      );
    });

    it("accepts valid requests", function (done) {
      test.authdbClient.addAccount("valid-token", { username: "alice" });
      server.request("get", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "valid-token" }
      },
        function (res) {
          assert.equal(res?.status, 200);
          done();
        }
      );
    });

    it("returns an empty array for new users", function (done) {
      test.authdbClient.addAccount("valid-token", { username: "alice" });
      server.request("get", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "valid-token" }
      },
        function (res) {
          expect(res?.body).to.eql([]);
          done();
        }
      );
    });

    it("returns blocked users from the central usermeta key $blocked", function (done) {
      const alice = { username: "alice" }
      test.authdbClient.addAccount("valid-token", alice);
      test.centralUsermetaClient.set("alice", "$blocked", "bob,charles", _ => { });
      server.request("get", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "valid-token" }
      },
        function (res) {
          expect(res?.body).to.eql(["bob", "charles"]);
          done();
        }
      );
    });
  });

  describe('POST', function () {

    it("rejects invalid authentication token", function (done) {
      server.request("post", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "invalid-token" }
      },
        function (res) {
          assert.equal(res?.status, 401);
          expect(res?.body).to.be.a(restifyErrors.UnauthorizedError);
          done();
        }
      );
    });

    it("requires \"username\" in the request body", function (done) {
      test.authdbClient.addAccount("valid-token", { username: "alice" });
      server.request("post", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "valid-token" },
        body: {},
      },
        function (res) {
          assert.equal(res?.status, 400);
          expect(res?.body).to.be.a(restifyErrors.BadRequestError);
          done();
        }
      );
    });

    it("accepts valid requests", function (done) {
      test.authdbClient.addAccount("valid-token", { username: "alice" });
      server.request("post", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "valid-token" },
        body: { username: "bob" },
      },
        function (res) {
          assert.equal(res?.status, 200);
          done();
        }
      );
    });

    // it("returns an empty array for new users", function (done) {
    //   test.authdbClient.addAccount("valid-token", { username: "alice" });
    //   server.request("post", "/users/v1/auth/:authToken/blocked-users", {
    //     params: { authToken: "valid-token" },
    //     body: { username: "bob" },
    //   },
    //     function (res) {
    //       expect(res?.body).to.eql([]);
    //       done();
    //     }
    //   );
    // });

    function testPost({initial, block, final, done}) {
      const alice = { username: "alice" }
      test.authdbClient.addAccount("valid-token", alice);
      if (initial)
        test.centralUsermetaClient.set("alice", "$blocked", initial, _ => { });
      server.request("post", "/users/v1/auth/:authToken/blocked-users", {
        params: { authToken: "valid-token" },
        body: { username: block },
      },
        function (res) {
          expect(res?.body).to.eql(final.split(','));
          test.centralUsermetaClient.get("alice", "$blocked", (_err, reply) => {
            expect(reply).to.eql(final);

            // it should also emit an event with the removed block
            if (initial !== final) {
              td.verify(test.sendEvent("users/v1/blocked-users", "BLOCKED", {
                req_id: td.matchers.isA(String),
                type: "BLOCKED",
                username: "alice",
                target: TAGS[tagizer.tag(block)] || block,
                blocked: final.split(',')
              }));
            }
            done();
          });
        }
      );
    }

    it("adds blocked users to the central usermeta key $blocked", function (done) {
      testPost({
        initial: null, 
        block: "bob",
        final: "bob",
        done
      });
    });

    it("adds more blocked users to the central usermeta key $blocked", function (done) {
      testPost({
        initial: "bob,charles", 
        block: "danny",
        final: "bob,charles,danny",
        done
      });
    });

    it("does not block a user twice", function (done) {
      testPost({
        initial: "bob,charles",
        block: "bob",
        final: "bob,charles",
        done
      });
    });

    it("blocks users by tag", function (done) {
      testPost({
        initial: "bob",
        block: "charles-tag",
        final: "bob,charles",
        done
      });
    });

    // TODO: block by tag
  });

  describe('DEL', function () {

    it("rejects invalid authentication token", function (done) {
      server.request("del", "/users/v1/auth/:authToken/blocked-users/:tag", {
        params: { authToken: "invalid-token" }
      },
        function (res) {
          assert.equal(res?.status, 401);
          expect(res?.body).to.be.a(restifyErrors.UnauthorizedError);
          done();
        }
      );
    });

    it("requires \"tag\" in the request url", function (done) {
      test.authdbClient.addAccount("valid-token", { username: "alice" });
      server.request("del", "/users/v1/auth/:authToken/blocked-users/:tag", {
        params: {
          authToken: "valid-token",
        },
        body: {},
      },
        function (res) {
          assert.equal(res?.status, 400);
          expect(res?.body).to.be.a(restifyErrors.BadRequestError);
          done();
        }
      );
    });

    function testDel({initial, unblock, final, done}) {
      const alice = { username: "alice" }
      test.authdbClient.addAccount("valid-token", alice);
      if (initial)
        test.centralUsermetaClient.set("alice", "$blocked", initial, _ => { });
      server.request("del", "/users/v1/auth/:authToken/blocked-users/:tag", {
        params: { authToken: "valid-token", tag: unblock },
      },
        function (res) {
          expect(res?.body).to.eql(final ? final.split(',') : []);
          test.centralUsermetaClient.get("alice", "$blocked", (_err, reply) => {
            expect(reply).to.eql(final ?? null);

            // it should also emit an event with the removed block
            if ((initial ?? "") !== (final ?? "")) {
              td.verify(test.sendEvent("users/v1/blocked-users", "UNBLOCKED", {
                req_id: td.matchers.isA(String),
                type: "UNBLOCKED",
                username: "alice",
                target: TAGS[tagizer.tag(unblock)] || unblock,
                blocked: final ? final.split(',') : [],
              }));
            }
            done();
          });
        }
      );
    }

    it("removes 1 user from the central usermeta key $blocked", function (done) {
      testDel({
        initial: "bob", 
        unblock: "bob",
        final: "",
        done
      });
    });

    it("Removes a users from the central usermeta key $blocked", function (done) {
      testDel({
        initial: "bob,charles,danny", 
        unblock: "charles",
        final: "bob,danny",
        done
      });
    });

    it("does not unblock a user twice", function (done) {
      testDel({
        initial: null,
        unblock: "bob",
        final: "",
        done
      });
    });

    it("blocks users by tag", function (done) {
      testDel({
        initial: "bob,charles",
        unblock: "charles-tag",
        final: "bob",
        done
      });
    });
  });

});

// vim: ts=2:sw=2:et:

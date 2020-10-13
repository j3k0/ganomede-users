import assert from "assert";
import pingApi from "../src/ping-api";
import fakeRestify from "./fake-restify";
import restify from "restify";
const server = fakeRestify.createServer();

describe("ping-api", function() {

  before(() => pingApi.addRoutes("users", server as unknown as restify.Server));

  it("should have get and head routes", function() {
    assert.ok(server.routes.get["/users/ping/:token"]);
    assert.ok(server.routes.head["/users/ping/:token"]);
  });

  it("should reply to a ping with a pong", function() {
    server.request("get", "/users/ping/:token", {params: {token: "pop"}});
    assert.equal(server.res?.body, "pong/pop");
    server.request("head", "/users/ping/:token", {params: {token: "beep"}});
    assert.equal(server.res?.body, "pong/beep");
  });
});

// vim: ts=2:sw=2:et:

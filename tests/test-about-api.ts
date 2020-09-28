/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import aboutApi from "../src/about-api";
import fakeRestify from "./fake-restify";
const server = fakeRestify.createServer();

describe("about-api", function() {

  before(() => aboutApi.addRoutes("users", server));

  it("should have get routes", () => assert.ok(server.routes.get["/users/about"]));

  return it("should reply to a about with config info", function() {
    server.request("get", "/users/about");
    return assert.equal(server.res.body.type, "ganomede-users");
  });
});

// vim: ts=2:sw=2:et:

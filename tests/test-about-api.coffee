assert = require "assert"
aboutApi = require "../src/about-api"

fakeRestify = require "./fake-restify"
server = fakeRestify.createServer()

describe "about-api", ->

  before ->
    aboutApi.addRoutes "users", server

  it "should have get routes", ->
    assert.ok server.routes.get["/users/about"]

  it "should reply to a about with config info", ->
    server.request "get", "/users/about"
    assert.equal server.res.body.type, "ganomede-users"

# vim: ts=2:sw=2:et:

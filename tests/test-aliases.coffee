assert = require "assert"
aliases = require "../src/aliases"

describe "aliases", ->
  aliasesClient = null
  before ->
    fakeUsermetaClient =
      meta: {}
      isValid: (key) -> true
      get: (username, key, cb) ->
        cb null, @meta["#{username}:#{key}"]
      set: (username, key, value, cb) ->
        @meta["#{username}:#{key}"] = value
        cb null
    aliasesClient = aliases.createClient
      usermetaClient: fakeUsermetaClient

  it "Sets aliases", (done) ->
    aliasesClient.set "fb:123", "roger", (err) ->
      assert.ok !err
      done()

  it "Gets aliases", (done) ->
    aliasesClient.get "fb:123", (err, alias) ->
      assert.ok !err
      assert.equal "roger", alias
      done()

  it "Returns null for nonexisting aliases", (done) ->
    aliasesClient.get "none", (err, value) ->
      assert.ok !err
      assert.equal null, value
      done()


# vim: ts=2:sw=2:et:

assert = require "assert"
usermeta = require "../src/usermeta"
fakeRedis = require 'fakeredis'

describe "usermeta", ->
  redisClient = null
  before ->
    process.env.USERMETA_VALID_KEYS = "k1,ke2,key3,age,age1"
    redisClient = fakeRedis.createClient(__filename)

  it "parse USERMETA_VALID_KEYS", ->
    usermetaClient = usermeta.create redisClient: redisClient
    assert.equal true, usermetaClient.validKeys.k1
    assert.equal true, usermetaClient.validKeys.ke2
    assert.equal true, usermetaClient.validKeys.key3
    assert.equal true, usermetaClient.isValid "key3"
    assert.equal false, usermetaClient.isValid "key4"

  it "returns null for invalid data", (done) ->
    usermetaClient = usermeta.create redisClient: redisClient
    usermetaClient.get "username", "location", (err, data) ->
      assert.equal null, data
      done()

  it "sets and gets data", (done) ->
    usermetaClient = usermeta.create redisClient: redisClient
    usermetaClient.set "username", "age", "25", (err, data) ->
      assert.ok !err
      usermetaClient.get "username", "age", (err, data) ->
        assert.ok !err
        assert.equal "25", data
        done()

  it "refuses data over 200 bytes", (done) ->
    usermetaClient = usermeta.create redisClient: redisClient
    s200 = ("X" for i in [ 0 ... 200 ]).join('')
    s201 = ("X" for i in [ 0 ... 201 ]).join('')
    usermetaClient.set "username", "age1", s200, (err, data) ->
      assert.ok !err
      usermetaClient.set "username", "age2", s201, (err, data) ->
        assert.ok err
        assert.equal err.statusCode, 400
        assert.equal err.body.code, 'BadRequestError'
        done()

# vim: ts=2:sw=2:et:

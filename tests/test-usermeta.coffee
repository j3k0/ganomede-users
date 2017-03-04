assert = require "assert"
usermeta = require "../src/usermeta"
fakeRedis = require 'fakeredis'
td = require 'testdouble'

describe "usermeta", ->

  describe "RedisUsermeta", ->

    redisClient = null
    beforeEach ->
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

  describe "GanomedeUsermeta", ->

    jsonClient = null
    usermetaClient = null
    beforeEach ->
      jsonClient = td.object ['get', 'post']
      usermetaClient = usermeta.create ganomedeClient: jsonClient

    describe ".get", ->
      it "delegates to the jsonClient", ->
        usermetaClient.get "username", "age", td.function('callback')
        td.verify(jsonClient.get(
          td.matchers.contains(path: '/usermeta/v1/username/age'),
          td.callback))

      it "uses apiSecret if defined", ->
        usermetaClient.get {
          username: "username", apiSecret: "1234", authToken: "token"},
          "age", td.function('callback')
        td.verify(jsonClient.get(
          td.matchers.contains(path: '/usermeta/v1/auth/1234.username/age'),
          td.callback))

      it "uses authToken if defined", ->
        usermetaClient.get {
          username: "username", authToken: "token"},
          "age", td.function('callback')
        td.verify(jsonClient.get(
          td.matchers.contains(path: '/usermeta/v1/auth/token/age'),
          td.callback))

    describe ".set", ->
      it "delegates to the jsonClient", ->
        usermetaClient.set "username", "age", "25", td.function('callback')
        td.verify(jsonClient.post(
          td.matchers.contains(path: '/usermeta/v1/username/age'),
          {value: "25"},
          td.callback))

# vim: ts=2:sw=2:et:

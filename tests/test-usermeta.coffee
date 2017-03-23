assert = require "assert"
usermeta = require "../src/usermeta"
fakeRedis = require 'fakeredis'
td = require 'testdouble'
{expect} = require 'chai'
restify = require "restify"

describe "usermeta", ->

  describe "DirectoryAliases", ->

    publicAccount =
      id: "username"
      aliases:
        name: "name"
        tag: "guttentag"

    protectedAccount =
      id: "username"
      aliases:
        name: "myname"
        tag: "guttentag"
        email: "user@email.com"

    usermetaClient = null
    directoryClient = null
    beforeEach ->
      directoryClient = td.object ['editAccount', 'byId', 'byToken']
      td.when(directoryClient.editAccount(td.matchers.anything()))
        .thenCallback(null, {})
      td.when(directoryClient.byId(td.matchers.contains(id:"username")))
        .thenCallback(null, publicAccount)
      td.when(directoryClient.byToken(td.matchers.contains(token:"abc")))
        .thenCallback(null, protectedAccount)
      usermetaClient = usermeta.create {directoryClient}

    it "is created from a directoryClient", ->
      assert.equal "DirectoryAliasesProtected", usermetaClient.type

    it "also works in 'public' mode", ->
      usermetaClient = usermeta.create {directoryClient, mode: "public"}
      assert.equal "DirectoryAliasesPublic", usermetaClient.type

    describe '.get', ->
      it "calls back with (BadRequestError, null) for invalid data", (done) ->
        usermetaClient.get "username", "location", (err, data) ->
          expect(err).to.be.instanceof restify.BadRequestError
          assert.equal null, data
          done()

      it "requires an authToken in protected mode", (done) ->
        usermetaClient.get "username", "name", (err, data) ->
          expect(err).to.be.instanceof restify.NotAuthorizedError
          done()

      it "does not require the authToken in public mode", (done) ->
        usermetaClient = usermeta.create {directoryClient, mode: "public"}
        usermetaClient.get "username", "name", (err, data) ->
          expect(err).to.be.null
          expect(data).to.equal "name"
          done()

      it "does not allow 'password' to be read", (done) ->
        usermetaClient.get "username", "password", (err, data) ->
          expect(err).to.be.instanceof restify.BadRequestError
          done()

    describe '.set', ->
      it "requires an authToken", (done) ->
        usermetaClient.set "username", "name", "newname", (err, data) ->
          expect(err).to.be.instanceof restify.NotAuthorizedError
          done()

      it "accepts valid emails", (done) ->
        usermetaClient.set {authToken:"abc"}, "email", "user@email.com",
          (err, data) ->
            expect(err).to.be.null
            done()

      it "refuses invalid emails", (done) ->
        usermetaClient.set {authToken:"abc"}, "email", "useremail.com",
          (err, data) ->
            expect(err).to.be.instanceof restify.InvalidContentError
            done()

      it "accepts valid names", (done) ->
        usermetaClient.set {authToken:"abc"}, "name", "abcdefgh",
          (err, data) ->
            expect(err).to.be.null
            done()

      it "refuses invalid names", (done) ->
        usermetaClient.set {authToken:"abc"}, "name", "ab",
          (err, data) ->
            expect(err).to.be.instanceof restify.InvalidContentError
            done()

      it "accepts valid passwords", (done) ->
        usermetaClient.set {authToken:"abc"}, "password", "abcdefgh",
          (err, data) ->
            console.log err
            expect(err).to.be.null
            done()

      it "refuses short passwords", (done) ->
        usermetaClient.set {authToken:"abc"}, "password", "12345",
          (err, data) ->
            expect(err).to.be.instanceof restify.InvalidContentError
            done()

      it "sets and gets data", (done) ->
        usermetaClient.set {authToken:"abc"}, "email", "user@email.com",
        (err, data) ->
          expect(err).to.be.null
          usermetaClient.get {authToken:"abc"}, "email", (err, data) ->
            console.log err
            expect(err).to.be.null
            assert.equal "user@email.com", data
            done()

  describe "RedisUsermeta", ->

    usermetaClient = null
    redisClient = null
    beforeEach ->
      process.env.USERMETA_VALID_KEYS = "k1,ke2,key3,age,age1"
      redisClient = fakeRedis.createClient(__filename)
      usermetaClient = usermeta.create {redisClient}

    it "is created from a redisClient", ->
      assert.equal "RedisUsermeta", usermetaClient.type

    it "parse USERMETA_VALID_KEYS", ->
      assert.equal true, usermetaClient.validKeys.k1
      assert.equal true, usermetaClient.validKeys.ke2
      assert.equal true, usermetaClient.validKeys.key3
      assert.equal true, usermetaClient.isValid "key3"
      assert.equal false, usermetaClient.isValid "key4"

    it "returns null for invalid data", (done) ->
      usermetaClient.get "username", "location", (err, data) ->
        assert.equal null, data
        done()

    it "sets and gets data", (done) ->
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

    it "is created from a ganomedeClient", ->
      assert.equal "GanomedeUsermeta", usermetaClient.type

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

  describe "UsermetaRouter", ->

    ganomedeLocal = null
    ganomedeCentral = null
    directoryPublic = null
    directoryProtected = null
    usermetaClient = null
    username = "username"

    usermetaTD = () ->
      client = td.object ['get', 'post']
      client

    beforeEach ->
      ganomedeLocal = usermetaTD()
      ganomedeCentral = usermetaTD()
      directoryProtected = usermetaTD()
      directoryPublic = usermetaTD()
      usermetaClient = usermeta.create router: {
        ganomedeLocal, ganomedeCentral, directoryProtected, directoryPublic}

    it "is created from a router configuration", ->
      assert.equal "UsermetaRouter", usermetaClient.type

    describe ".get", ->

      it "delegates 'email' to the directoryProtected client", ->
        usermetaClient.get {username}, "email", td.function('callback')
        td.verify directoryProtected.get({username}, "email", td.callback)

      it "delegates 'name' to the directoryPublic client", ->
        usermetaClient.get {username}, "name", td.function('callback')
        td.verify directoryPublic.get({username}, "name", td.callback)

      it "delegates 'country' to the ganomedeCentral client", ->
        usermetaClient.get {username}, "country", td.function('callback')
        td.verify ganomedeCentral.get({username}, "country", td.callback)

      it "delegates all others to the ganomedeLocal client", ->
        usermetaClient.get {username}, "any", td.function('callback')
        td.verify ganomedeLocal.get({username}, "any", td.callback)

# vim: ts=2:sw=2:et:

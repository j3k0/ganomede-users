assert = require "assert"
superagent = require 'superagent'
fakeRedis = require "fakeredis"
fakeAuthdb = require "./fake-authdb"
restify = require 'restify'
api = require '../src/users-api'

PREFIX = 'users/v1'

data =
  tooshort:
    username: '01'

describe 'users-api', ->

  server = null
  authdb = null
  redis = null

  endpoint = (token, path) ->
    if !path
      path = token
      token = null
    host = "http://localhost:#{server.address().port}"
    if token
      return "#{host}/#{PREFIX}/auth/#{token}#{path}"
    else
      return "#{host}/#{PREFIX}#{path}"

  i = 0
  beforeEach (done) ->
    @timeout 10000
    i += 1
    server = restify.createServer()
    redis  = fakeRedis.createClient("test-usermeta-#{i}")
    authdb = fakeAuthdb.createClient()

    api.initialize (err) ->
      if err
        throw err
      server.use(restify.bodyParser())
      api.addRoutes(PREFIX, server)
      server.listen(1337, done)

  afterEach (done) ->
    server.close()
    server.once('close', redis.flushdb.bind(redis, done))

  describe 'POST: Create user account', () ->
    it "should allow to create user accounts", (done) ->
      @timeout 10000
      superagent
        .post endpoint "/accounts"
        .send data.tooshort
        .end (err, res) ->
          assert.equal 400, res.status
          assert.equal 'TooShortError', res.body.code
          assert.ok err
          done()

# vim: ts=2:sw=2:et:

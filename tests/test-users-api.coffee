assert = require "assert"
superagent = require 'superagent'
fakeRedis = require "fakeredis"
fakeAuthdb = require "./fake-authdb"
restify = require 'restify'
api = require '../src/users-api'

PREFIX = 'users/v1'

data =
  createAccount:
    tooshort: username: '01'
    toolong: username: '01234567890'
    invalid: username: 'café'
  passwordReset:
    email: 'test@fovea.cc'

fakeApp =
  sendPasswordResetEmail: (email, cb) ->
    @emailSent = email
    cb null

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
  before (done) ->
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
    ,
      application: fakeApp

  after (done) ->
    server.close()
    server.once('close', redis.flushdb.bind(redis, done))

  describe '/passwordResetEmail [POST] - Reset password', () ->
    
    it "should send an email", (done) ->
      superagent
        .post endpoint "/passwordResetEmail"
        .send data.passwordReset
        .end (err, res) ->
          assert.equal 200, res.status
          assert.ok !err
          assert.equal data.passwordReset.email, fakeApp.emailSent
          done()

  describe '/accounts [POST] - Create user account', () ->

    it "should refuse short usernames", (done) ->
      @timeout 10000
      superagent
        .post endpoint "/accounts"
        .send data.createAccount.tooshort
        .end (err, res) ->
          assert.equal 400, res.status
          assert.equal 'TooShortError', res.body.code
          assert.ok err
          done()

    it "should refuse special characters", (done) ->
      @timeout 10000
      superagent
        .post endpoint "/accounts"
        .send data.createAccount.invalid
        .end (err, res) ->
          assert.equal 400, res.status
          assert.equal 'BadUsernameError', res.body.code
          assert.ok err
          done()

    it "should refuse long usernames", (done) ->
      @timeout 10000
      superagent
        .post endpoint "/accounts"
        .send data.createAccount.toolong
        .end (err, res) ->
          assert.equal 400, res.status
          assert.equal 'TooLongError', res.body.code
          assert.ok err
          done()

# vim: ts=2:sw=2:et:

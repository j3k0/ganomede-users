assert = require "assert"
superagent = require 'superagent'
fakeRedis = require "fakeredis"
fakeAuthdb = require "./fake-authdb"
restify = require 'restify'
api = require '../src/users-api'
{expect} = require 'chai'

PREFIX = 'users/v1'

data =
  createAccount:
    tooshort: username: '01'
    toolong: username: '01234567890'
    invalid: username: 'café'
    valid:
      username: 'jeko'
  passwordReset:
    email: 'test@fovea.cc'
  tokens: [{
    createAccountKey: 'valid'
    token: 'deadbeef'
  }]

fakeApp =
  sendPasswordResetEmail: (email, cb) ->
    @emailSent = email
    cb null

fakeAccountCreator =
  create: (account, cb) ->
    cb null,
      username: account.username

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

    data.tokens.forEach (info) ->
      authdb.addAccount(info.token, {
        username: data.createAccount[info.createAccountKey].username
      })

    api.initialize (err) ->
      if err
        throw err
      server.use(restify.bodyParser())
      api.addRoutes(PREFIX, server)
      server.listen(1337, done)
    ,
      application: fakeApp
      accountCreator: fakeAccountCreator,
      authdbClient: authdb

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

    it "should register valid users", (done) ->
      @timeout 10000
      superagent
        .post endpoint "/accounts"
        .send data.createAccount.valid
        .end (err, res) ->
          assert.equal 200, res.status
          assert.ok !err
          assert.equal data.createAccount.valid.username, res.body.username
          done()

  describe '/banned-users Banning Users', () ->
    username = data.createAccount.valid.username
    started = Date.now()

    describe 'POST', () ->
      it 'bans people', (done) ->
        superagent
          .post endpoint('/banned-users')
          .send({username, apiSecret: process.env.API_SECRET})
          .end (err, res) ->
            expect(err).to.be.null
            expect(res.status).to.equal(200)
            done()

      it 'requires apiSecret', (done) ->
        superagent
          .post endpoint('/banned-users')
          .send({username})
          .end (err, res) ->
            expect(err).to.be.instanceof(Error)
            expect(res.status).to.equal(403)
            done()

    describe 'Banned users…', () ->
      it 'can\'t login', (done) ->
        superagent
          .post endpoint('/login')
          .send({username, password: 'wever'})
          .end (err, res) ->
            expect(err).to.be.instanceof(Error)
            expect(res.status).to.be.equal(403)
            expect(res.text).to.be.equal('')
            done()

      it 'can\'t access profile at /me', (done) ->
        superagent
          .get endpoint('/auth/deadbeef/me')
          .end (err, res) ->
            expect(err).to.be.instanceof(Error)
            expect(res.status).to.be.equal(403)
            expect(res.text).to.be.equal('')
            done()

    describe 'GET /banned-users/:username', () ->
      it 'returns ban timestamp', (done) ->
        superagent
          .get endpoint("/banned-users/#{username}")
          .end (err, res) ->
            expect(err).to.be.null
            expect(res.status).to.equal(200)
            expect(res.body).to.be.within(started, Date.now())
            done()

    describe 'DELETE', () ->
      it 'removes bans', (done) ->
        superagent
          .del endpoint("/banned-users/#{username}")
          .send({apiSecret: process.env.API_SECRET})
          .end (err, res) ->
            expect(err).to.be.null

            superagent
              .get endpoint("/banned-users/#{username}")
              .end (err, res) ->
                expect(err).to.be.null
                expect(res.status).to.equal(200)
                expect(res.body).to.equal('0')
                done()

      it 'requires apiSecret', (done) ->
        superagent
          .del endpoint("/banned-users/#{username}")
          .end (err, res) ->
            expect(err).to.be.instanceof(Error)
            expect(res.status).to.equal(403)
            done()

# vim: ts=2:sw=2:et:

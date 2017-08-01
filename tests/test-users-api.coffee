assert = require "assert"
superagent = require 'superagent'
fakeRedis = require "fakeredis"
fakeAuthdb = require "./fake-authdb"
fakeUsermeta = require "./fake-usermeta"
restify = require 'restify'
api = require '../src/users-api'
{expect} = require 'chai'
{BanInfo} = require '../src/bans'
td = require 'testdouble'
{contains} = td.matchers

PREFIX = 'users/v1'
VALID_AUTH_TOKEN = 'deadbeef'
data =
  validLogin:
    username: 'jeko'
    password: '12345678'
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
    token: VALID_AUTH_TOKEN
  }]
apiSecret = process.env.API_SECRET

baseTest = ->
  #log = require '../src/log'
  log = td.object [ 'info', 'warn', 'error' ]
  localUsermetaClient = td.object [ 'get', 'set' ]
  centralUsermetaClient = td.object [ 'get', 'set' ]

  backend = td.object [
    'initialize'
    'loginAccount'
    'createAccount'
    'sendPasswordResetEmail'
  ]
  createBackend = td.function 'createBackend'
  td.when(createBackend(td.matchers.isA Object))
    .thenReturn backend
  missAuthenticator = ({ authenticator }) -> !authenticator
  td.when(createBackend(td.matchers.argThat missAuthenticator))
    .thenThrow new Error()

  authenticator = td.object [ 'add' ]

  td.when(backend.loginAccount td.matchers.anything())
    .thenCallback new restify.InvalidCredentialsError()
  td.when(backend.loginAccount data.validLogin)
    .thenCallback null, token:VALID_AUTH_TOKEN

  directoryClient = td.object ['editAccount', 'byId', 'byToken', 'byAlias']
  td.when(directoryClient.byAlias(
    td.matchers.contains({type: "tag"}),
    td.matchers.isA(Function)))
      .thenDo (alias, cb) -> cb(null, {id: alias.value})

  callback = td.function 'callback'
  authdbClient = fakeAuthdb.createClient()
  options = { log, localUsermetaClient, centralUsermetaClient,
    createBackend, authdbClient, authenticator, directoryClient }
  { callback, options,
    createBackend, backend, localUsermetaClient, centralUsermetaClient,
    authdbClient, directoryClient }

i = 0
restTest = (done) ->
  ret = baseTest()
  td.when(ret.backend.initialize()).thenCallback null, ret.backend

  ret.endpoint = (token, path) ->
    if !path
      path = token
      token = null
    host = "http://localhost:#{server.address().port}"
    if token
      return "#{host}/#{PREFIX}/auth/#{token}#{path}"
    else
      return "#{host}/#{PREFIX}#{path}"

  i += 1
  server = restify.createServer()
  localUsermeta = fakeUsermeta.createClient()
  centralUsermeta = fakeUsermeta.createClient()
  ret.bans = td.object require('../src/bans').Bans

  data.tokens.forEach (info) ->
    ret.authdbClient.addAccount(info.token, {
      username: data.createAccount[info.createAccountKey].username
    })

  ret.close = (done) ->
    server.close()
    done()

  ret.start = (cb) ->
    options =
      # log: td.object [ 'info', 'warn', 'error' ]
      localUsermetaClient: localUsermeta
      centralUsermetaClient: centralUsermeta
      authdbClient: ret.authdbClient
      createBackend: ret.createBackend
      directoryClient: ret.directoryClient
      bans: ret.bans
    api.initialize (err) ->
      if err
        throw err
      server.use(restify.bodyParser())
      api.addRoutes(PREFIX, server)
      server.listen(1337, cb)
    , options

  ret

describe 'users-api', ->

  describe 'initialize()', ->

    it 'callbacks when done', ->
      { callback, options, backend } = baseTest()
      td.when(backend.initialize()).thenCallback null
      api.initialize callback, options
      td.verify callback()

    it 'fails when backend initialization fails', ->
      err = new Error("failed")
      { callback, options, backend } = baseTest()
      td.when(backend.initialize()).thenCallback err
      api.initialize callback, options
      td.verify callback(err)

  describe 'REST API', ->

    test = null
    endpoint = null
    beforeEach (done) ->
      test = restTest()
      endpoint = test.endpoint
      test.start done
    afterEach (done) ->
      test.close done

    noError = (err) ->
      if err
        if err.response
          console.dir err.response.error
        else
          console.dir err
      assert.ok !err

    describe.skip '/login [POST] - Logs in a user', ->

      it "should accept valid credentials", (done) ->
        { test } = test
        superagent
          .post endpoint '/login'
          .send data.validLogin
          .end (err, res) ->
            noError err
            assert.equal 200, res.status
            expect(res.body).to.eql token:VALID_AUTH_TOKEN
            done()
        return

    describe '/auth/:token/me [GET] - Retrieve user data', () ->

      it "responds with user data", (done) ->
        username = data.createAccount.valid.username
        td.when(test.bans.get {username,apiSecret})
          .thenCallback null, new BanInfo(username, 0)
        superagent
          .get endpoint(VALID_AUTH_TOKEN, "/me")
          .end (err, res) ->
            noError err
            assert.equal 200, res.status
            expect(res.body).to.eql(
              username: username
              metadata:
                country: null
                yearofbirth: null)
            done()
        return

    describe '/passwordResetEmail [POST] - Reset password', () ->

      it "should send an email", (done) ->
        { backend } = test
        td.when(backend.sendPasswordResetEmail(
          contains email:data.passwordReset.email))
            .thenCallback null
        superagent
          .post endpoint "/passwordResetEmail"
          .send data.passwordReset
          .end (err, res) ->
            noError err
            assert.equal 200, res.status
            expect(res.body).to.eql(ok:true)
            done()
        return

    describe '/accounts [POST] - Create user account', () ->

      it "should refuse short usernames", (done) ->
        superagent
          .post endpoint "/accounts"
          .send data.createAccount.tooshort
          .end (err, res) ->
            assert.equal 400, res.status
            assert.equal 'TooShortError', res.body.code
            assert.ok err
            done()
        return

      it "should refuse special characters", (done) ->
        superagent
          .post endpoint "/accounts"
          .send data.createAccount.invalid
          .end (err, res) ->
            assert.equal 400, res.status
            assert.equal 'BadUsernameError', res.body.code
            assert.ok err
            done()
        return

      it "should refuse long usernames", (done) ->
        superagent
          .post endpoint "/accounts"
          .send data.createAccount.toolong
          .end (err, res) ->
            assert.equal 400, res.status
            assert.equal 'TooLongError', res.body.code
            assert.ok err
            done()
        return

      it "should register valid users", (done) ->

        # Backend's create account will be called with this
        { backend } = test
        createAccountData =
          id:       data.createAccount.valid.username
          username: data.createAccount.valid.username
          email:    data.createAccount.valid.email
          password: data.createAccount.valid.password
        td.when(backend.createAccount(
          td.matchers.contains(createAccountData)))
            .thenCallback null, data.createAccount.valid

        superagent
          .post endpoint "/accounts"
          .send data.createAccount.valid
          .end (err, res) ->
            noError err
            assert.equal 200, res.status
            assert.equal data.createAccount.valid.username, res.body.username
            done()
        return

    describe '/banned-users Banning Users', () ->

      username = data.createAccount.valid.username
      BAN_TIMESTAMP=123
      beforeEach ->
        td.when(test.bans.get {username,apiSecret})
          .thenCallback null, new BanInfo(username, ''+BAN_TIMESTAMP)

      describe 'POST', () ->

        it 'bans people', (done) ->
          td.when(test.bans.ban {
            username
            apiSecret
          }).thenCallback null
          superagent
            .post endpoint('/banned-users')
            .send({username, apiSecret})
            .end (err, res) ->
              noError err
              expect(res.status).to.equal(200)
              done()
          return

        it 'requires apiSecret', (done) ->
          superagent
            .post endpoint('/banned-users')
            .send({username})
            .end (err, res) ->
              expect(err).to.be.instanceof(Error)
              expect(res.status).to.equal(403)
              done()
          return

      describe 'Banned users…', () ->

        it 'can\'t login', (done) ->
          superagent
            .post endpoint('/login')
            .send({username, password: 'wever'})
            .end (err, res) ->
              expect(err).to.be.instanceof(Error)
              expect(res.status).to.be.equal(403)
              expect(res.body.code).to.be.equal('ForbiddenError')
              done()
          return

        it 'can\'t access profile at /me', (done) ->
          superagent
            .get endpoint(VALID_AUTH_TOKEN, '/me')
            .end (err, res) ->
              expect(err).to.be.instanceof(Error)
              expect(res.status).to.be.equal(403)
              expect(res.body.code).to.be.equal('ForbiddenError')
              done()
          return

        it 'nullifies authdb accounts after banned username
            tries to access any :authToken endpoint', (done) ->
          expect(test.authdbClient.store[VALID_AUTH_TOKEN]).to.be.ok
          superagent
            .get endpoint(VALID_AUTH_TOKEN, '/me')
            .end (err, res) ->
              expect(err).to.be.instanceof(Error)
              expect(res.status).to.be.equal(403)
              expect(test.authdbClient.store[VALID_AUTH_TOKEN]).to.be.null
              done()
          return

      describe 'GET /banned-users/:username', () ->
        it 'returns ban timestamp', (done) ->
          superagent
            .get endpoint("/banned-users/#{username}")
            .end (err, res) ->
              if err
                console.dir err
              expect(err).to.be.null
              expect(res.status).to.equal(200)
              expect(res.body).to.be.instanceof(Object)
              expect(res.body).to.be.ok
              expect(res.body.username).to.equal(username)
              expect(res.body.exists).to.be.true
              expect(res.body.createdAt).to.equal(BAN_TIMESTAMP)
              done()
          return

      describe 'DELETE', () ->
        it 'removes bans', (done) ->
          td.when(test.bans.unban td.matchers.isA Object)
            .thenCallback null
          superagent
            .del endpoint("/banned-users/#{username}")
            .send({apiSecret})
            .end (err, res) ->
              noError err
              td.verify(test.bans.unban {username, apiSecret}, td.callback)
              done()
          return

        it 'requires apiSecret', (done) ->
          superagent
            .del endpoint("/banned-users/#{username}")
            .end (err, res) ->
              expect(err).to.be.instanceof(Error)
              expect(res.status).to.equal(403)
              done()
          return

# vim: ts=2:sw=2:et:

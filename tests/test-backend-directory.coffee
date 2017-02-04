_ = require 'lodash'
restify = require "restify"
td = require 'testdouble'
{expect} = require 'chai'
tagizer = require 'ganomede-tagizer'

directory = require '../src/backend/directory'

{ EXISTING_USER, SECONDARY_USER, NEW_USER, APP_ID,
  credentials, publicAccount, authResult,
  account, authAccount, facebookAccount,
  directoryAccount, directoryAliasesObj,
  facebookLogin
} = require './directory-data.coffee'

# testdouble for the directory client
directoryClientTD = ->

  directoryClient = td.object [
    'authenticate'
    'addAccount'
    'byAlias'
  ]

  # .authenticate() with wrong credentials
  td.when(directoryClient.authenticate(
    td.matchers.anything()))
      .thenCallback new restify.InvalidCredentialsError()

  # .authenticate() with correct credentials
  td.when(directoryClient.authenticate(
    td.matchers.contains directoryAccount(EXISTING_USER)))
      .thenCallback null, authResult(EXISTING_USER)

  # .addAccount() succeeds
  td.when(directoryClient.addAccount(
    td.matchers.anything()))
      .thenCallback null

  # .addAccount() fails if user already exists
  td.when(directoryClient.addAccount(
    td.matchers.contains(directoryAccount(EXISTING_USER))))
      .thenCallback new restify.ConflictError

  # .byAlias() fails when alias not in directory
  td.when(directoryClient.byAlias(
    td.matchers.anything()))
      .thenCallback new restify.NotFoundError()

  # .byAlias() loads existing user by facebook id
  td.when(directoryClient.byAlias(
    td.matchers.contains
      type: "facebook.id.#{APP_ID}"
      value: EXISTING_USER.facebook_id
  )).thenCallback null,
    id: EXISTING_USER.id
    aliases: directoryAliasesObj EXISTING_USER

  directoryClient

authenticatorTD = ->

  authenticator = td.object [ 'add' ]
  addUser = (user) ->
    td.when(authenticator.add(
      td.matchers.contains publicAccount user))
        .thenReturn authAccount user
  [ EXISTING_USER, SECONDARY_USER, NEW_USER ].forEach addUser
  authenticator

fbgraphTD = ->

  fbgraph = td.object [ 'get' ]
  td.when(fbgraph.get(td.matchers.anything()))
    .thenCallback new Error("fbgraph.get failed")
  addUser = (user) ->
    token = "access_token=#{user.facebook_access_token}"
    uri = "/me?fields=id,name,email&#{token}"
    td.when(fbgraph.get(uri))
      .thenCallback null,
        id: user.facebook_id
        email: user.email
        fullName: user.fullName
  [ EXISTING_USER, SECONDARY_USER, NEW_USER ].forEach addUser
  fbgraph

aliasesClientTD = ->
  aliasesClient = td.object [ 'get' ]

  td.when(aliasesClient.get td.matchers.isA String)
    .thenCallback null, ''

  td.when(aliasesClient.get "fb:#{SECONDARY_USER.facebook_id}")
    .thenCallback null, SECONDARY_USER.username

  aliasesClient

baseTest = ->
  log = td.object [ 'info', 'warn', 'error' ]
  fbgraph = fbgraphTD()
  directoryClient = directoryClientTD()
  authenticator = authenticatorTD()
  aliasesClient = aliasesClientTD()
  backend = directory.createBackend {
    log, authenticator, directoryClient, fbgraph,
    facebookAppId: APP_ID, aliasesClient }
  callback = td.function 'callback'
  { callback, directoryClient, backend, aliasesClient }

backendTest = ->
  ret = baseTest()
  ret.backend.initialize (err, backend) ->
    ret.backend = backend
  ret

describe 'backend/directory', ->

  describe '.createBackend()', ->

    it 'create a directory backend', ->
      { backend } = baseTest()
      expect(backend).to.be.an 'object'

  describe 'backend.initialize()', ->

    it 'loads the backend object', ->
      { backend, callback } = baseTest()
      backend.initialize callback
      td.verify callback null, td.matchers.isA(Object)

  describe 'backend.loginAccount()', ->

    loginAccount = (credentials) ->
      ret = backendTest()
      ret.backend.loginAccount credentials, ret.callback
      ret

    it 'attempts to authenticate with directory', ->
      { directoryClient } = loginAccount credentials(EXISTING_USER)
      td.verify directoryClient.authenticate(
        td.matchers.contains(directoryAccount(EXISTING_USER)),
        td.callback)

    it 'creates a auth token when login is successfull', ->
      { callback } = loginAccount credentials(EXISTING_USER)
      td.verify callback null, authResult(EXISTING_USER)

    it 'fails when credentials are invalid', ->
      { callback } = loginAccount credentials(NEW_USER)
      td.verify callback td.matchers.isA(restify.InvalidCredentialsError)

  describe 'backend.createAccount()', ->

    createAccount = (account) ->
      ret = backendTest()
      ret.backend.createAccount account, ret.callback
      ret

    hasAlias = (matchedAlias) -> (account) ->
      account.aliases.filter((testedAlias) ->
        testedAlias.type == matchedAlias.type and
          testedAlias.value == matchedAlias.value and
          testedAlias.public == matchedAlias.public
      ).length > 0

    it 'adds an account with the provided id and password', ->
      { directoryClient } = createAccount account(NEW_USER)
      td.verify directoryClient.addAccount(
        td.matchers.contains(directoryAccount(NEW_USER)),
        td.callback)

    it 'adds the email as a private alias', ->
      { directoryClient } = createAccount account(NEW_USER)
      emailAlias =
        type: 'email'
        public: false
        value: NEW_USER.email
      td.verify directoryClient.addAccount(
        td.matchers.argThat(hasAlias(emailAlias)),
        td.callback)

    it 'adds the name as a public alias', ->
      { directoryClient } = createAccount account(NEW_USER)
      nameAlias =
        type: 'name'
        public: true
        value: NEW_USER.username
      td.verify directoryClient.addAccount(
        td.matchers.argThat(hasAlias(nameAlias)),
        td.callback)

    it 'adds the tag as a public alias', ->
      { directoryClient } = createAccount account(NEW_USER)
      tagAlias =
        type: 'tag'
        public: true
        value: tagizer(NEW_USER.username)
      td.verify directoryClient.addAccount(
        td.matchers.argThat(hasAlias(tagAlias)),
        td.callback)

    it 'calls back on success', ->
      { callback } = createAccount account(NEW_USER)
      td.verify callback null

    it 'fails when the given ID is not available', ->
      { backend, directoryClient, callback } = backendTest()
      backend.createAccount account(EXISTING_USER), callback
      td.verify callback td.matchers.isA restify.ConflictError

  describe.skip 'backend.sendPasswordResetEmail()', ->

    sendPasswordResetEmail = (email) ->
      ret = backendTest()
      ret.backend.sendPasswordResetEmail email, ret.callback
      ret

    it 'calls the callback with success when email exists', ->
      { callback } = sendPasswordResetEmail EMAIL
      td.verify callback null

    it 'fails when the email is not known', ->
      { callback } = sendPasswordResetEmail "wrong-email"
      td.verify callback td.matchers.isA Error

  describe 'backend.loginFacebook()', ->

    loginFacebook = (account, callback) ->
      ret = backendTest()
      ret.backend.loginFacebook account, callback || ret.callback
      ret

    loginWithout = (fieldname) ->
      data =
        accessToken: 'dummy'
        username: 'dummy'
        password: 'dummy'
      delete data[fieldname]
      { callback } = loginFacebook data, (err) ->
        expect(err).to.be.a(restify.BadRequestError)

    it 'requires an accessToken', -> loginWithout 'accessToken'
    it 'requires an username', -> loginWithout 'username'
    it 'requires an password', -> loginWithout 'password'

    it 'checks facebook id with directory client', (done) ->
      { directoryClient } = loginFacebook facebookLogin(NEW_USER),
      (err, account) ->
        expect(err).to.be.null
        td.verify directoryClient.byAlias(
          td.matchers.contains(
            type: "facebook.id.#{APP_ID}"
            value: NEW_USER.facebook_id),
          td.callback)
        done()

    it 'checks "fb:facebook_id" alias if not in directory', (done) ->
      { aliasesClient } = loginFacebook facebookLogin(NEW_USER),
      (err, account) ->
        td.verify aliasesClient.get(
          "fb:#{NEW_USER.facebook_id}",
          td.callback)
        done()

    it 'logins directory-existing users', (done) ->
      loginFacebook facebookLogin(EXISTING_USER),
      (err, account) ->
        expect(err).to.be.null
        expect(account.token).to.eql EXISTING_USER.token
        done()

    it 'logins legacy-existing users', (done) ->
      loginFacebook facebookLogin(SECONDARY_USER),
      (err, account) ->
        expect(err).to.be.null
        expect(account.token).to.eql SECONDARY_USER.token
        done()

    it 'registers non existing user', (done) ->
      { directoryClient } = loginFacebook facebookLogin(NEW_USER),
      (err, account) ->
        expect(err).to.be.null
        expect(account.token).to.eql NEW_USER.token
        td.verify directoryClient.addAccount(
          td.matchers.contains(id:NEW_USER.id),
          td.callback)
        done()

# vim: ts=2:sw=2:et:

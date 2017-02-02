_ = require 'lodash'
restify = require "restify"
td = require 'testdouble'
{expect} = require 'chai'
tagizer = require 'ganomede-tagizer'

directory = require '../src/backend/directory'

{ EXISTING_USER, NEW_USER,
  credentials, publicAccount, authResult,
  account, authAccount, facebookAccount,
  directoryAccount
} = require './directory-data.coffee'

# testdouble for the directory client
directoryClientTD = ->

  directoryClient = td.object [
    'authenticate'
    'addAccount'
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

  directoryClient

authenticatorTD = ->

  authenticator = td.object [ 'add' ]
  td.when(authenticator.add(
    td.matchers.contains publicAccount EXISTING_USER))
      .thenReturn authAccount EXISTING_USER

baseTest = ->
  log = td.object [ 'info', 'warn', 'error' ]
  directoryClient = directoryClientTD()
  authenticator = authenticatorTD()
  backend = directory.createBackend {
    log, authenticator, directoryClient }
  callback = td.function 'callback'
  { callback, directoryClient, backend }
  
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

  describe.skip 'backend.loginFacebook()', ->

# vim: ts=2:sw=2:et:

# Test for the "failover" backend
#
# failover backend is configured to handle accounts
# using a primary backend, and failover to a secondary
# backend on failure.

_ = require 'lodash'
restify = require "restify"
td = require 'testdouble'
{expect} = require 'chai'
tagizer = require 'ganomede-tagizer'

failover = require '../src/backend/failover'

{ EXISTING_USER, SECONDARY_USER, NEW_USER,
  credentials, publicAccount, authResult,
  account, authAccount, facebookAccount,
  directoryAccount, facebookLogin
} = require './directory-data.coffee'

authenticatorTD = ->

  authenticator = td.object [ 'add' ]
  td.when(authenticator.add(
    td.matchers.contains publicAccount EXISTING_USER))
      .thenReturn authAccount EXISTING_USER

backendTD = (existing) ->
  ret = td.object [ 'initialize' ]
  backend = td.object [
    'loginAccount'
    'createAccount'
    'loginFacebook'
    'sendPasswordResetEmail'
  ]

  # login any user fails with UserNotFoundError
  td.when(backend.loginAccount td.matchers.anything())
    .thenCallback new restify.ResourceNotFoundError()

  # login any user fails with InvalidCredentialsError
  td.when(backend.loginAccount
    td.matchers.contains {username: existing.username})
      .thenCallback new restify.InvalidCredentialsError()

  # login the existing user succeeds
  td.when(backend.loginAccount(
    td.matchers.contains credentials(existing)))
    .thenCallback null, authResult(existing)

  # login with facebook
  td.when(backend.loginFacebook(
    td.matchers.anything()))
    .thenCallback new Error("failed facebook login")

  # login with facebook
  td.when(backend.loginFacebook(
    td.matchers.contains facebookLogin(existing)))
    .thenCallback null, authResult(existing)

  # initialize() returns the backend object
  td.when(ret.initialize()).thenCallback null, backend
  ret

baseTest = ->
  log = td.object [ 'debug', 'info', 'warn', 'error' ]
  #tb = require('bunyan').createLogger({name:'tbf'})
  #td.when(log.debug(), {ignoreExtraArgs:true})
  #  .thenDo(tb.info.bind tb)
  authenticator = authenticatorTD()
  primary = backendTD EXISTING_USER
  secondary = backendTD SECONDARY_USER
  backend = failover.createBackend {
    log, authenticator, primary, secondary }
  callback = td.function 'callback'
  { callback, backend, primary, secondary }
  
backendTest = ->
  ret = baseTest()
  ret.backend.initialize (err, backend) ->
    ret.backend = backend
    ret.primary = backend.primary
    ret.secondary = backend.secondary
  ret

describe 'backend/failover', ->

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
    
    it 'attempts to authenticate with primary', ->
      { primary } = loginAccount credentials(EXISTING_USER)
      td.verify primary.loginAccount(credentials(EXISTING_USER), td.callback)

    it 'creates a auth token when login user from primary', ->
      { callback } = loginAccount credentials(EXISTING_USER)
      td.verify callback null, authResult(EXISTING_USER)

    it 'creates a auth token when login user from secondary', ->
      { primary, secondary, callback
      } = loginAccount credentials(SECONDARY_USER)
      td.verify callback null, authResult(SECONDARY_USER)
      # also checks that it indeed checked the primary, then secondary
      td.verify primary.loginAccount(credentials(SECONDARY_USER), td.callback)
      td.verify secondary.loginAccount(credentials(SECONDARY_USER), td.callback)

    it 'fails when credentials are invalid', ->
      { callback } = loginAccount credentials(NEW_USER)
      td.verify callback td.matchers.isA(restify.ResourceNotFoundError)

  describe.skip 'backend.createAccount()', ->

    createAccount = (account) ->
      ret = backendTest()
      ret.backend.createAccount account, ret.callback
      ret

    hasAlias = (matchedAlias) -> (aliases) ->
      aliases.filter((testedAlias) ->
        testedAlias.type == matchedAlias.type and
          testedAlias.value == matchedAlias.value and
          testedAlias.public == matchedAlias.public
      ).length > 0

    it 'adds an account with the provided id and password', ->
      { directoryClient } = createAccount account(NEW_USER)
      td.verify directoryClient.addAccount(
        directoryAccount(NEW_USER), td.matchers.anything(), td.callback)

    it 'adds the email as a private alias', ->
      { directoryClient } = createAccount account(NEW_USER)
      emailAlias =
        type: 'email'
        public: false
        value: NEW_USER.email
      td.verify directoryClient.addAccount(
        directoryAccount(NEW_USER),
        td.matchers.argThat(hasAlias(emailAlias)),
        td.callback)

    it 'adds the name as a public alias', ->
      { directoryClient } = createAccount account(NEW_USER)
      nameAlias =
        type: 'name'
        public: true
        value: NEW_USER.username
      td.verify directoryClient.addAccount(
        directoryAccount(NEW_USER),
        td.matchers.argThat(hasAlias(nameAlias)),
        td.callback)

    it 'adds the tag as a public alias', ->
      { directoryClient } = createAccount account(NEW_USER)
      tagAlias =
        type: 'tag'
        public: true
        value: tagizer(NEW_USER.username)
      td.verify directoryClient.addAccount(
        directoryAccount(NEW_USER),
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

    loginFacebook = (account) ->
      ret = backendTest()
      ret.backend.loginFacebook account, ret.callback
      ret
    
    it 'attempts login with primary backend', ->
      account = facebookLogin EXISTING_USER
      { callback, primary } = loginFacebook account
      td.verify primary.loginFacebook(account, td.callback)
      td.verify callback(null, authResult(EXISTING_USER))


# vim: ts=2:sw=2:et:

# vim: ts=2:sw=2:et:

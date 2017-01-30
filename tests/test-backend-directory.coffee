restify = require "restify"
td = require 'testdouble'
{expect} = require 'chai'

directory = require '../src/backend/directory'

# test data
USERNAME  = 'jeko'
EMAIL     = 'user@email.com'
PASSWORD  = '123456'
AUTH_TOKEN = 'auth-token'
FACEBOOK_ID = '6777'
FACEBOOK_ACCESS_TOKEN = 'access-token'

CREDENTIALS =
  username: USERNAME
  password: PASSWORD

ACCOUNT =
  username: USERNAME
  email:    EMAIL
  password: PASSWORD

FACEBOOK_ACCOUNT =
  username: USERNAME
  password: PASSWORD
  facebookId: FACEBOOK_ID
  accessToken: FACEBOOK_ACCESS_TOKEN

AUTH_RESULT =
  token: AUTH_TOKEN

PUBLIC_ACCOUNT =
  username: USERNAME
  email: EMAIL

AUTH_ACCOUNT =
  username: USERNAME
  email: EMAIL
  token: AUTH_TOKEN

directoryClientTD = ->
  directoryClient = td.object [
    'authenticate' ]

  # directoryClient.authenticate() with wrong credentials
  td.when(directoryClient.authenticate(
    td.matchers.anything()))
    .thenCallback new restify.ForbiddenError(
      'InvalidCredential',
      'Please check your username and password')

  # directoryClient.authenticate() with correct credentials
  td.when(directoryClient.authenticate(
    td.matchers.contains CREDENTIALS))
    .thenCallback null, AUTH_RESULT

  directoryClient

baseTest = ->
  log = td.object [ 'info', 'warn', 'error' ]
  authenticator = td.object [ 'add' ]
  directoryClient = directoryClientTD()

  td.when(authenticator.add td.matchers.contains PUBLIC_ACCOUNT)
    .thenReturn AUTH_ACCOUNT
  backend = directory.createBackend {
    log, authenticator, directoryClient }
  callback = td.function 'callback'
  { callback, directoryClient, backend }
  
initTest = ->
  ret = baseTest()

backendTest = ->
  ret = initTest()
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
      { backend, callback } = initTest()
      backend.initialize callback
      td.verify callback null, td.matchers.isA(Object)

  describe 'backend.loginAccount()', ->

    loginAccount = (credentials) ->
      ret = backendTest()
      ret.backend.loginAccount credentials, ret.callback
      ret
    
    it 'attempts to authenticate with directory', ->
      { directoryClient } = loginAccount(CREDENTIALS)
      td.verify directoryClient.authenticate(CREDENTIALS, td.callback)

    it 'creates a auth token when login is successfull', ->
      { callback } = loginAccount(CREDENTIALS)
      td.verify callback null, AUTH_RESULT

    it 'fails when credentials are invalid', ->
      { callback } = loginAccount
        username: USERNAME
        password: 'wrong-password'
      td.verify callback td.matchers.isA(restify.ForbiddenError)

# vim: ts=2:sw=2:et:

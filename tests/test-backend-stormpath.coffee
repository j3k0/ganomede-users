stormpath = require '../src/backend/stormpath'
stats = require('../src/statsd-wrapper').dummyClient()
{expect} = require 'chai'
td = require 'testdouble'

APP_NAME = 'app-name'
APP_HREF = 'http://app-name'
validConfig = appName: APP_NAME
validAccount =
  username: 'jeko'
  password: '123456'
fullAccount =
  username: 'jeko'
  email: 'jeko@email.com'
AUTH_TOKEN = 'auth-token'

baseTest = ->
  log = td.object [ 'info', 'warn', 'error' ]
  client = td.object [
    'getApplications',
    'getApplication',
    'createApplication' ]
  spFacebook = td.object [ 'createClient' ]
  spFacebookClient = login:td.function 'stormpathFacebook.login'
  td.when(spFacebook.createClient td.matchers.anything())
    .thenReturn spFacebookClient
  authenticator = td.object [ 'add' ]
  td.when(authenticator.add(td.matchers.isA(Object)))
    .thenReturn token:AUTH_TOKEN
  backend = stormpath.createBackend {
    log, client, spFacebook, authenticator,
    appName: APP_NAME }
  callback = td.function 'callback'
  { callback, backend, client, spFacebookClient }

initTest = ->
  ret = baseTest()
  ret.application = td.object [
    'createAccount'
    'authenticateAccount'
    'sendPasswordResetEmail' ]

  td.when(ret.client.getApplications())
    .thenCallback null, items: [ name: APP_NAME, href: APP_HREF ]
  td.when(ret.client.getApplication APP_HREF)
    .thenCallback null, ret.application
  ret

backendTest = ->
  ret = initTest()
  ret.backend.initialize (err, backend) ->
    ret.backend = backend
  ret

authTest = ->
  ret = backendTest()
  ret.authResult = td.object [ 'getAccount' ]
  td.when(ret.authResult.getAccount())
    .thenCallback null, fullAccount
  td.when(ret.application.authenticateAccount validAccount)
    .thenCallback null, ret.authResult
  return ret

describe 'backend/stormpath', ->

  describe '.createBackend()', ->

    it 'create a stormpathBackend', ->
      { backend } = baseTest()
      expect(backend).to.be.an 'object'

  describe 'backend.initialize()', ->

    it 'creates stormpath application when it does not exist', ->
      { backend, callback, client } = baseTest()
      td.when(client.getApplications())
        .thenCallback null, items: []
      backend.initialize callback
      td.verify client.createApplication(
        td.matchers.contains(name: APP_NAME),
        createDirectory: true,
        td.callback
      )

    it 'loads the stormpath application', ->
      { backend, callback } = initTest()
      backend.initialize callback
      td.verify callback null, td.matchers.isA(Object)

  describe 'backend.loginFacebook()', ->

    it 'delegates login to stormpath-facebook', ->
      { backend, spFacebookClient } = backendTest()
      backend.loginFacebook '123'
      td.verify spFacebookClient.login '123'

  describe 'backend.loginAccount()', ->
    
    it 'attempts to authenticate with stormpath', ->
      { backend, callback, application } = backendTest()
      backend.loginAccount validAccount, callback
      td.verify application.authenticateAccount(
        validAccount, td.callback)

    it 'creates a auth token when login is successfull', ->
      { backend, callback } = authTest()
      backend.loginAccount validAccount, callback
      td.verify callback null, token:AUTH_TOKEN

  describe 'backend.createAccount()', ->

    validCreate =
      username: 'jeko'
      password: '12345678'
      email:    'jeko@email.com'

    createData =
      givenName: "Email"
      surname:  validCreate.username
      username: validCreate.username
      email:    validCreate.email
      password: validCreate.password

    it 'attempts to create an account with stormpath', ->
      { backend, callback, application } = backendTest()
      backend.createAccount validCreate, callback
      td.verify application.createAccount(
        createData, td.callback)

    it 'fails when stormpath fails', ->
      { backend, callback, application } = backendTest()
      td.when(application.createAccount td.matchers.anything())
        .thenCallback new Error()
      backend.createAccount validCreate, callback
      td.verify callback td.matchers.isA(Error)

  describe 'backend.sendPasswordResetEmail()', ->

    it 'calls stormpath\'s sendPasswordResetEmail with email', ->
      { backend, application, callback } = backendTest()
      email = 'user@email.com'
      backend.sendPasswordResetEmail email, callback
      td.verify application.sendPasswordResetEmail({
        email }, td.callback)

    it 'calls the callback', ->
      { backend, application, callback } = backendTest()
      email = 'user@email.com'
      td.when(application.sendPasswordResetEmail { email })
        .thenCallback null
      backend.sendPasswordResetEmail email, callback
      td.verify callback null

# vim: ts=2:sw=2:et:
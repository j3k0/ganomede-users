stormpathFacebook = require '../src/backend/stormpath-facebook'
stats = require('../src/statsd-wrapper').dummyClient()
{expect} = require 'chai'
td = require 'testdouble'

AUTH_TOKEN = 'auth-token'
VALID_TOKEN = 'valid-token'
INVALID_TOKEN = 'invalid-token'

baseTest = ->
  log = td.object [ 'info', 'warn', 'error' ]
  application = td.object [ 'getAccount', 'createAccount' ]
  aliasesClient = td.object [ 'set', 'get' ]
  td.when(aliasesClient.set td.matchers.isA(String), td.matchers.isA(String))
    .thenCallback null
  callback = td.function 'callback'
  checkBan = td.function 'checkBan'
  td.when(checkBan td.matchers.isA(String))
    .thenCallback null, false
  authenticator = td.object [ 'add' ]
  facebookFriends = td.object [ 'storeFriends' ]
  td.when(authenticator.add(td.matchers.isA(Object)))
    .thenReturn token:AUTH_TOKEN
  friendsClient = td.object []
  facebookClient = stormpathFacebook.createClient {
    application, stats, aliasesClient, checkBan,
    authenticator, facebookFriends, friendsClient, log
  }
  { facebookClient, application, aliasesClient,
    checkBan, authenticator, callback, facebookFriends }

firstLogin = ->
  ret = baseTest()
  td.when(ret.application.getAccount td.matchers.isA Object)
    .thenCallback null,
      created: true
      account: validAccount
  td.when(ret.application.createAccount td.matchers.isA Object)
    .thenCallback null,
      validAccount
  ret

normalLogin = ->
  ret = baseTest()
  td.when(ret.application.getAccount td.matchers.isA Object)
    .thenCallback null,
      created: false
      account: validAccount
  td.when(ret.aliasesClient.get td.matchers.isA(String))
    .thenCallback null, validAccount.username
  ret

validBody =
  username: "jeko"
  password: "123456"
  accessToken: VALID_TOKEN
  facebookId: 7

validAccount =
  status: "ENABLED"
  username: "facebook-jeko"
  email: "facebook-email"

validCoAccount =
  username: "jeko"
  email: "valid-email"

describe 'backend/stormpath-facebook', ->

  describe '.createClient()', ->

    it 'create an stormpathFacebookClient', ->
      { facebookClient } = baseTest()
      expect(facebookClient).to.be.an 'object'

  describe 'facebookClient.login()', ->

    it 'loads the facebook account', ->
      { facebookClient, application, callback } = baseTest()
      body = accessToken: INVALID_TOKEN
      facebookClient.login body, callback
      td.verify application.getAccount
        providerData:
          providerId: "facebook"
          accessToken: INVALID_TOKEN
        , td.callback

    it 'fails if cannot load account from application', ->
      { facebookClient, application, callback } = baseTest()
      td.when(application.getAccount td.matchers.isA Object)
        .thenCallback new Error()
      facebookClient.login {}, callback
      td.verify callback(td.matchers.isA Error)

    it 'fails if account is disabled', ->
      { facebookClient, application, callback } = baseTest()
      td.when(application.getAccount td.matchers.isA Object)
        .thenCallback null, account: status: "DISABLED"
      facebookClient.login {}, callback
      td.verify callback(null, token: null)

    it 'creates a co-account on first login', ->
      { facebookClient, application, callback } = firstLogin()
      facebookClient.login validBody, callback
      td.verify application.createAccount
        username:   validBody.username
        password:   validBody.password
        givenName: "Facebook"
        middleName: validBody.facebookId
        surname:    validAccount.username
        email:      validAccount.email
      , td.callback

    it 'links existing co-account on first login', ->
      { facebookClient, aliasesClient, application, callback } = firstLogin()
      td.when(application.createAccount td.matchers.isA Object)
        .thenCallback code:2001
      facebookClient.login validBody, callback
      td.verify aliasesClient.set(
        validAccount.username, validBody.username, td.callback)
      td.verify aliasesClient.set(
        "fb:#{validBody.facebookId}", validBody.username, td.callback)

    it 'links newly created co-account on first login', ->
      { facebookClient, aliasesClient, application, callback } = firstLogin()
      td.when(application.createAccount td.matchers.isA Object)
        .thenCallback null, validCoAccount
      facebookClient.login validBody, callback
      td.verify aliasesClient.set(
        validAccount.username, validCoAccount.username, td.callback)
      td.verify aliasesClient.set(
        "fb:#{validBody.facebookId}", validBody.username, td.callback)

    it 'returns an auth token on first login', ->
      { facebookClient, callback } = firstLogin()
      facebookClient.login validBody, callback
      td.verify callback(null, token: AUTH_TOKEN)

    it 'stores facebook friends on first login', ->
      { facebookClient, facebookFriends, callback } = firstLogin()
      facebookClient.login validBody, callback
      td.verify facebookFriends.storeFriends td.matchers.contains
        username: validBody.username
        accessToken: validBody.accessToken

    it 'returns an auth token on normal login', ->
      { facebookClient, aliasesClient, callback } = normalLogin()
      facebookClient.login validBody, callback
      td.verify aliasesClient.get validAccount.username, td.callback
      td.verify callback(null, token: AUTH_TOKEN)

    it 'updates friends on normal login', ->
      { facebookClient, facebookFriends, callback } = normalLogin()
      facebookClient.login validBody, callback
      td.verify facebookFriends.storeFriends td.matchers.contains
        username: validBody.username
        accessToken: validBody.accessToken

# vim: ts=2:sw=2:et:

_ = require 'lodash'
restify = require "restify"
td = require 'testdouble'
{anything,contains,isA} = td.matchers
{expect} = require 'chai'
tagizer = require 'ganomede-tagizer'

# Disable delayed calls. We're doing synchronous tests.
global.setImmediate = (func) -> func()

directory = require '../src/backend/directory'

REQ_ID = "my-request-id"

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
    'editAccount'
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

  # .editAccount() succeeds
  td.when(directoryClient.editAccount(
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

  # .byAlias() loads existing user by email
  td.when(directoryClient.byAlias(
    contains {type: 'email', value: EXISTING_USER.email}
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
    location = "location{location{country_code,longitude,latitude}}"
    uri = "/me?fields=id,name,email,#{location},birthday&#{token}"
    td.when(fbgraph.get(uri))
      .thenCallback null,
        id: user.facebook_id
        email: user.email
        name: user.fullName
        birthday: user.birthday
        location: user.location
  [ EXISTING_USER, SECONDARY_USER, NEW_USER ].forEach addUser
  fbgraph

aliasesClientTD = ->
  aliasesClient = td.object [ 'get' ]

  td.when(aliasesClient.get td.matchers.isA String)
    .thenCallback null, ''

  td.when(aliasesClient.get "fb:#{SECONDARY_USER.facebook_id}")
    .thenCallback null, SECONDARY_USER.username

  aliasesClient

usermetaClientTD = ->
  ret = td.object [ 'set' ]
  td.when(ret.set(contains(apiSecret:process.env.API_SECRET),
    anything(), anything()))
    .thenCallback null, {ok:true}
  addUser = (user) ->
    td.when(ret.set(contains(token:user.token), anything(), anything()))
      .thenCallback null, {ok:true}
  [ EXISTING_USER, SECONDARY_USER, NEW_USER ].forEach addUser
  ret

friendsClientTD = -> td.object []

facebookFriendsTD = ->
  ret = td.object [ 'storeFriends' ]
  td.when(ret.storeFriends(anything()))
    .thenDo(({callback}) -> callback?(null, {ok:true}))
  ret

facebookClientTD = -> td.object []

passwordResetTemplateTD = ->
  passwordResetTemplate = td.object ['render']
  td.when(passwordResetTemplate.render(anything()))
    .thenReturn
      subject: "prt-subject"
      text: "prt-text"
      html: "prt-html"
  passwordResetTemplate

mailerTransportTD = ->
  mt = td.object ['sendMail']
  td.when(mt.sendMail(anything()))
    .thenCallback null, {messageId:'1234',response:'ok'}
  mt

deferredEventsTD = -> td.object ['editEvent']

GENERATED_PASSWORD = 'blah1234'
generatePasswordTD = ->
  gp = td.function 'generatePassword'
  td.when(gp()).thenReturn GENERATED_PASSWORD
  gp

baseTest = ->
  log = td.object [ 'debug', 'info', 'warn', 'error' ]
  fbgraph = fbgraphTD()
  directoryClient = directoryClientTD()
  authenticator = authenticatorTD()
  aliasesClient = aliasesClientTD()
  usermetaClient = usermetaClientTD()
  friendsClient = friendsClientTD()
  facebookFriends = facebookFriendsTD()
  facebookClient = facebookClientTD()
  mailerTransport = mailerTransportTD()
  deferredEvents = deferredEventsTD()
  passwordResetTemplate = passwordResetTemplateTD()
  generatePassword = generatePasswordTD()
  backend = directory.createBackend {
    log, authenticator, directoryClient, fbgraph, deferredEvents,
    facebookAppId: APP_ID, aliasesClient,
    usermetaClient, friendsClient, facebookFriends, facebookClient,
    passwordResetTemplate, mailerTransport, generatePassword }
  callback = td.function 'callback'
  { callback, directoryClient, backend, aliasesClient, deferredEvents,
    usermetaClient, friendsClient, facebookFriends,
    facebookClient }

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
      td.verify callback null, contains(authResult(EXISTING_USER))

    it 'fails when credentials are invalid', ->
      { callback } = loginAccount credentials(NEW_USER)
      td.verify callback td.matchers.isA(restify.InvalidCredentialsError)

  describe 'backend.createAccount()', ->

    createAccount = (acc) ->
      ret = backendTest()
      td.when(ret.directoryClient.authenticate(
        contains(directoryAccount(acc))))
          .thenCallback(null, authResult(acc))
      ret.backend.createAccount account(acc), ret.callback
      ret

    hasAlias = (matchedAlias) -> (account) ->
      account.aliases.filter((testedAlias) ->
        testedAlias.type == matchedAlias.type and
          testedAlias.value == matchedAlias.value and
          testedAlias.public == matchedAlias.public
      ).length > 0

    it 'adds an account with the provided id and password', ->
      { directoryClient } = createAccount NEW_USER
      td.verify directoryClient.addAccount(
        td.matchers.contains(directoryAccount(NEW_USER)),
        td.callback)

    it 'adds the email as a private alias', ->
      { directoryClient } = createAccount NEW_USER
      emailAlias =
        type: 'email'
        public: false
        value: NEW_USER.email
      td.verify directoryClient.addAccount(
        td.matchers.argThat(hasAlias(emailAlias)),
        td.callback)

    it 'adds the name as a public alias', ->
      { directoryClient } = createAccount NEW_USER
      nameAlias =
        type: 'name'
        public: true
        value: NEW_USER.username
      td.verify directoryClient.addAccount(
        td.matchers.argThat(hasAlias(nameAlias)),
        td.callback)

    it 'adds the tag as a public alias', ->
      { directoryClient } = createAccount NEW_USER
      tagAlias =
        type: 'tag'
        public: true
        value: tagizer.tag(NEW_USER.username)
      td.verify directoryClient.addAccount(
        td.matchers.argThat(hasAlias(tagAlias)),
        td.callback)

    it 'calls back on success', ->
      { callback } = createAccount NEW_USER
      td.verify callback null, contains(authResult(NEW_USER))

    it 'fails when the given ID is not available', ->
      { backend, directoryClient, callback } = backendTest()
      backend.createAccount account(EXISTING_USER), callback
      td.verify callback(td.matchers.isA restify.ConflictError)

  describe 'backend.sendPasswordResetEmail()', ->

    sendPasswordResetEmail = (email) ->
      ret = backendTest()
      ret.backend.sendPasswordResetEmail {email}, ret.callback
      ret

    it 'calls the callback with success when email exists', ->
      { callback } = sendPasswordResetEmail EXISTING_USER.email
      td.verify callback(null), ignoreExtraArgs: true

    it 'fails when the email is not known', ->
      { callback } = sendPasswordResetEmail NEW_USER.email
      td.verify callback(isA restify.NotFoundError)

    it 'changes the user password', ->
      { callback, directoryClient } = sendPasswordResetEmail EXISTING_USER.email
      td.verify directoryClient.editAccount(
        contains {id: EXISTING_USER.id, password: GENERATED_PASSWORD}),
        {ignoreExtraArgs: true}

  describe 'backend.loginFacebook()', ->

    loginFacebook = (account, callback) ->
      ret = backendTest()
      account.req_id = REQ_ID
      ret.backend.loginFacebook account, callback || ret.callback
      ret

    loginWithout = (fieldname) ->
      data =
        accessToken: 'dummy'
        username: 'dummy'
        password: 'dummy'
      delete data[fieldname]
      { callback } = loginFacebook data
      td.verify callback(td.matchers.isA restify.BadRequestError)

    it 'requires an accessToken', -> loginWithout 'accessToken'
    it 'requires an username', -> loginWithout 'username'
    it 'requires an password', -> loginWithout 'password'

    it 'checks facebook id with directory client', ->
      { directoryClient } =
        loginFacebook facebookLogin(NEW_USER)
      td.verify directoryClient.byAlias(
        td.matchers.contains(
          type: "facebook.id.#{APP_ID}"
          value: NEW_USER.facebook_id),
        td.callback)

    it 'checks "fb:facebook_id" alias if not in directory', ->
      { aliasesClient, callback } = loginFacebook facebookLogin(NEW_USER)
      td.verify aliasesClient.get(
        "fb:#{NEW_USER.facebook_id}",
        td.callback)

    it 'adds metadata to CREATE events', ->
      { deferredEvents } =
        loginFacebook facebookLogin(NEW_USER)
      td.verify deferredEvents.editEvent(
        REQ_ID, 'CREATE', "metadata", {
          country: NEW_USER.location.location.country_code
          latitude: String(NEW_USER.location.location.latitude)
          longitude: String(NEW_USER.location.location.longitude)
          yearofbirth: NEW_USER.birthday.split('/')[2]
        })

    itSavesBirthday = (user) ->
      { usermetaClient } = loginFacebook facebookLogin(user)
      td.verify usermetaClient.set(
        contains(
          username: user.username
          apiSecret: process.env.API_SECRET),
        "yearofbirth",
        user.birthday.split('/')[2],
        td.callback)

    it 'saves the birthday of new users', ->
      itSavesBirthday NEW_USER

    #itSavesCountry = (user) ->
    #  { usermetaClient } = loginFacebook facebookLogin(user)
    #  td.verify usermetaClient.set(
    #    user.username, user.birthday, td.callback)
    #it 'saves the birthday of new users', ->
    #  itSavesBirthday NEW_USER

    itSavesFullName = (user) ->
      { usermetaClient } = loginFacebook facebookLogin(user)
      td.verify usermetaClient.set(
        contains(
          username: user.username
          apiSecret: process.env.API_SECRET),
        "fullname", user.fullName, td.callback)

    it 'saves the full name of new users', ->
      itSavesFullName NEW_USER

    it 'saves the full name of existing users', ->
      itSavesFullName EXISTING_USER

    itSavesFriends = (user) ->
      { facebookFriends, aliasesClient, friendsClient,
        facebookClient } =
        loginFacebook facebookLogin(user)
      td.verify facebookFriends.storeFriends(td.matchers.contains {
        aliasesClient
        friendsClient
        facebookClient
        username: user.username
        accessToken: user.facebook_access_token
      })

    it 'saves the users friends for new users', ->
      itSavesFriends NEW_USER
    it 'saves the users friends for existing users', ->
      itSavesFriends EXISTING_USER

    it 'logins directory-existing users', ->
      { callback } = loginFacebook facebookLogin(EXISTING_USER)
      td.verify callback null, td.matchers.contains
        token: EXISTING_USER.token

    it 'logins legacy-existing users', ->
      { callback } = loginFacebook facebookLogin(SECONDARY_USER)
      td.verify callback null, td.matchers.contains
        token: SECONDARY_USER.token

    it 'registers non existing user', ->
      { directoryClient, callback } =
        loginFacebook facebookLogin(NEW_USER)
      td.verify callback null, td.matchers.contains
        token:NEW_USER.token
      td.verify directoryClient.addAccount(
        td.matchers.contains(id:NEW_USER.id),
        td.callback)

# vim: ts=2:sw=2:et:

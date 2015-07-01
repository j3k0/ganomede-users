# Users API
#
# Implements the users API using Stormpath
#

stormpath = require "stormpath"
authdb = require "authdb"
restify = require "restify"
log = require "./log"
helpers = require "ganomede-helpers"
usermeta = require "./usermeta"
aliases = require "./aliases"
friendsStore = require "./friends-store"
facebook = require "./facebook"
usernameValidator = require "./username-validator"
stateMachine = require "state-machine"
AccountCreator = require "./account-creator"

sendError = (err, next) ->
  log.error err
  next err

sendStormpathError = (spErr, next) ->
  if !spErr.code
    spErr.code = "Unknown"
  if spErr.code == 7100
    spErr.status = 401
  err = new restify.RestError
    restCode: "Stormpath" + spErr.name + spErr.code,
    statusCode: spErr.status,
    message: spErr.userMessage,
  log.error spErr
  next err

# Retrieve Stormpath configuration from environment
stormpathApiId = process.env.STORMPATH_API_ID
stormpathApiSecret = process.env.STORMPATH_API_SECRET
stormpathAppName = process.env.STORMPATH_APP_NAME || "Ganomede"
apiSecret = process.env.API_SECRET || null

# Facebook
facebookAppSecret = process.env.FACEBOOK_APP_SECRET
facebookClient = facebook.createClient
  facebookAppSecret: facebookAppSecret

# Connection to AuthDB
redisAuthConfig = helpers.links.ServiceEnv.config('REDIS_AUTH', 6379)
authdbClient = authdb.createClient
  host: redisAuthConfig.host
  port: redisAuthConfig.port

# Extra user data
redisUsermetaConfig = helpers.links.ServiceEnv.config('REDIS_USERMETA', 6379)
usermetaClient = null
if redisUsermetaConfig.exists
  redisUsermetaConfig.options =
    no_ready_check: true
  usermetaClient = usermeta.create redisUsermetaConfig
  log.info "usermeta", redisUsermetaConfig
else
  log.error "cant create usermeta client, no REDIS_USERMETA database"

# Aliases
aliasesClient = aliases.createClient
  usermetaClient: usermetaClient

# Friends
friendsClient = friendsStore.createClient
  usermetaClient: usermetaClient

friendsApi = null

# Facebook friends
facebookFriends = require "./facebook-friends"
storeFacebookFriends = (options) ->
  facebookFriends.storeFriends
    username: options.username
    accessToken: options.accessToken
    callback: options.callback || ->
    aliasesClient: options.aliasesClient || aliasesClient
    friendsClient: options.friendsClient || friendsClient
    facebookClient: options.facebookClient || facebookClient


# Application, once initialized
application = null

# Caching
redisCacheConfig = helpers.links.ServiceEnv.config('REDIS_CACHE', 6379)
if redisCacheConfig.exists
  cacheOptions =
    store: "redis"
    connection:
      host: redisCacheConfig.host
      port: redisCacheConfig.port
    ttl: 3600
    tti: 3600
    # options:
  log.info "cacheOptions", cacheOptions

# Delegates
accountCreator = null

log.info "storpath AppName", stormpathAppName

# Create the API key
apiKey = new stormpath.ApiKey stormpathApiId, stormpathApiSecret

# Create the stormpath Client
if stormpathApiId and stormpathApiSecret
  client = new stormpath.Client
    apiKey: apiKey
    cacheOptions: cacheOptions

# Retrieve the stormpath Application
getApplicationHref = (cb) ->
  log.info "stormpath.getApplications"
  client.getApplications (err, apps) ->
    if err
      return cb? err
    app = (app for app in apps.items when app.name == stormpathAppName)
    if !app or app.length != 1
      return cb 404
    cb null, app[0].href

loadApplication = (cb) ->
  # Find if application already exists
  getApplicationHref (err, appHref) ->

    # If not, create it
    if err == 404
      createApplication (err, app) ->

        # If it didn't work, try again
        if err
          log.warn err
          return initialize cb

        # If creation worked, store the application
        application = app
        initializationDone cb
    else if err
      cb err
    else
      client.getApplication appHref, (err, app) ->
        if err
          return cb err
        application = app
        initializationDone cb

initializationDone = (cb) ->

  if !accountCreator
    accountCreator = new AccountCreator
      application: application
      log: log
      loginAccount: loginAccount

  cb null

# Create the stormpath Application
createApplication = (cb) ->
  log.info "stormpath.createApplication"
  app =
    name: stormpathAppName
    description: "Ganomede users"
  client.createApplication app, createDirectory:true, cb

  # TODO: Create Facebook Directory
  # TODO: Provide FACEBOOK_APP_ID and FACEBOOK_APP_SECRET

# Create a user account
createAccount = (req, res, next) ->

  usernameError = usernameValidator(req.body.username)
  if usernameError
    return sendError usernameError, next

  account =
    givenName: "Email"
    surname: req.body.surname || req.body.username
    username: req.body.username
    email: req.body.email
    password: req.body.password
  log.info "register", account

  accountCreator.create account, (err, data) ->
    if err
      return sendStormpathError err, next
    else
      res.send data
      next()

# Generate a random token
rand = ->
  Math.random().toString(36).substr(2)
genToken = -> rand() + rand()

# Login a user account
login = (req, res, next) ->
  if req.body.facebookToken
    loginFacebook req, res, next
  else
    loginDefault req, res, next

# Login (or register) a facebook user account
loginFacebook = (req, res, next) ->

  fbProcess = stateMachine()

  # Get / create user account
  getAccount = ->
    account =
      providerData:
        providerId: "facebook"
        accessToken: req.body.facebookToken
    application.getAccount account, (err, result) ->
      if err
        fbProcess.stormpathError = err
        fbProcess.fail()
      else
        fbProcess.accountResult = result
        fbProcess.next()

  # Analyse the account
  handleAccount = ->
    result = fbProcess.accountResult
    log.info "logged in:", result
    if result.account.status == "ENABLED"
      if result.created
        if req.body.username && req.body.password
          fbProcess.create()
        else
          fbProcess.metaErr =
            new restify.BadRequestError("username or password not provided")
          fbProcess.delete()
      else
        fbProcess.login()
    else
      fbProcess.fail()

  # Delete the account
  deleteFacebookAccount = ->
    result = fbProcess.accountResult
    client.getAccount result.account.href, (err, account) ->
      if err
        # Only fail, account is deleted because of an error already
        fbProcess.fail()
      else
        account.delete (err) ->
          if err
            fbProcess.fail()
          else
            fbProcess.next()

  # Delete the account
  deleteCoAccount = ->
    client.getAccount fbProcess.coAccount.href, (err, account) ->
      if err
        # Only fail, don't store error.
        # account is deleted because of an error already
        log.error err
        fbProcess.fail()
      else
        account.delete (err) ->
          if err
            log.error err
            fbProcess.fail()
          else
            fbProcess.next()

  # Retrieve account alias
  getAlias = ->
    result = fbProcess.accountResult
    aliasesClient.get result.account.username,
    (err, value) ->
      if err
        fbProcess.error = err
        fbProcess.fail()
      else if !value
        fbProcess.empty()
      else
        req.body.username = value
        if !fbProcess.coAccount
          fbProcess.coAccount =
            username: value
        fbProcess.next()

  # Save the account alias
  saveAlias = ->
    # Store alias stormpath username -> co-account username
    # in usermeta (someone@fovea.cc -> jeko)
    result = fbProcess.accountResult
    aliasesClient.set result.account.username, req.body.username,
    (err, reply) ->
      if err
        fbProcess.error = err
        fbProcess.fail()
      else
        fbProcess.next()

  # Save the link facebookId => username
  saveFacebookId = ->
    aliasesClient.set "fb:#{req.body.facebookId}", req.body.username,
    (err, reply) ->
      if err
        fbProcess.error = err
        fbProcess.fail()
      else
        fbProcess.next()
        
  # Create a co-account associated with the facebook account
  createCoAccount = ->
    result = fbProcess.accountResult

    # Check that required body parameters are available
    [ "facebookId", "username", "password" ].forEach (fieldName) ->
      if not req.body[fieldName]
        fbProcess.error = new restify.BadRequestError(
          "missing field: #{fieldName}")
    if fbProcess.error
      fbProcess.fail()
      return

    account =
      username:   req.body.username
      password:   req.body.password
      givenName: "Facebook"
      middleName: req.body.facebookId
      surname:    result.account.username
      email:      result.account.email

    log.info "register",
      coAccount: account
      account: result.account

    application.createAccount account, (err, account) ->
      if err
        if err.code == 2001
          # account already exists. link it with the facebook account
          fbProcess.link()
        else
          fbProcess.stormpathError = err
          fbProcess.fail()
      else
        fbProcess.coAccount = account
        fbProcess.next()

  # Load
  loadCoAccount = ->
    account =
      username:   req.body.username
      password:   req.body.password
    client.getAccount account.href, (err, account) ->
      if err
        fbProcess.stormpathError = err
        fbProcess.fail()
      else
        fbProcess.coAccount = account
        fbProcess.next()


  # Create and send the auth token
  sendToken = ->
    result = fbProcess.accountResult
    coAuth = addAuth
      facebookToken: req.body.facebookToken
      username: fbProcess.coAccount.username
      email: fbProcess.coAccount.email || result.account.email
    res.send addAuth
      facebookToken: req.body.facebookToken
      username: req.body.username
      email: result.account.email
      token: coAuth.token
    fbProcess.next()

  # Store the list of facebook friends
  storeFriends = ->

    # Let's retrieve friends asynchronously, no need to delay login
    fbProcess.next()

    # Get friends from facebook
    storeFacebookFriends
      username: req.body.username
      accessToken: req.body.facebookToken
      callback: (err, usernames) ->
        if err
          log.error "Failed to store friends", err
        else
          log.info "Friends stored", usernames

  reportFailure = ->
    if fbProcess.stormpathError
      sendStormpathError fbProcess.stormpathError, next
    else if fbProcess.error
      sendError fbProcess.error, next
    else
      res.send token: null
      next()

  fbProcess.build()
    .state 'start', initial: true
    .state 'getAccount', enter: getAccount
    .state 'handleAccount', enter: handleAccount
    .state 'getAlias', enter: getAlias
    .state 'createCoAccount', enter: createCoAccount
    .state 'loadCoAccount', enter: loadCoAccount
    .state 'deleteFacebookAccount', enter: deleteFacebookAccount
    .state 'saveAlias', enter: saveAlias
    .state 'saveFacebookId', enter: saveFacebookId
    .state 'deleteCoAccount', enter: deleteCoAccount
    .state 'reportFailure', enter: reportFailure
    .state 'sendToken', enter: sendToken
    .state 'storeFriends', enter: storeFriends
    .state 'done', enter: (-> next()) # next with no arguments

    .event 'start', 'start', 'getAccount'

    # After getAccount we handle the account
    .event 'next', 'getAccount', 'handleAccount'
    .event 'fail',   'getAccount', 'reportFailure'

    # After handleAccount, either create an account or login
    .event 'create', 'handleAccount', 'createCoAccount'
    .event 'login', 'handleAccount', 'getAlias'
    .event 'delete', 'handleAccount', 'deleteFacebookAccount'
    .event 'fail', 'handleAccount', 'reportFailure'

    # After retrieving an alias, send auth token
    .event 'next', 'getAlias', 'sendToken'
    .event 'fail', 'getAlias', 'reportFailure'
    .event 'empty', 'getAlias', 'createCoAccount'

    # After creating an account, save the alias
    # In case of failure, delete the account
    # If it already exists, link it with facebook
    .event 'next', 'createCoAccount', 'saveAlias'
    .event 'fail', 'createCoAccount', 'deleteFacebookAccount'
    .event 'link', 'createCoAccount', 'loadCoAccount'

    # If loading the coaccount succeeded, save the alias
    # In case of failed, delete the facebook account
    .event 'next', 'loadCoAccount', 'saveAlias'
    .event 'fail', 'loadCoAccount', 'deleteFacebookAccount'

    # After deleting the facebook account, report the failure in any case
    .event 'next', 'deleteFacebookAccount', 'reportFailure'
    .event 'fail', 'deleteFacebookAccount', 'reportFailure'

    # After saving the alias, save the facebookId
    .event 'next', 'saveAlias', 'saveFacebookId'
    .event 'fail', 'saveAlias', 'deleteCoAccount'

    # After saving the facebookId, send auth token
    .event 'next', 'saveFacebookId', 'sendToken'
    .event 'fail', 'saveFacebookId', 'deleteCoAccount'

    # After deleting the facebook account, report the failure in any case
    .event 'next', 'deleteCoAccount', 'deleteFacebookAccount'
    .event 'fail', 'deleteCoAccount', 'deleteFacebookAccount'

    # After sending the token, store friends
    .event 'next', 'sendToken', 'storeFriends'

    # After storing friends, we're done
    .event 'next', 'storeFriends', 'done'

  fbProcess.onChange = (currentStateName, previousStateName) ->
    log.info "#{previousStateName} -> #{currentStateName}"
  fbProcess.start()

loginDefault = (req, res, next) ->
  account =
    username: req.body.username
    password: req.body.password
  loginAccount account, (err, data) ->
    if err
      return sendStormpathError err, next
    res.send data
    next()

loginAccount = (account, callback) ->
  application.authenticateAccount account, (err, result) ->
    if err
      return callback err

    # if successful, the result will have an account field
    # with the successfully authenticated account:
    result.getAccount (err, account) ->
      if err
        return callback err
      callback null, addAuth(account)

# Add authentication token in authDB, save 'auth' metadata.
addAuth = (account) ->

  # Generate and save the token
  token = account.token || genToken()
  authdbClient.addAccount token,
    username: account.username
    email: account.email

  # Store the auth date (in parallel, ignoring the outcome)
  timestamp = "" + (new Date().getTime())
  usermetaClient.set account.username, "auth", timestamp, (err, reply) ->

  # Return REST-ready authentication data
  {
    username: account.username
    email: account.email
    token: token
  }

# Load account details. This call most generally made by a client connecting
# to the server, using a restored session. It's a good place to check
# and refresh a few things, namely facebook friends for now.
getAccount = (req, res, next) ->

  # We're loading the account from a token (required)
  token = req.params.authToken
  if !token
    err = new restify.InvalidContentError "invalid content"
    return sendError err, next

  # Use the authentication database to retrieve more about the user.
  # see `addAuth` for details of what's in the account, for now:
  #  - username
  #  - email
  #  - facebookToken (optionally)
  authdbClient.getAccount token, (err, account) ->
    if err
      log.error err
      err = new restify.NotAuthorizedError "not authorized"
      return sendError err, next
    res.send account
    next()

    # Reload facebook friends in the background
    # (next has been called)
    if account.facebookToken
      storeFacebookFriends
        username: account.username
        accessToken: account.facebookToken
        callback: (err) ->
          if err
            log.error "Failed to store friends for #{account.username}", err

# Send a password reset email
passwordResetEmail = (req, res, next) ->

  sendEmail = (email) ->
    log.info "reset password", email:email
    application.sendPasswordResetEmail email, (err, resetToken) ->
      if err
        if err.code == 2016
          log.error err
          err = new restify.RestError
            restCode: "EmailNotFoundError",
            statusCode: err.status,
            message: err.userMessage,
          return sendError err, next
        else if err.code == 2002
          log.error err
          err = new restify.RestError
            restCode: "EmailBadFormatError",
            statusCode: err.status,
            message: err.userMessage,
          return sendError err, next
        else
          return sendStormpathError err, next
      res.send ok:true
      next()

  # It's possible to just specify the email address
  if req.body?.email
    sendEmail req.body.email
    return

  # It's also possible to retrieve the account from the authToken
  token = req.params.authToken
  if !token
    err = new restify.InvalidContentError "invalid content"
    return sendError err, next

  authdbClient.getAccount token, (err, account) ->
    if err
      log.error err
      err = new restify.NotAuthorizedError "not authorized"
      return sendError err, next
    sendEmail account.email

authMiddleware = (req, res, next) ->
  authToken = req.params.authToken
  if !authToken
    return sendError(new restify.InvalidContentError('invalid content'), next)

  if apiSecret
    separatorIndex = authToken.indexOf ":"
    if separatorIndex > 0
      reqApiSecret = authToken.substr(0, separatorIndex)
      username = authToken.substr(separatorIndex + 1, authToken.length)
      if apiSecret == reqApiSecret
        req.params.user =
          username: username
      next()
      return

  authdbClient.getAccount authToken, (err, account) ->
    if err || !account
      return sendError(new restify.UnauthorizedError('not authorized'), next)

    req.params.user = account
    next()

# Set metadata
postMetadata = (req, res, next) ->
  username = req.params.user.username
  key = req.params.key
  value = req.body.value
  usermetaClient.set username, key, value, (err, reply) ->
    if (err)
      log.error
        err:err
        reply:reply
    res.send ok:!err
    next()

# Get metadata
getMetadata = (req, res, next) ->
  username = req.params.username
  key = req.params.key
  usermetaClient.get username, key, (err, reply) ->
    res.send
      key: key
      value: reply
    next()

# Initialize the module
initialize = (cb, options = {}) ->

  if !client
    return cb new Error "no stormpath client"

  if options.accountCreator
    accountCreator = options.accountCreator

  friendsApi = options.friendsApi || require("./friends-api").createApi
    friendsClient: friendsClient
    authMiddleware: authMiddleware

  if options.application
    application = options.application
    initializationDone cb
  else
    loadApplication cb

# Register routes in the server
addRoutes = (prefix, server) ->
  server.post "/#{prefix}/accounts", createAccount
  server.post "/#{prefix}/login", login
  server.get "/#{prefix}/auth/:authToken/me", getAccount

  endPoint = "/#{prefix}/auth/:authToken/passwordResetEmail"
  server.post endPoint, passwordResetEmail

  endPoint = "/#{prefix}/passwordResetEmail"
  server.post endPoint, passwordResetEmail

  server.post "/#{prefix}/auth/:authToken/metadata/:key",
    authMiddleware, postMetadata
  server.get "/#{prefix}/:username/metadata/:key", getMetadata

  friendsApi.addRoutes prefix, server

module.exports =
  initialize: initialize
  addRoutes: addRoutes

# vim: ts=2:sw=2:et:

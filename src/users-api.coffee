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
stateMachine = require "state-machine"

sendError = (err, next) ->
  log.error err
  next err

sendStormpathError = (spErr, next) ->
  if !spErr.code
    spErr.code = "Unknown"
  err = new restify.RestError
    restCode: "Stormpath" + spErr.name + spErr.code,
    statusCode: spErr.status,
    message: spErr.userMessage,
  log.error spErr
  next err

# Retrieve Stormpath configuration from environment
apiId = process.env.STORMPATH_API_ID
apiSecret = process.env.STORMPATH_API_SECRET
appName = process.env.STORMPATH_APP_NAME || "Ganomede"

# Connection to AuthDB
redisAuthConfig = helpers.links.ServiceEnv.config('REDIS_AUTH', 6379)
authdbClient = authdb.createClient
  host: redisAuthConfig.host
  port: redisAuthConfig.port

# Extra user data
redisUsermetaConfig = helpers.links.ServiceEnv.config('REDIS_USERMETA', 6379)
usermetaClient = null
if redisUsermetaConfig.exists
  usermetaClient = usermeta.create redisUsermetaConfig
  log.info "usermeta", redisUsermetaConfig
else
  log.error "cant create usermeta client, no REDIS_USERMETA database"

aliasesClient = aliases.createClient
  usermetaClient: usermetaClient

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

log.info "appName", appName

# Create the API key
apiKey = new stormpath.ApiKey apiId, apiSecret

# Create the stormpath Client
if apiId and apiSecret
  client = new stormpath.Client
    apiKey: apiKey
    cacheOptions: cacheOptions

# Retrieve the stormpath Application
getApplicationHref = (cb) ->
  log.info "stormpath.getApplications"
  client.getApplications (err, apps) ->
    if err
      return cb? err
    app = (app for app in apps.items when app.name == appName)
    if !app or app.length != 1
      return cb 404
    cb null, app[0].href

# Initialize the module
initialize = (cb) ->

  if !client
    return

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
        cb null
    else if err
      cb err
    else
      client.getApplication appHref, (err, app) ->
        if err
          return cb err
        application = app
        cb null

# Create the stormpath Application
createApplication = (cb) ->
  log.info "stormpath.createApplication"
  app =
    name: appName
    description: "Ganomede users"
  client.createApplication app, createDirectory:true, cb

  # TODO: Create Facebook Directory
  # TODO: Provide FACEBOOK_APP_ID and FACEBOOK_APP_SECRET

# Create a user account
createAccount = (req, res, next) ->
  account =
    givenName: "Email"
    surname: req.body.surname || req.body.username
    username: req.body.username
    email: req.body.email
    password: req.body.password
  log.info "register", account

  onAccountCreated = (err, createdAccount) ->
    if err
      return sendStormpathError err, next
    log.info "registered", createdAccount
    if createdAccount.status == "ENABLED"
      login req, res, next
      # res.send createdAccount
      # next()
    else
      res.send token: null
      next()

  application.createAccount account, onAccountCreated

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
      else
        req.body.username = value
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
        fbProcess.stormpathError = err
        fbProcess.fail()
      else
        fbProcess.coAccount = account
        fbProcess.next()

  # Create and send the auth token
  sendToken = ->
    result = fbProcess.accountResult
    addAuth {
      username: req.body.username
      email: result.account.email
    }, res, next

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
    .state 'deleteFacebookAccount', enter: deleteFacebookAccount
    .state 'saveAlias', enter: saveAlias
    .state 'saveFacebookId', enter: saveFacebookId
    .state 'deleteCoAccount', enter: deleteCoAccount
    .state 'reportFailure', enter: reportFailure
    .state 'sendToken', enter: sendToken

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

    # After creating an account, save the alias
    # In case of failure, delete the account
    .event 'next', 'createCoAccount', 'saveAlias'
    .event 'fail', 'createCoAccount' , 'deleteFacebookAccount'

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

  fbProcess.onChange = (currentStateName, previousStateName) ->
    log.info "#{previousStateName} -> #{currentStateName}"
  fbProcess.start()

loginDefault = (req, res, next) ->
  account =
    username: req.body.username
    password: req.body.password
  application.authenticateAccount account, (err, result) ->
    if err
      return sendStormpathError err, next

    # if successful, the result will have an account field
    # with the successfully authenticated account:
    result.getAccount (err, account) ->
      if err
        return sendStormpathError err, next
      addAuth account, res, next

addAuth = (account, res, next) ->
  token = genToken()
  authdbClient.addAccount token,
    username: account.username
    email: account.email
  res.send
    username: account.username
    email: account.email
    token:token
  next()

getAccount = (req, res, next) ->
  token = req.params.authToken
  if !token
    err = new restify.InvalidContentError "invalid content"
    return sendError err, next
  authdbClient.getAccount token, (err, account) ->
    if err
      log.error err
      err = new restify.NotAuthorizedError "not authorized"
      return sendError err, next
    res.send account
    next()

# Send a password reset email
passwordResetEmail = (req, res, next) ->
  token = req.params.authToken
  if !token
    err = new restify.InvalidContentError "invalid content"
    return sendError err, next
  authdbClient.getAccount token, (err, account) ->
    if err
      log.error err
      err = new restify.NotAuthorizedError "not authorized"
      return sendError err, next
    application.sendPasswordResetEmail account.email, (err, resetToken) ->
      log.info "passwordResetToken", resetToken
      res.send ok:!err
      next()

authMiddleware = (req, res, next) ->
  authToken = req.params.authToken
  if !authToken
    return sendError(new restify.InvalidContentError('invalid content'), next)

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

# Register routes in the server
addRoutes = (prefix, server) ->
  server.post "/#{prefix}/accounts", createAccount
  server.post "/#{prefix}/login", login
  server.get "/#{prefix}/auth/:authToken/me", getAccount

  endPoint = "/#{prefix}/auth/:authToken/passwordResetEmail"
  server.post endPoint, passwordResetEmail

  server.post "/#{prefix}/auth/:authToken/metadata/:key",
    authMiddleware, postMetadata
  server.get "/#{prefix}/:username/metadata/:key", getMetadata

module.exports =
  initialize: initialize
  addRoutes: addRoutes

# vim: ts=2:sw=2:et:

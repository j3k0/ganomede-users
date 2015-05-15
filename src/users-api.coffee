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

# Create a user account
createAccount = (req, res, next) ->
  account =
    givenName: req.body.username
    surname: req.body.username
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
      token = genToken()
      # crypto = require "crypto"
      # token = crypto.createHash('md5').update(tokenStr).digest('hex')

      authdbClient.addAccount token,
        username: account.username
        email: account.email
        #givenName: account.givenName
        #surname: account.surname

      res.send
        username: account.username
        email: account.email
        #givenName: account.givenName
        #surname: account.surname
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

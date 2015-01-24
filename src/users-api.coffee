# Users API
#
# Implements the users API using Stormpath
#

stormpath = require "stormpath"
restify = require "restify"
log = require "./log"

sendError = (err, next) ->
  log.error err
  next err

sendStormpathError = (spErr, next) ->
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

# Application, once initialized
application = null

# Caching
if process.env.REDIS_CACHE_PORT_6379_TCP_ADDR
  cacheOptions =
    store: "redis"
    connection:
      host: process.env.REDIS_CACHE_PORT_6379_TCP_ADDR
      port: process.env.REDIS_CACHE_PORT_6379_TCP_PORT
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
# application.createAccount account, (err, account) ->

createAccount = (req, res, next) ->
  account =
    givenName: req.body.givenName
    surname: req.body.surname
    username: req.body.username
    email: req.body.email
    password: req.body.password
  log.info "register", account
  
  onAccountCreated = (err, createdAccount) ->
    if err
      return sendStormpathError err, next
    log.info "registered", createdAccount
    res.send createdAccount
    next()

  application.createAccount account, onAccountCreated

# Register routes in the server
addRoutes = (prefix, server) ->
  server.post "/#{prefix}/accounts", createAccount

module.exports =
  initialize: initialize
  addRoutes: addRoutes

# vim: ts=2:sw=2:et:

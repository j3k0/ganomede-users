# Users API
#
# Implements the users API using Stormpath
#

stormpath = require "stormpath"
log = require "./log"

# Retrieve Stormpath configuration from environment
apiId = process.env.STORMPATH_API_ID
apiSecret = process.env.STORMPATH_API_SECRET
appName = process.env.STORMPATH_APP_NAME

application = null

# Create the API key
apiKey = new stormpath.ApiKey apiId, apiSecret

# Create the stormpath Client
client = new stormpath.Client apiKey: apiKey

# Retrieve the stormpath Application
getApplication = (cb) ->
  log.info "stormpath.getApplication"
  client.getApplications (err, apps) ->
    if err
      return cb? err
    app = (app for app in apps.items when app.name == appName)
    if !app
      return cb 404
    cb null, app

# Initialize the module
initialize = (cb) ->

  # Find if application already exists
  getApplication (err, app) ->

    # If not, create it
    if err == 404
      createApplication (err, app) ->

        # If it didn't work, try again
        if err
          return initialize cb

        # If creation worked, store the application
        application = app
        cb null
    else if err
      cb err
    else
      application = app
      cb null

#client.getApplication app.href, (err, app) ->
#  if err
#    return log.error err
#  log.info app

# Create the stormpath Application
createApplication = (cb) ->
  log.info "stormpath.createApplication"
  app =
    name: appName
    description: "Ganomede users"
  client.createApplication app, createDirectory:true, cb

# Register routes in the server
addRoutes = (prefix, server) ->
  server.get "/#{prefix}/me", (req, res, next) ->
    res.send
      ok: true
    next()

module.exports =
  initialize: initialize
  addRoutes: addRoutes

# vim: ts=2:sw=2:et:

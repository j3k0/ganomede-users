# The stormpath users management backend
#
# Goal is to abstract the users-api from stormpath, allowing
# as a second step to create other users management backends.

stormpath = require 'stormpath'
restify = require 'restify'
helpers = require "ganomede-helpers"
serviceConfig = helpers.links.ServiceEnv.config
logMod = require '../log'
statsWrapper = require '../statsd-wrapper'

errorCode = (spErr) -> spErr.code || "Unknown"
statusCode = (spErr) ->
  if spErr.code == 7100 then 401 else spErr.status

convertedError = (spErr) ->
  if spErr
    err = new restify.RestError
      restCode: "Stormpath" + spErr.name + errorCode(spErr),
      statusCode: statusCode(spErr),
      message: spErr.userMessage,
    err.rawError = spErr
  return err

# read stormpath config from options, fallback to env vars.
readConfig = (options) ->
  apiId:
    options.apiId||
    process.env.STORMPATH_API_ID
  apiSecret:
    options.apiSecret ||
    process.env.STORMPATH_API_SECRET
  appName:
    options.appName ||
    process.env.STORMPATH_APP_NAME ||
    'Ganomede'

createStormpathClient = (config) ->
  apiKey = (config) ->
    new stormpath.ApiKey config.apiId, config.apiSecret

  # enable caching
  redisCacheConfig = serviceConfig('REDIS_CACHE', 6379)
  if redisCacheConfig.exists
    cacheOptions =
      store: "redis"
      connection:
        host: redisCacheConfig.host
        port: redisCacheConfig.port
      ttl: 3600
      tti: 3600
    logMod.info "cacheOptions", cacheOptions

  client = new stormpath.Client
    apiKey: apiKey(config)
    cacheOptions: cacheOptions

createBackend = ({
  log = logMod.child(module: 'backend/stormpath')
  spFacebook = require './stormpath-facebook'
  appName, apiId, apiSecret,
  aliasesClient,
  fullnamesClient,
  facebookClient,
  facebookFriends,
  friendsClient, # see src/friends-store.coffee
  authenticator,
  checkBan,
  stats,
  client # stormpath client
}) ->

  if !stats
    stats = statsWrapper.createClient { log }

  if !authenticator
    throw new Error "authenticator missing"

  config = readConfig { appName, apiId, apiSecret }
  log.info config, 'stormpath config'

  # Create the stormpath Client
  if !client and config.apiId and config.apiSecret
    client = createStormpathClient config

  # Create the stormpath Application
  createApplication = (cb) ->
    log.info 'stormpath.createApplication'
    app =
      name: config.appName
      description: 'Ganomede users'
    stats.increment 'stormpath.client.application.create'
    client.createApplication app, createDirectory:true, cb

  # Retrieve the stormpath Application
  getApplicationHref = (cb) ->
    log.info "stormpath.getApplications"
    stats.increment 'stormpath.client.applications.get'
    client.getApplications (err, apps) ->
      if err
        return cb? err
      app = (app for app in apps.items when app.name == config.appName)
      if !app or app.length != 1
        return cb 404
      cb null, app[0].href

  # return the link to the app, create it if it doesn't exist.
  loadApplication = (cb) ->

    # find if application already exists
    getApplicationHref (err, appHref) ->

      # if not, create it
      if err == 404
        createApplication (err, app) ->

          # if it didn't work, try again
          if err
            log.warn err
            process.nextTick ->
              loadApplication cb
            return

          # creation worked, return application object
          cb null, app

      # error occurred, fail
      else if err
        cb err

      # application exists, create and return application object
      else
        stats.increment 'stormpath.client.application.get'
        client.getApplication appHref, cb

  backend = (application) ->
    
    spFacebookClient = spFacebook.createClient {
      client, application, authenticator,
      aliasesClient, fullnamesClient, facebookClient,
      facebookFriends, friendsClient, checkBan, log, stats
    }

    that =
      loginFacebook: spFacebookClient.login

      loginAccount: (account, callback) ->
        stats.increment 'stormpath.application.account.authenticate'
        application.authenticateAccount account, (err, result) ->
          if err
            return callback err

          # if successful, the result will have an account field
          # with the successfully authenticated account:
          stats.increment 'stormpath.auth.account.get'
          result.getAccount (err, account) ->
            if err
              return callback err
            callback null, authenticator.add(account)

      createAccount: (body, cb) ->
        account =
          givenName: "Email"
          surname: body.username
          username: body.username
          email: body.email
          password: body.password
        application.createAccount account,
          (err, createdAccount) ->
            if err
              return cb convertedError(err)
            if createdAccount.status != "ENABLED"
              return cb null,
                token: null
            log.info createdAccount, "registered"
            that.loginAccount account, cb

      sendPasswordResetEmail: (email, cb) ->
        req = { email }
        application.sendPasswordResetEmail req, (err) ->
          if err
            if err.code == 2016
              cb new restify.RestError
                restCode: "EmailNotFoundError",
                statusCode: err.status,
                message: err.userMessage,
            else if err.code == 2002
              cb new restify.RestError
                restCode: "EmailBadFormatError",
                statusCode: err.status,
                message: err.userMessage,
            else
              cb convertedError err
          else
            cb null

  initialize = (cb) ->
    loadApplication (err, app) ->
      if err
        cb err
      else
        cb null, backend app

  return { initialize }

module.exports = { createBackend }

# vim: ts=2:sw=2:et:

# Users API
#
# Implements the users API
#

_ = require 'lodash'
authdb = require "authdb"
authentication = require "./authentication"
restify = require "restify"
log = require "./log"
helpers = require "ganomede-helpers"
serviceConfig = helpers.links.ServiceEnv.config
usermeta = require "./usermeta"
aliases = require "./aliases"
fullnames = require "./fullnames"
friendsStore = require "./friends-store"
facebook = require "./facebook"
usernameValidator = require "./username-validator"
{Bans} = require './bans'
urllib = require 'url'
mailer = require './mailer'

sendError = (req, err, next) ->
  if err.rawError
    req.log.error err.rawError
  else
    req.log.error err
  next err

stats = require('./statsd-wrapper').createClient()

# Retrieve Stormpath configuration from environment
apiSecret = process.env.API_SECRET || null

# Facebook
facebookAppSecret = process.env.FACEBOOK_APP_SECRET
facebookClient = facebook.createClient
  facebookAppSecret: facebookAppSecret

# Connection to AuthDB
authdbClient = null

# Extra user data
rootUsermetaClient = null
localUsermetaClient = null
centralUsermetaClient = null
bansClient = null
aliasesClient = null
fullnamesClient = null
friendsClient = null
friendsApi = null
bans = null
authenticator = null

# backend, once initialized
backend = null

# Create a user account
createAccount = (req, res, next) ->

  if usernameError = usernameValidator(req.body.username)
    return sendError req, usernameError, next

  account =
    req_id:   req.id() # pass over request id for better tracking
    id:       req.body.username
    username: req.body.username
    email:    req.body.email
    password: req.body.password
  log.info "register", account

  backend.createAccount account, (err, data) ->
    if err
      return sendError req, err, next
    else
      res.send data
      next()

# Login a user account
login = (req, res, next) ->
  if req.body.facebookToken
    return loginFacebook req, res, next

  checkBanMiddleware req, res, (err) ->
    if err
      return next err

    loginDefault req, res, next

# Login (or register) a facebook user account
loginFacebook = (req, res, next) ->
  account =
    req_id: req.id() # pass over request id for better tracking
    accessToken: req.body.facebookToken
    username: req.body.username
    password: req.body.password
    facebookId: req.body.facebookId
  backend.loginFacebook account, (err, result) ->
    if err
      return next err
    if typeof result != 'undefined'
      res.send result
    next()

loginDefault = (req, res, next) ->

  account =
    req_id:   req.id() # pass over request id for better tracking
    username: req.body.username
    password: req.body.password
  backend.loginAccount account, (err, data) ->
    if err
      return sendError req, err, next

    # login successful.
    # however, there may be an an alias for this account.
    # in this case, we need to log the user as the alias!
    aliasesClient.get account.username, (err, alias) ->

      if err
        log.warn "Error retrieving alias", err

      # No alias found, return the source user.
      if err || !alias
        res.send data
      else
        res.send authenticator.add(alias)
      next()

# callback(error, isBannedBoolean)
checkBan = (username, callback) ->
  bans.get username, (err, ban) ->
    if (err)
      log.error('checkBan() failed', {err, username})
      return callback(err)

    callback(null, ban.exists)

# next() - no error, no ban
# next(err) - error
# res.send(403) - no error, ban
checkBanMiddleware = (req, res, next) ->
  username = (req.params && req.params.username) ||
             (req.body && req.body.username) ||
             null

  if (!username)
    return sendError(req, new restify.BadRequestError, next)

  checkBan username, (err, exists) ->
    if (err)
      return next(err)

    if (exists)
      # Remove authToken of banned accounts
      if (req.params.authToken)
        authdbClient.addAccount(req.params.authToken, null, () ->)

      return res.send(403)

    next()

# Load account details. This call most generally made by a client connecting
# to the server, using a restored session. It's a good place to check
# and refresh a few things, namely facebook friends for now.
getAccountFromAuthDb = (req, res, next) ->
  # We're loading the account from a token (required)
  token = req.params.authToken
  if !token
    err = new restify.InvalidContentError "invalid content"
    return sendError req, err, next

  # Use the authentication database to retrieve more about the user.
  # see `addAuth` for details of what's in the account, for now:
  #  - username
  #  - email
  #  - facebookToken (optionally)
  authdbClient.getAccount token, (err, account) ->
    if err
      log.error err
      err = new restify.NotAuthorizedError "not authorized"
      return sendError req, err, next

    req._store = {account}
    req.body = req.body || {}
    req.body.username = req.body.username || account.username
    next()

getAccountSend = (req, res, next) ->
  # Respond to request.
  { account } = req._store
  res.send(account)

  # Reload facebook friends in the background
  # (next has been called)
  if account.facebookToken
    storeFacebookFriends
      username: account.username
      accessToken: account.facebookToken
      callback: (err) ->
        if err
          log.error "Failed to store friends for #{account.username}", err

  # Update the "auth" metadata
  if account.username
    authenticator.updateAuthMetadata account

# Send a password reset email
passwordResetEmail = (req, res, next) ->
  
  token = req.params?.authToken
  email = req.body?.email

  # Send emails using backend, check for failure
  req.log.info "reset password", {token, email}

  if !token and !email
    err = new restify.InvalidContentError "invalid content"
    return sendError req, err, next

  stats.increment 'stormpath.application.passwordreset'
  backend.sendPasswordResetEmail {email, token, req_id: req.id()}, (err) ->
    if err
      log.error err
      sendError req, err, next
    else
      res.send ok:true
      next()

jsonBody = (req, res, next) ->
  if typeof req.params != 'object'
    return sendError(req, new restify.BadRequestError(
      'Body is not json'), next)
  next()

authMiddleware = (req, res, next) ->

  authToken = req.params.authToken || req.context.authToken
  if !authToken
    return sendError(req, new restify.InvalidContentError(
      'invalid content'), next)

  if apiSecret
    separatorIndex = authToken.indexOf ":"
    if separatorIndex > 0
      reqApiSecret = authToken.substr(0, separatorIndex)
      username = authToken.substr(separatorIndex + 1, authToken.length)
      if apiSecret == reqApiSecret
        req.params.apiSecret = apiSecret
        req.params.user =
          username: username
      next()
      return

  authdbClient.getAccount authToken, (err, account) ->
    if err || !account
      return sendError(req, new restify.UnauthorizedError('
        not authorized'), next)

    req.params.user = account
    next()

# Set metadata
postMetadata = (req, res, next) ->
  # send who is the calling user, or null if not known
  # (so GanomedeUsermeta can check access rights)
  params =
    username: req.params.user.username
    authToken: req.params.authToken || req.context.authToken
    apiSecret: req.params.apiSecret
    req_id: req.id()
  key = req.params.key
  value = req.body.value
  rootUsermetaClient.set params, key, value, (err, reply) ->
    if (err)
      log.error
        err:err
        reply:reply
    res.send ok:!err
    next()

# Get metadata
getMetadata = (req, res, next) ->
  params =
    req_id: req.id()
    authToken: req.params.authToken || req.context.authToken
    username: req.params.user?.username || req.params.username
  key = req.params.key
  rootUsermetaClient.get params, key, (err, reply) ->
    res.send
      key: key
      value: reply
    next()

# Initialize the module
initialize = (cb, options = {}) ->

  if options.log
    log = options.log

  if options.authdbClient
    authdbClient = options.authdbClient
  else
    redisAuthConfig = serviceConfig('REDIS_AUTH', 6379)
    authdbClient = authdb.createClient
      host: redisAuthConfig.host
      port: redisAuthConfig.port

  # Initialize the directory client (if possible)
  directoryClient = options.directoryClient
  createDirectoryClient = () ->
    directoryService = serviceConfig 'DIRECTORY', 8000
    if !directoryService.exists
      return null
    log.info {directoryService}, "Link to ganomede-directory"
    jsonClient = restify.createJsonClient
      url: urllib.format
        protocol: directoryService.protocol || 'http'
        hostname: directoryService.host
        port:     directoryService.port
        pathname: 'directory/v1'
    require('./directory-client').createClient { log, jsonClient }
  directoryClient = directoryClient || createDirectoryClient()

  createGanomedeUsermetaClient = (name, ganomedeEnv) ->
    ganomedeConfig = serviceConfig(ganomedeEnv, 8000)
    if options[name]
      return options[name]
    else if ganomedeConfig.exists
      log.info {ganomedeConfig}, "usermeta[#{name}]"
      return usermeta.create {ganomedeConfig}
    else
      log.warn "cant create usermeta client, no #{ganomedeEnv} config"
      return null

  localUsermetaClient = createGanomedeUsermetaClient(
    "localUsermetaClient", 'LOCAL_USERMETA')
  centralUsermetaClient = createGanomedeUsermetaClient(
    "centralUsermetaClient", 'CENTRAL_USERMETA')
  rootUsermetaClient = usermeta.create router:
    directoryPublic: usermeta.create {directoryClient, mode: 'public'}
    directoryProtected: usermeta.create {directoryClient}
    ganomedeLocal: localUsermetaClient
    ganomedeCentral: centralUsermetaClient

  if options.bans
    bans = options.bans
  else
    bans = new Bans(usermetaClient: centralUsermetaClient)

  # Aliases
  aliasesClient = aliases.createClient
    usermetaClient: centralUsermetaClient

  # Full names
  fullnamesClient = fullnames.createClient
    usermetaClient: centralUsermetaClient

  # Friends
  friendsClient = friendsStore.createClient {
    log, usermetaClient: centralUsermetaClient }

  # Authenticator
  authenticator = authentication.createAuthenticator {
    authdbClient, localUsermetaClient, centralUsermetaClient }

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

  friendsApi = options.friendsApi || require("./friends-api").createApi {
    friendsClient, authMiddleware }

  backendOpts = {
    apiId: options.stormpathApiId
    apiSecret: options.stormpathApiSecret
    appName: options.stormpathAppName
    log
    authdbClient
    aliasesClient
    fullnamesClient
    checkBan
    facebookClient
    facebookFriends
    friendsClient
    authenticator
    stats
  }

  prepareDirectoryBackend = () ->
    directoryClient = directoryClient || createDirectoryClient()
    if !directoryClient
      throw new Error "directory service not configured properly"
    backendOpts.directoryClient = directoryClient
    backendOpts.passwordResetTemplate = require('./mail-template')
      .createTemplate {
        subject: process.env.MAILER_SEND_SUBJECT
        text: process.env.MAILER_SEND_TEXT
        html: process.env.MAILER_SEND_HTML }
    backendOpts.mailerTransport = mailer.createTransport()

  createBackend = options.createBackend
  if !createBackend
    if process.env.USE_STORMPATH_ONLY
      log.info "Using stormpath backend only"
      { createBackend } = require './backend/stormpath'
    else if process.env.USE_DIRECTORY_ONLY
      log.info "Using directory backend only"
      prepareDirectoryBackend()
      { createBackend } = require './backend/directory'
    else
      log.info "Using directory + stormpath backend"
      createInStormpath = !!process.env.CREATE_USERS_IN_STORMPATH
      prepareDirectoryBackend()
      backendOpts.primary = require('./backend/directory')
        .createBackend _.extend({allowCreate: !createInStormpath}, backendOpts)
      backendOpts.secondary = require('./backend/stormpath')
        .createBackend(backendOpts)
      backendOpts.createAccountFromSecondary = createInStormpath
      { createBackend } = require './backend/failover'

  be = createBackend backendOpts
  be.initialize (err, be) ->
    if err
      log.error err, "failed to create backend"
      cb err
    else
      backend = be
      cb()

validateSecret = (req, res, next) ->
  present = apiSecret && req.body && req.body.apiSecret
  ok = if present then apiSecret == req.body.apiSecret else false

  if ok then next() else res.send(403)

banAdd = (req, res, next) ->
  {username} = req.body
  bans.ban username, (err) ->
    if (err)
      log.error('banAdd() failed', {err, username})
      return next(err)

    res.send(200)

banRemove = (req, res, next) ->
  {username} = req.params
  bans.unban username, (err) ->
    if (err)
      log.error('banRemove() failed', {err, username})
      return next(err)

    res.send(200)

banStatus = (req, res, next) ->
  {username} = req.params
  bans.get username, (err, ban) ->
    if (err)
      log.error('banStatus() failed', {err, username})
      return next(err)

    res.json(ban)

# Register routes in the server
addRoutes = (prefix, server) ->
  server.post "/#{prefix}/accounts", createAccount

  server.post "/#{prefix}/login", login

  server.get(
    "/#{prefix}/auth/:authToken/me",
    getAccountFromAuthDb,
    checkBanMiddleware,
    getAccountSend
  )

  server.post("#{prefix}/banned-users", jsonBody, validateSecret, banAdd)
  server.del("#{prefix}/banned-users/:username", validateSecret, banRemove)
  server.get("#{prefix}/banned-users/:username", banStatus)

  endPoint = "/#{prefix}/auth/:authToken/passwordResetEmail"
  server.post endPoint, jsonBody, passwordResetEmail

  endPoint = "/#{prefix}/passwordResetEmail"
  server.post endPoint, jsonBody, passwordResetEmail

  # access to public metadata
  server.get "/#{prefix}/:username/metadata/:key", getMetadata

  # access to protected metadata
  server.get "/#{prefix}/auth/:authToken/metadata/:key",
    authMiddleware, getMetadata
  server.post "/#{prefix}/auth/:authToken/metadata/:key",
    jsonBody, authMiddleware, postMetadata

  friendsApi.addRoutes prefix, server

module.exports =
  initialize: initialize
  addRoutes: addRoutes

# vim: ts=2:sw=2:et:

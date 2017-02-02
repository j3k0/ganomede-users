# returns a BackendInitializer object:
#   an object with a initialize method.
#
# BackendInitializer.initialize(callback)
#   initializes the backend,
#   callback has the following signature:
#     callback(err, backend)

if process.env.LEGACY_ERROR_CODES
  legacyError = (err) ->
    conversions =
      UserAlreadyExistsError_409: 'StormpathResourceError2001'
      BadUserId_400: 'StormpathResourceError2006'
      BadPassword_400: 'StormpathResourceError2007'
      UserNotFoundError_404: 'StormpathResourceError2006'
      InvalidCredentialsError_401: 'StormpathResourceError2006'
    if err and err.body?.code
      id = "#{err.body.code}_#{err.statusCode}"
      err.body.code = conversions[id] || err.body.code
    err
else
  legacyError = (x) -> x

createBackend = ({
  directoryClient # see src/directory-client.coffee
  authenticator   # see src/authentication.coffee
  aliasesClient   # see src/aliases.coffee
  fullnamesClient # see src/fullnames.coffee
  facebookClient  # see src/facebook.coffee
  checkBan        # signature: checkban(callback)
                  #            callback(err, banned)
  tagizer = require 'ganomede-tagizer'
  log = require '../log'
}) ->

  if !directoryClient
    throw new Error "directoryClient missing"

  loginFacebook = ({
    facebookId  # the facebook id of the user
    accessToken # the facebook access token
    username    # the backend username
    password    # the backend password
  }, cb) ->
    cb new Error "not implemented"

  # credentials: { username, password }
  loginAccount = (credentials, cb) ->
    credentials =
      req_id: credentials.req_id
      id: credentials.username
      password: credentials.password
    directoryClient.authenticate credentials, (err, authResult) ->
      if err
        cb legacyError(err)
      else
        cb null, authResult

  createAccount = ({
    id
    username
    password
    email
    req_id
  }, cb) ->
    id = username
    aliases = [{
      type: 'email'
      value: email
      public: false
    }, {
      type: 'name'
      value: username
      public: true
    }, {
      type: 'tag'
      value: tagizer(username)
      public: true
    }]
    account = { id, password, aliases, req_id }
    directoryClient.addAccount account, (err) ->
      cb legacyError(err)

  sendPasswordResetEmail = (email, cb) ->
    cb new Error "not implemented"

  initialize: (cb) ->
    cb null, {
      loginFacebook
      loginAccount
      createAccount
      sendPasswordResetEmail }

module.exports = { createBackend }

# vim: ts=2:sw=2:et:

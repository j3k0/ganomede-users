# returns a BackendInitializer object:
#   an object with a initialize method.
#
# BackendInitializer.initialize(callback)
#   initializes the backend,
#   callback has the following signature:
#     callback(err, backend)

restify = require "restify"
vasync = require "vasync"

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
  facebookAppId = process.env.FACEBOOK_APP_ID
  directoryClient # see src/directory-client.coffee
  authenticator   # see src/authentication.coffee
  aliasesClient   # see src/aliases.coffee
  fullnamesClient # see src/fullnames.coffee
  facebookClient  # see src/facebook.coffee
  checkBan        # signature: checkban(callback)
                  #            callback(err, banned)
  tagizer = require 'ganomede-tagizer'
  log = require '../log'
  fbgraph = require 'fbgraph'
}) ->

  if !directoryClient
    throw new Error "directoryClient missing"

  if !facebookAppId
    throw new Error("facebookAppId missing." +
      "You might like to define env FACEBOOK_APP_ID")

  loginFacebook = ({
    facebookId  # the facebook id of the user
    accessToken # the facebook access token
    username    # the backend username
    password    # the backend password
    req_id
  }, callback) ->

    if !accessToken
      return setImmediate ->
        callback new restify.BadRequestError "Missing accessToken"
    if !username
      return setImmediate ->
        callback new restify.BadRequestError "Missing username"
    if !password
      return setImmediate ->
        callback new restify.BadRequestError "Missing password"

    # Load facebook data from fbgraph API
    loadFacebookAccount = (cb) ->
      token = "access_token=#{accessToken}"
      uri = "/me?fields=id,name,email&#{token}"
      fbgraph.get uri, (err, account) ->
        if err
          cb err
        else
          facebookId = account.id
          cb undefined,
            facebookId: account.id
            fullName:   account.name
            email:      account.email

    # Load directory account
    # check in ganomede-directory if there's already a user with
    # this facebookId
    loadDirectoryAccount = (facebookAccount, cb) ->
      alias =
        type: "facebook.id.#{facebookAppId}"
        value: facebookAccount.facebookId

      directoryClient.byAlias alias, (err, directoryAccount) ->
        cb null, { facebookAccount, directoryAccount }

    # when user isn't in ganomede-directory,
    # check fb:#{facebookId} alias (for legacy support)
    # if there's a username saved there, we'll log him in
    loadLegacyAlias = ({ facebookAccount, directoryAccount }, cb) ->
      if directoryAccount
        cb null, { facebookAccount, directoryAccount }
      else
        aliasesClient.get "fb:#{facebookId}", (err, value) ->
          if err
            cb err
          else if !value
            # User doesn't exist anywhere:
            # it will need to be registered
            cb null, { facebookAccount }
          else
            # User exists only in stormpath, let's format it
            # as a directory account.
            username = value
            directoryAccount =
              id: username
              aliases:
                name: username
                tag: tagizer(username)
                email: facebookAccount.email
            cb null, { facebookAccount, directoryAccount }

    # when user is neither in directory nor in stormpath
    # register it in the directory.
    registerDirectoryAccount = ({ facebookAccount, directoryAccount }, cb) ->
      if directoryAccount
        cb null,
          username: directoryAccount.id
          email: facebookAccount.email
          fullName: facebookAccount.fullName
      else
        id = username
        email = facebookAccount.email
        fullName = facebookAccount.fullName
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
        }, {
          type: 'facebook.id.' + facebookAppId
          value: facebookAccount.facebookId
          public: false
        }]
        account = { id, password, aliases, req_id }
        directoryClient.addAccount account, (err) ->
          if err
            cb err
          else
            cb null, { username, email, fullName }

    # log user in
    loginUser = ({ username, email }, cb) ->
      if !username
        cb new Error("missing username")
      else if !password
        cb new Error("missing password")
      else
        authResult = authenticator.add { username, email }
        cb null, authResult

    # save the user's full name (for future reference)
    saveFullName = ({ username, email, fullName }, cb) ->
      cb null, { username, email }
      if username and fullName
        fullnamesClient.set username, fullName, (err, reply) ->
          if err
            log.warn "failed to store full name", err, {
              username, fullName }

    vasync.waterfall [
      loadFacebookAccount
      loadDirectoryAccount
      loadLegacyAlias
      registerDirectoryAccount
      saveFullName
      loginUser
    ], (err, result) ->
      callback err, result

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
      # TODO, store facebook friends and fullname
      cb legacyError(err)

  sendPasswordResetEmail = (email, cb) ->
    # TODO
    cb new Error "not implemented"

  initialize: (cb) ->
    cb null, {
      loginFacebook
      loginAccount
      createAccount
      sendPasswordResetEmail }

module.exports = { createBackend }

# vim: ts=2:sw=2:et:

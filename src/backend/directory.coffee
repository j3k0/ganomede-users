# returns a BackendInitializer object:
#   an object with a initialize method.
#
# BackendInitializer.initialize(callback)
#   initializes the backend,
#   callback has the following signature:
#     callback(err, backend)

restify = require "restify"
vasync = require "vasync"

createBackend = ({
  facebookAppId = process.env.FACEBOOK_APP_ID
  directoryClient # see src/directory-client.coffee
  authenticator   # see src/authentication.coffee
  aliasesClient   # see src/aliases.coffee
  fullnamesClient # see src/fullnames.coffee
  friendsClient   # see src/friends-store.coffee
  facebookClient  # see src/facebook.coffee
  checkBan        # signature: checkban(callback)
                  #            callback(err, banned)
  facebookFriends # see src/facebook-friends.coffee
  mailerTransport # see src/mailer.coffee
  tagizer = require 'ganomede-tagizer'
  log = require '../log'
  fbgraph = require 'fbgraph'
  generatePassword = require("password-generator").bind(null,8)
  passwordResetTemplate # template with (subject, text and/or html)
                        # see src/mail-template.coffee
  allowCreate = true
}) ->

  if !directoryClient
    throw new Error "directoryClient missing"

  if !facebookAppId
    throw new Error("facebookAppId missing." +
      "You might like to define env FACEBOOK_APP_ID")

  if !passwordResetTemplate
    throw new Error("passwordResetTemplate missing")

  if !mailerTransport
    throw new Error("mailerTransport missing")

  if process.env.LEGACY_ERROR_CODES
    legacyError = (err, req_id) ->
      conversions =
        UserAlreadyExistsError_409: 'StormpathResourceError2001'
        BadUserId_400: 'StormpathResourceError2006'
        BadPassword_400: 'StormpathResourceError2007'
        UserNotFoundError_404: 'StormpathResourceError2006'
        InvalidCredentials_401: 'StormpathResourceError2006'
        AliasAlreadyExistsError_409: 'StormpathResourceError2001'
      if err and err.body?.code
        id = "#{err.restCode}_#{err.statusCode}"
        legacyCode = conversions[id] || err.body.code
        log.debug {
          restCode: err.restCode
          statusCode: err.statusCode
          legacyCode: legacyCode
          req_id: req_id
        }, "Converted to legacy error"
        err.rawCode = err.restCode
        err.body.code = err.restCode = legacyCode
      err
  else
    legacyError = (x) -> x


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
          defaultEmail = () ->
            "#{account.id}@email-not-provided.local"
          facebookId = account.id
          cb undefined,
            facebookId: account.id
            fullName:   account.name
            email:      account.email || defaultEmail()

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
                tag: tagizer.tag(username)
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
        if !allowCreate
          return cb new restify.ForbiddenError(
            'Cannot register new facebook users')
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
          value: tagizer.tag(username)
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

    # save the user's friends
    saveFriends = ({ username, email }, cb) ->
      cb null, { username, email }
      facebookFriends.storeFriends {
        aliasesClient
        friendsClient
        facebookClient
        username
        accessToken
        callback: (err, usernames) ->
          if err
            log.error "Failed to store friends", err
          #else
          #  log.info "Friends stored", usernames
      }

    vasync.waterfall [
      loadFacebookAccount
      loadDirectoryAccount
      loadLegacyAlias
      registerDirectoryAccount
      saveFullName
      saveFriends
      loginUser
    ], callback

  # credentials: { username, password }
  loginAccount = ({req_id, username, password}, cb) ->
    id = username
    credentials = { id, password, req_id }
    directoryClient.authenticate credentials, (err, authResult) ->
      if err
        cb legacyError(err, req_id)
      else
        cb null, {username: id, token: authResult.token}

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
      value: tagizer.tag(username)
      public: true
    }]
    account = { id, password, aliases, req_id }
    directoryClient.addAccount account, (err) ->
      if err
        cb legacyError(err, req_id)
      else
        log.info account, "registered"
        loginAccount { req_id, username: id, password }, cb

  sendPasswordResetEmail = ({token, email, req_id}, callback) ->
    id = null
    name = null
    password = null
    vasync.waterfall [

      # Retrieve the user account from directory
      (cb) ->
        if email
          directoryClient.byAlias {
            type: 'email'
            value: email
            req_id: req_id
          }, cb
        else if token
          directoryClient.byToken {token, req_id}, cb
        else
          cb new restify.BadRequestError(
            'sendPasswordResetEmail requires email or auth token')

      # Edit the user's password
      (account, cb) ->
        id = account.id
        password = generatePassword()
        email = email || account.aliases?.email
        name = account.aliases?.name
        directoryClient.editAccount {id, password, req_id}, cb

      # Send the new password by email
      (result, cb) ->
        cb = cb || result
        templateValues = {id, name, email, password}
        content = passwordResetTemplate.render templateValues
        content.to = "#{id} <#{email}>"
        content.to = email
        content.req_id = req_id
        mailerTransport.sendMail content, cb
    ], callback

  initialize: (cb) ->
    cb null, {
      loginFacebook
      loginAccount
      createAccount
      sendPasswordResetEmail }

module.exports = { createBackend }

# vim: ts=2:sw=2:et:

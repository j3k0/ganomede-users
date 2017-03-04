vasync = require 'vasync'
restify = require "restify"

createBackend = ({
  directoryClient # see src/directory-client.coffee
  authenticator   # see src/authentication.coffee
  aliasesClient   # see src/aliases.coffee
  fullnamesClient # see src/fullnames.coffee
  facebookClient  # see src/facebook.coffee
  checkBan        # signature: checkban(callback)
                  #            callback(err, banned)
  log = require '../log'
  primary
  secondary
  createAccountFromSecondary
}) ->

  if !primary
    throw new Error "primary backend not specified"
  if !secondary
    throw new Error "secondary backend not specified"

  isUserNotFound = (restCode) ->
    [ 'UserNotFoundError', 'ResourceNotFound'
    ].indexOf(restCode) >= 0

  backend = ([ primary, secondary ]) ->

    # attempts to login with primary,
    # tries secondary on failure
    loginAccount = (credentials, cb) ->
      req_id = credentials.req_id
      primary.loginAccount credentials, (err, result) ->
        if err
          log.debug {err, req_id},
            "loginAccount with primary failed"
          if isUserNotFound(err.rawCode || err.restCode)
            log.debug {req_id}, "let's attempt with secondary"
            secondary.loginAccount credentials, cb
          else
            cb err
        else
          cb null, result

    loginFacebook = (account, cb) ->
      req_id = account.req_id
      primary.loginFacebook account, (err, result) ->
        if err
          log.debug {err, req_id},
            "loginFacebook with primary failed"
          secondary.loginFacebook account, cb
        else
          cb null, result

    if createAccountFromSecondary
      log.info "failover backend will create accounts in secondary"
    createAccount = ({
      username
      password
      email
      req_id
    }, cb) ->
      # only attempts to create the account if it does not exists
      authenticator.getAuthMetadata {username}, (err, reply) ->
        if reply
          cb new restify.RestError
            statusCode: 409
            restCode: 'StormpathResourceError2001'
            message: 'User already exists'
        else if createAccountFromSecondary
          secondary.createAccount({username, password, email, req_id}, cb)
        else
          primary.createAccount({username, password, email, req_id}, cb)

    # attempts password reset with primary,
    # tries secondary on failure
    sendPasswordResetEmail = (options, cb) ->
      req_id = options.req_id
      email = options.email
      primary.sendPasswordResetEmail options, (err) ->
        if err
          log.debug {err, email, req_id},
            "sendPasswordResetEmail with primary failed"
          if err.statusCode == 404
            log.debug {req_id},
              "let's attempt with secondary"
            secondary.sendPasswordResetEmail options, cb
          else
            cb err
        else
          cb null

    { loginAccount, createAccount,
      loginFacebook, sendPasswordResetEmail,
      primary, secondary }

  initialize: (cb) ->
    vasync.forEachParallel
      inputs: [ primary, secondary ]
      func: (backend, done) ->
        backend.initialize done
    , (err, results) ->
      if err
        cb err
      else
        cb null, backend results.successes

module.exports = { createBackend }
# vim: ts=2:sw=2:et:

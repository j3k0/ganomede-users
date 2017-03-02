vasync = require 'vasync'

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

  backend = ([ primary, secondary ]) ->

    # attempts to login with primary,
    # tries secondary on failure
    loginAccount = (credentials, cb) ->
      req_id = credentials.req_id
      primary.loginAccount credentials, (err, result) ->
        if err
          log.debug {err, req_id},
            "loginAccount with primary failed"
          if (err.rawCode || err.restCode) == 'UserNotFoundError'
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

    # only attempts to create the account with primary
    if createAccountFromSecondary
      log.info "failover backend will create accounts in secondary"
      createAccount = secondary.createAccount
    else
      log.info "failover backend will create accounts in primary"
      createAccount = primary.createAccount

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

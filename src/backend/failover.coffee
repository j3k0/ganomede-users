vasync = require 'vasync'

createBackend = ({
  directoryClient # see src/directory-client.coffee
  authenticator   # see src/authentication.coffee
  aliasesClient   # see src/aliases.coffee
  fullnamesClient # see src/fullnames.coffee
  facebookClient  # see src/facebook.coffee
  checkBan        # signature: checkban(callback)
                  #            callback(err, banned)
  primary
  secondary
}) ->

  if !primary
    throw new Error "primary backend not specified"
  if !secondary
    throw new Error "secondary backend not specified"

  backend = ([ primary, secondary ]) ->
    
    # attempts to login with primary,
    # tries secondary on failure
    loginAccount = (credentials, cb) ->
      primary.loginAccount credentials, (err, result) ->
        if err
          secondary.loginAccount credentials, cb
        else
          cb null, result

    loginFacebook = (account, cb) ->
      primary.loginFacebook account, (err, result) ->
        if err
          secondary.loginFacebook account, cb
        else
          cb null, result

    # only attempts to create the account with primary
    createAccount = primary.createAccount

    # attempts password reset with primary,
    # tries secondary on failure
    sendPasswordResetEmail = (email, cb) ->
      primary.sendPasswordResetEmail email, (err) ->
        if err
          secondary.sendPasswordResetEmail email, cb
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

createBackend = ({
  directoryClient # see src/directory-client.coffee
  authenticator   # see src/authentication.coffee
  aliasesClient   # see src/aliases.coffee
  fullnamesClient # see src/fullnames.coffee
  facebookClient  # see src/facebook.coffee
  checkBan        # signature: checkban(callback)
                  #            callback(err, banned)
}) ->

  loginFacebook = ({
    facebookId  # the facebook id of the user
    accessToken # the facebook access token
    username    # the backend username
    password    # the backend password
  }, cb) ->
    cb new Error "not implemented"

  # credentials: { username, password }
  loginAccount = (credentials, cb) ->
    directoryClient.authenticate credentials, (err, authResult) ->
      if err
        cb err
      else
        cb null, authResult

  createAccount = ({
    username
    password
    email
  }, cb) ->
    cb new Error "not implemented"

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

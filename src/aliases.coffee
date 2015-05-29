#
# Store alias stormpath username -> co-account username
# in usermeta (someone@fovea.cc -> jeko)
#
createClient = (options) ->

  KEY_NAME = "$alias"

  usermetaClient = options.usermetaClient
  if not usermetaClient
    throw new Error("usermetaClient not defined")

  if not usermetaClient.isValid KEY_NAME
    usermetaClient.validKeys[KEY_NAME] = true

  {
    # Retrieve account alias
    get: (username, cb) ->
      usermetaClient.get username, KEY_NAME, cb

    # Save the account alias
    set: (username, alias, cb) ->
      usermetaClient.set username, KEY_NAME, alias, cb
  }

module.exports =
  createClient: createClient

# vim: ts=2:sw=2:et:

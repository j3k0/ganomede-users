#
# Store an internal information in usermeta
#
createClient = (options) ->

  KEY_NAME = options.key
  if not KEY_NAME
    throw new Error("key not defined")

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
    set: (username, value, cb) ->
      usermetaClient.set username, KEY_NAME, value, cb
  }

clientFactory = (key) ->
  (options) ->
    options.key = key
    createClient options

module.exports =
  createClient: createClient
  clientFactory: clientFactory

# vim: ts=2:sw=2:et:

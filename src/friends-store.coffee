uniq = (a) ->
  has = {}
  a.filter (item) ->
    if has.hasOwnProperty(item)
      return false
    else
      return has[item] = true

createStore = (options) ->

  if options.log
    log = options.log
  else
    log = require("./log").child(module:"friends-store")

  # Constants
  KEY_NAME = options.keyName || "$friends"
  MAX_FRIENDS = options.maxFriends || 1000

  # Usermeta
  usermetaClient = options.usermetaClient
  if not usermetaClient
    throw new Error("usermetaClient not defined")

  if usermetaClient.validKeys and not usermetaClient.isValid KEY_NAME
    usermetaClient.validKeys[KEY_NAME] = true

  # Empty set, prevent creating empty arrays all the time
  EMPTY_SET = []
  SEPARATOR = ","

  log.info "Initialized",
    keyName: KEY_NAME
    maxFriends: MAX_FRIENDS
    separator: SEPARATOR

  {
    # Retrieve account friends
    get: (username, cb) ->
      done = (err, result) ->
        if result
          cb err, result.split(SEPARATOR)
        else
          cb err, EMPTY_SET
      usermetaClient.get username, KEY_NAME, done

    # Save the account friends
    set: (username, friends, cb) ->
      friends = friends.splice(0, MAX_FRIENDS)
      usermetaClient.set username, KEY_NAME, friends.join(SEPARATOR), cb, 0

    # Add a friend
    add: (username, newFriends, cb) ->

      if typeof newFriends == "string"
        return @add(username, [ newFriends ], cb)

      @get username, (err, friends) =>
        if err
          return cb err
        if friends == EMPTY_SET
          friends = newFriends
        else
          friends = friends.concat(newFriends)
        @set username, uniq(friends), cb
  }

module.exports =
  createClient: createStore

# vim: ts=2:sw=2:et:

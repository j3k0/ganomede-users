vasync = require 'vasync'
logDefault = require "./log"

storeFriends = (options) ->

  username = options.username
  aliasesClient = options.aliasesClient
  friendsClient = options.friendsClient
  facebookClient = options.facebookClient
  accessToken = options.accessToken
  callback = options.callback
  rootLog = options.rootLog || logDefault
  log = options.log || rootLog.child(module:"facebook-friends")

  # Retrive usernames using aliases
  retrieveUsernames = (fbFriends, cb) ->
    usernames = []
    vasync.forEachParallel
      func: (fbFriend, done) ->
        aliasesClient.get "fb:#{fbFriend.id}", (err, value) ->
          if value
            usernames.push value
          done()
      inputs: fbFriends
    , (err, results) ->
      if err
        log.error "Failed to retrieve friends usernames."
      cb null, usernames

  # Store the list of facebook friends
  store = ->

    friends = null

    vasync.waterfall [

      # Get friends from facebook
      (cb) ->
        log.info "get friends from facebook"
        facebookClient.getFriends accessToken, cb
      
      # Retrieve their in-game usernames
      (friends, cb) ->
        log.info "get friends usernames"
        log.info friends
        retrieveUsernames friends, cb
      
      # Add them as game friends forever (GFF)
      (names, cb) ->
        friends = names
        log.info "add them as friends"
        friendsClient.add username, names, cb
    ],
    (err, result) ->
      callback err, friends

  store()

module.exports =
  storeFriends: storeFriends

# vim: ts=2:sw=2:et:

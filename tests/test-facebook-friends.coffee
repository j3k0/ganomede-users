assert = require "assert"
facebookFriends = require "../src/facebook-friends"

describe "facebook-friends", ->

  aliasesClient = null
  facebookClient = null
  friendsClient = null

  beforeEach ->
    aliasesClient =
      get: (key, callback) ->
        ALIASES =
          "fb:1": "sousou"
          "fb:2": "willy"
          "fb:3": "hussein"
          "fb:4": "alexey"
        callback null, ALIASES[key]

    facebookClient =
      getFriends: (accessToken, callback) ->
        callback null, [{
          id: 1
          name: "Souad"
        }, {
          id: 2
          name: "Wilbert"
        }, {
          id: 3
          name: "Hussein"
        }]

    friendsClient =
      add: (username, friends, callback) ->
        callback null, ok:true

  storeFriends = (options) ->
    facebookFriends.storeFriends
      username: options.username || "jeko"
      aliasesClient: options.aliasesClient || aliasesClient
      friendsClient: options.friendsClient || friendsClient
      facebookClient: options.facebookClient || facebookClient
      accessToken: options.accessToken || "whatever"
      callback: options.callback

  describe  "storeFriends", (done) ->

    it "store friends", (done) ->

      myFriendsClient =
        add: (username, friends, callback) ->
          assert.equal "jeko", username
          assert.equal 3, friends.length
          callback null, ok:true

      storeFriends
        friendsClient: myFriendsClient
        callback: (err, friends) ->
          assert.ok !err
          assert.equal 3, friends.length
          assert.equal "sousou", friends[0]
          assert.equal "willy", friends[1]
          assert.equal "hussein", friends[2]
          done()

# vim: ts=2:sw=2:et:

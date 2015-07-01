assert = require "assert"
friendsStore = require "../src/friends-store"

manyFriend = (prefix, n) ->
  while n-- > 0
    "#{prefix}#{n}"

describe "friends", ->
  friendsClient = null
  before ->
    fakeUsermetaClient =
      meta: {}
      isValid: (key) -> true
      get: (username, key, cb) ->
        cb null, @meta["#{username}:#{key}"]
      set: (username, key, value, cb, maxLength) ->
        @meta["#{username}:#{key}"] = value
        @meta["#{username}:#{key}:maxLength"] = maxLength
        cb null
    friendsClient = friendsStore.createClient
      usermetaClient: fakeUsermetaClient
      maxFriends: 100

  it "Sets friends", (done) ->
    friendsClient.set "jeko", manyFriend("a", 50), (err) ->
      assert.ok !err
      done()

  it "Gets friends", (done) ->
    friendsClient.get "jeko", (err, friends) ->
      assert.ok !err
      assert.equal 50, friends.length, "has 50 friends"
      assert.equal "a49", friends[0]
      assert.equal "a0", friends[49]
      done()

  it "Add friends to the list", (done) ->
    friendsClient.add "jeko", manyFriend("b", 30), (err) ->
      assert.ok !err
      friendsClient.get "jeko", (err, friends) ->
        assert.ok !err
        assert.equal 80, friends.length
        done()

  it "Doesn't add duplicates", (done) ->
    friendsClient.add "jeko", manyFriend("a", 70), (err) ->
      assert.ok !err
      friendsClient.get "jeko", (err, friends) ->
        assert.ok !err
        assert.equal 100, friends.length
        done()

  it "Doesn't add more that maxFriends", (done) ->
    friendsClient.add "jeko", manyFriend("c", 100), (err) ->
      assert.ok !err
      friendsClient.get "jeko", (err, friends) ->
        assert.ok !err
        assert.equal 100, friends.length
        done()

  it "Returns empty if no friends", (done) ->
    friendsClient.get "none", (err, value) ->
      assert.ok !err
      assert.equal 0, value.length
      done()

# vim: ts=2:sw=2:et:

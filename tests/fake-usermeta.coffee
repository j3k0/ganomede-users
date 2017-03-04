DEFAULT_MAX_LENGTH = 200
class UsermetaClient
  constructor: () ->
    @store = {}
  set: (username, key, value, cb, maxLength = DEFAULT_MAX_LENGTH) ->
    token = "#{username}:#{key}"
    @store[token] = value
    cb null
  get: (username, key, cb) ->
    token = "#{username}:#{key}"
    if !@store[token]
      return cb null, null
    cb null, @store[token]

module.exports =
  createClient: (redis) -> new UsermetaClient(redis)

# vim: ts=2:sw=2:et:



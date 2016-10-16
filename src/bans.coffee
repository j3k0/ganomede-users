class BanInfo
  constructor: (@username, creationTimestamp) ->
    @createdAt = parseInt(String(creationTimestamp), 10) || 0
    @exists = !!@createdAt

class Bans
  constructor: ({@redis, @prefix}) ->
    @prefix = @prefix || 'bans'

  key: (parts...) ->
    return [@prefix, parts...].join(':')

  # callback(err, stuff...) => callback(err)
  _wrapCallback: (cb) ->
    return (err) -> cb(err)

  # callback(err, BanInfo instance)
  get: (username, cb) ->
    @redis.get(
      @key(username),
      (err, reply) ->
        if (err)
          return cb(err)

        cb(null, new BanInfo(username, reply))
    )

  # callback(err)
  ban: (username, cb) ->
    @redis.set(
      @key(username)
      Date.now(),
      @_wrapCallback(cb)
    )

  # callback(err)
  unban: (username, cb) ->
    @redis.del(
      @key(username)
      @_wrapCallback(cb)
    )

module.exports = {Bans, BanInfo}

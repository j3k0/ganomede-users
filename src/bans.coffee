class BanInfo
  constructor: (@username, creationTimestamp) ->
    @createdAt = parseInt(String(creationTimestamp), 10) || 0
    @exists = !!@createdAt

# callback(err, stuff...) => callback(err)
wrapCallback = (cb) ->
  (err) -> cb(err)

class Bans
  constructor: ({@usermetaClient, @prefix}) ->
    @prefix = @prefix || '$banned'

  # key: (parts...) ->
  #   return [@prefix, parts...].join(':')

  # callback(err, BanInfo instance)
  get: (username, cb) ->
    @usermetaClient.get username, @prefix, (err, reply) ->
      if (err)
        return cb(err)
      cb(null, new BanInfo(username, reply))

  # callback(err)
  ban: (username, cb) ->
    @usermetaClient.set username, @prefix,
      String(Date.now()), wrapCallback(cb)

  # callback(err)
  unban: (username, cb) ->
    @usermetaClient.set username, @prefix,
      null, wrapCallback(cb)

module.exports = {Bans, BanInfo}

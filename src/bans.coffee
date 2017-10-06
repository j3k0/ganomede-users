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
  get: (params, cb) ->
    {username} = params
    @usermetaClient.get params, @prefix, (err, reply) ->
      if (err)
        return cb(err)
      info = new BanInfo(username, reply)
      require('./log').warn('Bans#get()', {username, reply, info})
      cb(null, info)

  # callback(err)
  ban: (params, cb) ->
    @usermetaClient.set params, @prefix,
      String(Date.now()), wrapCallback(cb)

  # callback(err)
  unban: (params, cb) ->
    @usermetaClient.set params, @prefix,
      null, wrapCallback(cb)

module.exports = {Bans, BanInfo}

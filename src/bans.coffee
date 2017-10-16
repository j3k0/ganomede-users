parseTimestampString = (value) ->
  str = String(value)
  int = parseInt(str, 10)
  okay = isFinite(int) && /\d{13}/.test(str) # 13 digits should cover it :)
  return {okay, value: if okay then int else 0}

class BanInfo
  constructor: (username, creationTimestamp) ->
    {okay: exists, value: createdAt} = parseTimestampString(creationTimestamp)
    @username = username
    @exists = exists
    @createdAt = createdAt

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
      cb(null, info)

  # callback(err)
  ban: (params, cb) ->
    @usermetaClient.set params, @prefix,
      String(Date.now()), wrapCallback(cb)

  # callback(err)
  unban: (params, cb) ->
    @usermetaClient.set params, @prefix, '<no>', wrapCallback(cb)

module.exports = {Bans, BanInfo}

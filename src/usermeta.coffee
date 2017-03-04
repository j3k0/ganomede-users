redis = require "redis"
restify = require "restify"

DEFAULT_MAX_LENGTH = 200

# TODO: connect to a ganomede-usermeta instance (remove all links to redis usermeta)
# TODO: forget all about keys validation, ganomede-usermeta will take care of that
# TODO: implement virtual metadata 'email' and 'username' (with ganomede-directory)
# TODO: implement virtual metadata 'country' and 'yearofbirth' (with ganomede-directory)
#
# Design:
#
# Lets have 2 implementations of a usermeta client:
#  * GanomedeUsermeta will use ganomede-usermeta (instanced twice -- local and central)
#  * DirectoryAliases will use ganomede-directory aliases
#
# Then create a UsermetaRouter that sends requests to the appropriate client
#
class Usermeta
  constructor: (@redisClient) ->
    @validKeys = null
    if process.env.USERMETA_VALID_KEYS
      keys = process.env.USERMETA_VALID_KEYS.split ","
      @validKeys = {}
      for key in keys
        @validKeys[key] = true

  set: (username, key, value, cb, maxLength = DEFAULT_MAX_LENGTH) ->
    if maxLength > 0 and value?.length > maxLength
      return cb new restify.BadRequestError("Value too large")
    if !@isValid key
      return cb new restify.BadRequestError("Forbidden meta")
    @redisClient.set "#{username}:#{key}", value, (err, reply) ->
      cb err, reply

  get: (username, key, cb) ->
    @redisClient.get "#{username}:#{key}", (err, reply) ->
      cb err, reply

  isValid: (key) ->
    if (@validKeys == null) or (@validKeys[key]) then true else false

module.exports =
  create: (config) ->
    if config.redisClient
      redisClient = config.redisClient
    else
      redisClient = redis.createClient config.port, config.host, config.options
    return new Usermeta(redisClient)
# vim: ts=2:sw=2:et:

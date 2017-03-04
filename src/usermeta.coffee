restify = require "restify"
urllib = require 'url'
log = require "./log"

DEFAULT_MAX_LENGTH = 200

parseParams = (obj) ->
  if typeof obj == 'string' then {username: obj} else obj

# TODO: connect to a ganomede-usermeta instance
#       (remove all links to redis usermeta)
# TODO: forget all about keys validation,
#       ganomede-usermeta will take care of that
# TODO: implement virtual metadata
#       'email' and 'username' (with ganomede-directory)
# TODO: implement virtual metadata 'country' and 'yearofbirth'
#       (with ganomede-directory)
#
# Design:
#
# Lets have 2 implementations of a usermeta client:
#  * GanomedeUsermeta will use ganomede-usermeta
#    (instanced twice -- local and central)
#  * DirectoryAliases will use ganomede-directory aliases
#
# Then create a UsermetaRouter that sends requests to the appropriate client
#
class RedisUsermeta
  constructor: (@redisClient) ->
    @validKeys = null
    if process.env.USERMETA_VALID_KEYS
      keys = process.env.USERMETA_VALID_KEYS.split ","
      @validKeys = {}
      for key in keys
        @validKeys[key] = true

  set: (params, key, value, cb, maxLength = DEFAULT_MAX_LENGTH) ->
    {username} = parseParams(params)
    if maxLength > 0 and value?.length > maxLength
      return cb new restify.BadRequestError("Value too large")
    if !@isValid key
      return cb new restify.BadRequestError("Forbidden meta")
    @redisClient.set "#{username}:#{key}", value, (err, reply) ->
      cb err, reply

  get: (params, key, cb) ->
    {username} = parseParams(params)
    @redisClient.get "#{username}:#{key}", (err, reply) ->
      cb err, reply

  isValid: (key) ->
    if (@validKeys == null) or (@validKeys[key]) then true else false

endpoint = (subpath) -> "/usermeta/v1#{subpath}"
jsonOptions = ({ path, req_id }) ->
  options =
    path: endpoint(path)
  if req_id
    options.headers =
      "x-request-id": req_id
  options

authPath = (params) ->
  if params.apiSecret
    return "/auth/#{params.apiSecret}.#{params.username}"
  else if params.authToken
    return "/auth/#{params.authToken}"
  else
    return "/#{params.username}"

class GanomedeUsermeta
  constructor: (@jsonClient) ->

  set: (params, key, value, cb) ->
    params = parseParams(params)
    options = jsonOptions
      path: authPath(params) + "/#{key}"
      req_id: params.req_id
    body = value: value
    @jsonClient.post options, body, (err, req, res, body) ->
      if err
        (params.log || log).error {err}, "GanomedeUsermeta.post failed"
        cb err, null
      else
        cb null, body

  get: (params, key, cb) ->
    params = parseParams(params)
    options = jsonOptions
      path: authPath(params) + "/#{key}"
      req_id: params.req_id
    @jsonClient.get options, (err, req, res, body) ->
      if err
        (params.log || log).error {err}, "GanomedeUsermeta.get failed"
        cb err, null
      else
        cb err, body[params.username][key] || null

module.exports =
  create: (config) ->
    if config.ganomedeClient
      return new GanomedeUsermeta config.ganomedeClient
    else if config.ganomedeConfig
      return new GanomedeUsermeta restify.createJsonClient
        url: urllib.format
          protocol: config.ganomedeConfig.protocol || 'http'
          hostname: config.ganomedeConfig.host
          port:     config.ganomedeConfig.port
          pathname: config.ganomedeConfig.pathname || 'usermeta/v1'
    else if config.redisClient
      return new RedisUsermeta config.redisClient
    else if config.redisConfig
      return new RedisUsermeta redis.createClient(
        config.redisConfig.port,
        config.redisConfig.host,
        config.redisConfig.options)
    else
      throw new Error("usermeta is missing valid config")

# vim: ts=2:sw=2:et:

restify = require "restify"
urllib = require 'url'
log = require("./log").child(module:"usermeta")
tagizer = require 'ganomede-tagizer'
validator = require './validator'

DEFAULT_MAX_LENGTH = 1000

parseParams = (obj) ->
  if typeof obj == 'string' then {username: obj} else obj

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

# DirectoryAliases* stores metadata as aliases in the directory client.
#
# * all will behave as a protected metatata.
#     * read & write requires authToken
# * except 'name', that will behave as a public metadata.
#     * only write requires authToken
#
# It supports changing 'name' and 'email'
#


# Code shared between DirectoryAliases implementations
directory = {

  # handles replies from directoryClient's read requests
  handleResponse: (params, key, cb) -> (err, account) ->
    if err
      log.error {err, req_id: params.req_id},
        "GanomedeUsermeta.get failed"
      cb err, null
    else
      cb null, (account.aliases[key] || null)

  publicAlias:
    email: false
    name: true
    tag: true

  invalidValue:
    email: (email) -> !validator.email email
    name: (name) -> !validator.name name

  beforeEdit:
    # change the tag before changing the name
    name: (directoryClient, params, key, value, cb) ->
      account = directory.account(params, "tag", tagizer(value))
      directoryClient.editAccount account, cb
    tag: (directoryClient, params, key, value, cb) ->
      cb new restify.NotAuthorizedError "tag is read-only"

  # create a directory account object suitable for POSTing
  account: (params, key, value) ->
    id: params.username
    aliases: [{
      public: !!directory.publicAlias[key]
      type: key
      value: value
    }]
    req_id: params.req_id

  set: (directoryClient, params, key, value, cb) ->
    params = parseParams(params)
    if !params.authToken
      return cb new restify.NotAuthorizedError("Protected meta")

    # special cases:
    #  * 'email' and 'name' have to be valid
    #  * 'name' also changes 'tag'
    if directory.invalidValue[key]?(value)
      return cb new restify.InvalidContentError("#{key} is invalid")

    passTrough = (directoryClient, params, key, value, cb) -> cb(null)
    beforeEdit = directory.beforeEdit[key] || passTrough
    beforeEdit directoryClient, params, key, value, (err) ->
      if err
        return cb err
      directoryClient.editAccount directory.account(params, key, value), cb
}

# Stores "protected" metadata as directory account aliases
class DirectoryAliasesProtected

  constructor: (@directoryClient) ->
    @validKeys = {email: true, name: true, tag: true}
    @type = "DirectoryAliasesProtected"

  isValid: (key) -> !!@validKeys[key]

  set: (params, key, value, cb) ->
    if !@isValid key
      return cb new restify.BadRequestError("Forbidden meta key")
    directory.set @directoryClient, params, key, value, cb

  get: (params, key, cb) ->
    if !@isValid key
      return cb new restify.BadRequestError("Forbidden meta key")
    params = parseParams(params)
    # protected metadata require an authToken for reading
    if !params.authToken
      return cb new restify.NotAuthorizedError("Protected meta")
    account =
      token: params.authToken
      req_id: params.req_id
    @directoryClient.byToken account,
      directory.handleResponse(params, key, cb)

# Stores "public" metadata as directory account aliases
class DirectoryAliasesPublic

  constructor: (@directoryClient) ->
    @validKeys = {name: true, tag: true}
    @type = "DirectoryAliasesPublic"

  isValid: (key) -> !!@validKeys[key]

  set: (params, key, value, cb) ->
    if !@isValid key
      return cb new restify.BadRequestError("Forbidden meta key")
    directory.set @directoryClient, params, key, value, cb

  get: (params, key, cb) ->
    if !@isValid key
      return cb new restify.BadRequestError("Forbidden meta key")
    params = parseParams(params)
    account =
      id: params.username
      req_id: params.req_id
    @directoryClient.byId account,
      directory.handleResponse(params, key, cb)

# Stores "public" metadata in redis
class RedisUsermeta
  constructor: (@redisClient) ->
    @type = "RedisUsermeta"
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
      return cb new restify.BadRequestError("Forbidden meta key")
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

# Stores metadata in ganomede-usermeta
# ganomede-usermeta server will take care of key validation
class GanomedeUsermeta
  constructor: (@jsonClient) ->
    @type = "GanomedeUsermeta"

  set: (params, key, value, cb) ->
    params = parseParams(params)
    options = jsonOptions
      path: authPath(params) + "/#{key}"
      req_id: params.req_id
    body = value: value
    @jsonClient.post options, body, (err, req, res, body) ->
      if err
        log.error {err, req_id: params.req_id},
          "GanomedeUsermeta.post failed"
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
        log.error {err, req_id: params.req_id},
          "GanomedeUsermeta.get failed"
        cb err, null
      else
        cb err, body[params.username][key] || null

# Routes metadata to one of its children
#
# For now, no complex genericity,
# it's just hard-coded routes for our use case.
#
#  - 'name' -> DirectoryAliasesPublic
#  - 'email' -> DirectoryAliasesProtected
#  - 'country' -> GanomedeUsermeta.Central
#  - 'yearofbirth' -> GanomedeUsermeta.Central
#  - * -> GanomedeUsermeta.Local
class UsermetaRouter
  constructor: ({
    @directoryPublic,
    @directoryProtected,
    @ganomedeCentral,
    @ganomedeLocal
  }) ->
    @type = "UsermetaRouter"
    @routes =
      name: @directoryPublic
      email: @directoryProtected
      country: @ganomedeCentral
      yearofbirth: @ganomedeCentral

  set: (params, key, value, cb) ->
    params = parseParams(params)
    client = @routes[key] || @ganomedeLocal
    client.set params, key, value, cb

  get: (params, key, cb) ->
    params = parseParams(params)
    client = @routes[key] || @ganomedeLocal
    client.get params, key, cb

module.exports =
  create: (config) ->

    # Linked with a ganomede-usermeta jsonClient
    if config.ganomedeClient
      return new GanomedeUsermeta config.ganomedeClient
    if config.ganomedeConfig
      return new GanomedeUsermeta restify.createJsonClient
        url: urllib.format
          protocol: config.ganomedeConfig.protocol || 'http'
          hostname: config.ganomedeConfig.host
          port:     config.ganomedeConfig.port
          pathname: config.ganomedeConfig.pathname || 'usermeta/v1'

    # Linked with redis
    if config.redisClient
      return new RedisUsermeta config.redisClient
    if config.redisConfig
      return new RedisUsermeta redis.createClient(
        config.redisConfig.port,
        config.redisConfig.host,
        config.redisConfig.options)

    # Linked with a ganomede-directory client
    # (see directory-client.coffee)
    if config.directoryClient and config.mode == 'public'
      return new DirectoryAliasesPublic config.directoryClient
    if config.directoryClient
      return new DirectoryAliasesProtected config.directoryClient

    # Create a usermeta router
    # ganomedeLocal is required, other children are optional
    if config.router and config.router.ganomedeLocal
      return new UsermetaRouter config.router

    throw new Error("usermeta is missing valid config")

# vim: ts=2:sw=2:et:

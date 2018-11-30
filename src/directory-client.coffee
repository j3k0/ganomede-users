#
# Talks to directory server
#

#
# DirectoryAccount: {
#   "id": string
#   aliases: {
#     "<type>": "<value>"
#     ...
#   }
#
# example DirectoryAccount:
# {"id":"aaa","aliases":{"email":"user@email.com","name":"aaa","tag":"aaa"}}
#

restify = require 'restify'
logMod = require './log'
{CREATE, CHANGE, LOGIN} = require('./event-sender')

noop = () ->

reduceAliases = (aliases) ->
  aliases.reduce(
    (ref, {type, value}) -> ref[type] = value; ref
    {}
  )

eventData = (req_id, userId, aliases = []) ->
  req_id: req_id
  userId: userId,
  aliases: reduceAliases(aliases)

createClient = ({
  jsonClient
  log
  apiSecret = process.env.API_SECRET
  sendEvent = noop
}) ->

  if !jsonClient
    throw new Error('jsonClient required')

  if sendEvent == noop
    log.warn('Directory client created with sendEvent set to noop')

  jsonPost = (options, reqBody, cb) ->
    jsonClient.post options, reqBody, (err, req, res, resBody) ->
      log.debug {
        options
        reqBody
        req_id: options.headers?['x-request-id']
        resErr: err
        resBody
      }, "directoryClient.post"
      cb err, req, res, resBody

  jsonGet = (options,  cb) ->
    jsonClient.get options, (err, req, res, body) ->
      log.debug {
        options,
        req_id: options.headers?['x-request-id']
        resErr: err
        resBody: body
      }, "directoryClient.get"
      cb err, req, res, body

  pathname = jsonClient.url?.pathname || ''
  log = log || logMod.child directoryClient:pathname
  log.info { pathname }, "DirectoryClient created"

  endpoint = (subpath) -> pathname + subpath

  jsonOptions = ({ path, req_id }) ->
    options =
      path: endpoint(path)
    if req_id
      options.headers =
        "x-request-id": req_id
    options

  authenticate = (credentials, callback) ->

    req_id = credentials.req_id
    options = jsonOptions {path: '/users/auth', req_id}
    body =
      id: credentials.id
      password: credentials.password

    jsonPost options, body, (err, req, res, body) ->

      if err?.restCode == 'UserNotFoundError'
        log.info {
          req_id
          id: credentials.id
          code: 'UserNotFoundError'
        }, "failed to authenticate"
        callback err

      else if res?.statusCode == 401
        callback new restify.InvalidCredentialsError()

      else if err
        log.error {
          req_id
          err: err
        }, "authentication error"
        callback err

      else if res?.statusCode != 200
        log.error {
          req_id
          code: res.statusCode
        }, "failed to authenticate"
        callback new Error "HTTP#{res.statusCode}"

      else
        sendEvent LOGIN, eventData(req_id, credentials.id)
        callback null, body

  addAccount = (account = {}, callback) ->

    if !account.id || !account.password
      return callback new restify.InvalidContentError(
        'Missing credentials')

    options = jsonOptions
      path: '/users'
      req_id: account.req_id

    body =
      secret: apiSecret
      id: account.id
      password: account.password
      aliases: account.aliases

    postAccount 'create', options, body, (err, bodyResult) ->
      if err
        return callback(err)

      sendEvent CREATE, eventData(account.req_id, account.id, account.aliases)
      callback(null, bodyResult)

  editAccount = (account = {}, callback) ->

    if !account.id
      return callback new restify.InvalidContentError(
        'Missing account id')

    options = jsonOptions
      path: "/users/id/" + encodeURIComponent(account.id)
      req_id: account.req_id

    body = secret: apiSecret
    triggerChangeEvent = false

    if account.password
      body.password = account.password
    else if account.aliases and account.aliases.length
      body.aliases = account.aliases
      triggerChangeEvent = true
    else
      return callback new restify.InvalidContentError(
        'Nothing to change')

    postAccount "edit", options, body, (err, bodyResult) ->
      if err
        return callback(err)

      if (triggerChangeEvent)
        sendEvent CHANGE, eventData(account.req_id, account.id, body.aliases)

      callback(null, bodyResult)

  postAccount = (description, options, body, callback) ->

    jsonPost options, body, (err, req, res, body) ->
      if err
        callback err
      else if res.statusCode != 200
        log.error {code: res.statusCode}, "failed to #{description} account"
        callback new Error "HTTP#{res.statusCode}"
      else if !body
        callback new restify.InvalidContentError(
          'Server replied with no data')
      else
        callback null, body

  processGetResponse = (callback) -> (err, req, res, body) ->
    if err
      callback err
    else if res.statusCode != 200
      callback new Error "HTTP#{res.statusCode}"
    else if !body
      callback new restify.InvalidContentError(
        'Server replied with no data')
    else
      callback null, body

  byAlias = ({ type, value, req_id }, callback) ->

    options = jsonOptions
      path: ("/users/alias/" +
        encodeURIComponent(type) + "/" +
        encodeURIComponent(value))
      req_id: req_id
    jsonGet options, processGetResponse(callback)

  # callback(err, DirectoryAccount)
  byToken = ({ token, req_id }, callback) ->

    options = jsonOptions
      path: "/users/auth/" + encodeURIComponent(token)
      req_id: req_id
    jsonGet options, processGetResponse(callback)

  # callback(err, DirectoryAccount)
  byId = ({ id, req_id }, callback) ->

    options = jsonOptions
      path: "/users/id/" + encodeURIComponent(id)
      req_id: req_id
    jsonGet options, processGetResponse(callback)

  { endpoint, authenticate, addAccount, byId, byAlias, byToken, editAccount }

module.exports = { createClient }
# vim: ts=2:sw=2:et:

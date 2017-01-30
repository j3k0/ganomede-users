#
# Talks to directory server
#

restify = require 'restify'
logMod = require './log'
clone = (obj) -> JSON.parse(JSON.stringify(obj))

createClient = ({
  jsonClient
  log
  apiSecret = process.env.API_SECRET
}) ->

  if !jsonClient
    throw new Error('jsonClient required')

  pathname = jsonClient.url?.pathname || ''
  log = log || logMod.child directoryClient:pathname
  log.info { pathname }, "DirectoryClient created"

  endpoint = (subpath) -> pathname + subpath

  authenticate = (credentials, callback) ->
    url = endpoint '/users/auth'
    jsonClient.post url, credentials, (err, req, res, body) =>

      if err
        log.error "failed authenticate", err
        callback(err)

      else if res.statusCode == 401
        callback new restify.InvalidCredentialsError()

      else if (res.statusCode != 200)
        log.error "failed to authenticate", code:res.statusCode
        callback new Error "HTTP#{res.statusCode}"

      else
        callback null, body

  addAccount = (account = {}, aliases = [], callback) ->

    if !account.id || !account.password
      return callback new restify.InvalidContentError(
        'Missing credentials')
    url = endpoint '/users'
    data =
      secret: apiSecret
      id: account.id
      password: account.password
      aliases: aliases
    jsonClient.post url, data, (err, req, res, body) ->
      if err
        callback err
      else if (res.statusCode != 200)
        log.error "failed to create account", code:res.statusCode
        callback new Error "HTTP#{res.statusCode}"
      else if !body
        callback new restify.InvalidContentError(
          'Server replied with no data')
      else
        callback null, body

  # POST /moves
  # @game should contain moveData to post
  # callback(err, directoryError, newState)
  #moves = (game, callback) ->
  #  url = endpoint('/moves')
  #  # @log.info { url:url }, "post /moves"
  #  jsonClient.post url, game, (err, req, res, body) =>
  #    if (err)
  #      restifyError = body && (err instanceof restify.RestError)
  #      if restifyError
  #        log.warn 'moves() rejected move with directory error', {
  #          err, body, game }
  #        return callback(null, err)
  #      else
  #        log.error 'DirectoryClient.moves() failed', {
  #          err, game }
  #        return callback(err)

  #    copyGameFields game, body
  #    callback(null, null, body)

  { endpoint, authenticate, addAccount }

module.exports = { createClient }
# vim: ts=2:sw=2:et:

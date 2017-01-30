#
# Talks to directory server
#

restify = require 'restify'
logMod = require './log'
clone = (obj) -> JSON.parse(JSON.stringify(obj))

createClient = ({ jsonClient, log }) ->

  if !jsonClient
    throw new Error('jsonClient required')

  pathname = jsonClient.url?.pathname
  log = log || logMod.child directoryClient:pathname
  log.info { pathname }, "DirectoryClient created"

  endpoint = (subpath) ->
    return "#{jsonClient.url?.pathname || ''}#{subpath}"

  games = (game, callback) ->
    url = endpoint '/games'
    jsonClient.post url, game, (err, req, res, body) =>
      if (err)
        log.error "failed to generate game", err
        return callback(err)

      if (res.statusCode != 200)
        log.error "game generated with code", {code:res.statusCode}
        return callback(new Error "HTTP#{res.statusCode}")

      copyGameFields game, body
      callback(null, body)

  # POST /moves
  # @game should contain moveData to post
  # callback(err, directoryError, newState)
  moves = (game, callback) ->
    url = endpoint('/moves')
    # @log.info { url:url }, "post /moves"
    jsonClient.post url, game, (err, req, res, body) =>
      if (err)
        restifyError = body && (err instanceof restify.RestError)
        if restifyError
          log.warn 'moves() rejected move with directory error', {
            err, body, game }
          return callback(null, err)
        else
          log.error 'DirectoryClient.moves() failed', {
            err, game }
          return callback(err)

      copyGameFields game, body
      callback(null, null, body)

  { endpoint }

module.exports = { createClient }
# vim: ts=2:sw=2:et:

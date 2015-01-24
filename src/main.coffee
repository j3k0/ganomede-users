log = require "./log"
aboutApi = require "./about-api"
pingApi = require "./ping-api"
usersApi = require "./users-api"

addRoutes = (prefix, server) ->
  log.info "adding routes"

  # Platform Availability
  pingApi.addRoutes prefix, server

  # About
  aboutApi.addRoutes prefix, server

  # About
  usersApi.addRoutes prefix, server

initialize = (callback) ->
  log.info "initializing backend"
  usersApi.initialize (err) ->
    if err
      log.error err
      process.exit 1
      return
    callback?()

destroy = ->
  log.info "destroying backend"

module.exports =
  initialize: initialize
  destroy: destroy
  addRoutes: addRoutes
  log: log

# vim: ts=2:sw=2:et:

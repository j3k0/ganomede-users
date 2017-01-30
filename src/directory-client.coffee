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

  { endpoint }

module.exports = { createClient }
# vim: ts=2:sw=2:et:

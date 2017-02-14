logMod = require './log'
StatsD = require 'node-statsd'

dummyClient = () ->
  increment: () ->
  timing:    () ->
  decrement: () ->
  histogram: () ->
  gauge:     () ->
  set:       () ->
  unique:    () ->

requiredEnv = [ 'STATSD_HOST', 'STATSD_PORT', 'STATSD_PREFIX' ]

missingEnv = () ->
  for e in requiredEnv
    if !process.env[e]
      return e
  return undefined

createClient = ({
  log = logMod.child(module: "statsd")
} = {}) ->
  if missingEnv()
    log.warn "Can't initialize statsd, missing env: " + missingEnv()
    return dummyClient()
  client = new StatsD
    host: process.env.STATSD_HOST
    port: process.env.STATSD_PORT
    prefix: process.env.STATSD_PREFIX
  client.socket.on 'error', (error) ->
    log.error "error in socket", error
  return client

module.exports =
  createClient: createClient
  dummyClient: dummyClient

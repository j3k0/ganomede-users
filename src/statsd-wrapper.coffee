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

env = process.env
requiredEnv = [ 'STATSD_HOST', 'STATSD_PORT', 'STATSD_PREFIX' ]

missingEnv = () ->
  requiredEnv.reduce (missing, e) ->
    if !env[e]
      if missing
        return missing + ',' + e
      else
        return e
    return missing

createClient = () ->
  log = logMod.child(module: "statsd")
  if missingEnv()
    log.warn "Can't initialize statsd, missing env: " + missingEnv()
    return dummyClient()
  client = new StatsD
    host: env.STATSD_HOST
    port: env.STATSD_PORT
    prefix: env.STATSD_PREFIX
  client.socket.on 'error', (error) ->
    log.error "error in socket", error
  return client

module.exports = createClient()

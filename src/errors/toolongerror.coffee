restify = require 'restify'
util = require 'util'

TooLongError = (message) ->
  restify.RestError.call @,
    restCode: 'TooLongError'
    statusCode: 400
    message: message
    constructorOpt: TooLongError
  @name = 'TooLongError'

util.inherits TooLongError, restify.RestError

module.exports = TooLongError

# vim: ts=2:sw=2:et:

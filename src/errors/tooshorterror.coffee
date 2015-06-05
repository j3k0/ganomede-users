restify = require 'restify'
util = require 'util'

TooShortError = (message) ->
  restify.BadRequestError
    restCode: 'TooShortError',
    statusCode: 400,
    message: message,
    constructorOpt: TooShortError
  @name = 'TooShortError'

util.inherits TooShortError, restify.BadRequestError

module.exports = TooShortError

# vim: ts=2:sw=2:et:

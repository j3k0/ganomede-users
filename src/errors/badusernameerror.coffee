restify = require 'restify'
util = require 'util'

BadUsernameError = (message) ->
  restify.BadRequestError
    restCode: 'BadUsernameError'
    statusCode: 400
    message: message
    constructorOpt: BadUsernameError
  @name = 'BadUsernameError'

util.inherits BadUsernameError, restify.BadRequestError

module.exports = BadUsernameError

# vim: ts=2:sw=2:et:

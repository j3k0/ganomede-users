usernameValidator = require './username-validator'

module.exports =
  email: (email) ->
    re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/ # noqa
    re.test(email)
  name: (name) -> !usernameValidator(name)
  password: (password) -> password.length >= 6

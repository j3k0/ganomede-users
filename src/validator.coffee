module.exports =
  email: (email) ->
    re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/ # noqa
    re.test(email)
  name: (name) ->
    re = /^[a-zA-Z0-0]+/
    name.length <= 10 && name.length >= 3 && re.test(name)

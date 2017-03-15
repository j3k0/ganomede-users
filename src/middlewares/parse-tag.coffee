# - read req.params.tag
# - load the user id from the ganomede-directory
# - store it into req.params.username
#
# in case of error, sets req.params.username = req.params.tag
tagizer = require 'ganomede-tagizer'

saveAccount = (req, account) ->
  req.params = req.params || {}
  req.params.username = account.id
  req.params.user = req.params.user || {}
  req.params.user.username = account.id
  if account.aliases
    req.params.user.tag = account.aliases.tag
    req.params.user.name = account.aliases.name
    req.params.user.email = account.aliases.email

createBodyMiddleware = ({
  directoryClient
  log
  field = "tag"
}) -> (req, res, next) ->

  tag = req.body[field]
  if !directoryClient
    return next()

  req_id = req.id()
  directoryClient.byAlias {
    type: "tag"
    value: tagizer.tag(tag)
    req_id
  }, (err, account) ->

    if err
      log.warn {err, tag, req_id}, "directoryClient.byAlias failed"
    else if !account
      log.warn {tag, req_id},
        "directoryClient.byAlias returned no account"
    else
      req.body[field] = account.id
      saveAccount req, account

    next()

createParamsMiddleware = ({
  directoryClient
  log
  field = "tag"
}) -> (req, res, next) ->

  tag = req.params[field]

  if !directoryClient
    req.params.username = tag
    return next()

  req_id = req.id()
  directoryClient.byAlias {
    type: "tag"
    value: tagizer.tag(tag)
    req_id
  }, (err, account) ->

    if err
      log.warn {err, tag, req_id}, "directoryClient.byAlias failed"
      req.params.username = tag
    else if !account
      log.warn {tag, value, req_id},
        "directoryClient.byAlias returned no account"
      req.params.username = tag
    else
      saveAccount req, account

    next()

module.exports = {createParamsMiddleware, createBodyMiddleware}

# - read req.params.tag
# - load the user id from the ganomede-directory
# - store it into req.params.username
#
# in case of error, sets req.params.username = req.params.tag
tagizer = require 'ganomede-tagizer'

createMiddleware = ({directoryClient, log}) -> (req, res, next) ->

  {tag} = req.params

  if !directoryClient
    req.params.username = tag
    return next()

  directoryClient.byAlias {
    type: "tag"
    value: tagizer(tag)
    req_id: req.id()
  }, (err, account) ->

    if err
      log.warn {err, tag, value, req_id}, "directoryClient.byAlias failed"
      req.params.username = tag
    else if !account
      log.warn {tag, value, req_id},
        "directoryClient.byAlias returned no account"
      req.params.username = tag
    else
      req.params.username = account.id
      req.params.user = req.params.user || {}
      req.params.user.username = account.id
      if account.aliases
        req.params.user.tag = account.aliases.tag
        req.params.user.name = account.aliases.name
        req.params.user.email = account.aliases.email

    next()

module.exports = {createMiddleware}

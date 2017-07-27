# - read req.params.tag
# - load the user id from the ganomede-directory
# - store it into req.params.username
#
# in case of error, sets req.params.username = req.params.tag
tagizer = require 'ganomede-tagizer'

# Link tag -> user id
idFromTag = {}

# Check for known user id from tag, store in
# req.params.user.username and req.params.username
loadFromCache = (req, tag) ->
  id = idFromTag[tag]
  if id
    req.params = req.params || {}
    req.params.username = id
    req.params.user = req.params.user || {}
    req.params.user.username = id
    return true

# Cache link user tag -> id
saveToCache = (tag, account) ->
  idFromTag[tag] = account.id

saveAccount = (req, account) ->
  req.log.debug {account}, "saveAccount"
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

  req.log.info {field}, 'bodyTag middleware'
  tag = req.body[field]
  if !directoryClient
    return next()

  tagtag = tagizer.tag(tag)

  req_id = req.id()
  directoryClient.byAlias {
    type: "tag"
    value: tagtag
    req_id
  }, (err, account) ->

    if err and err.statusCode != 404
      req.log.warn {err, tag}, "directoryClient.byAlias failed"
    else if !account
      req.log.info {tag},
        "directoryClient.byAlias returned no account"
    else
      req.log.debug {account}, "directoryClient.byAlias succeeded"
      req.body[field] = account.id
      saveAccount req, account
      saveToCache tagtag, account

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

  tagtag = tagizer.tag(tag)

  if loadFromCache req, tagtag
    return next()

  req_id = req.id()
  directoryClient.byAlias {
    type: "tag"
    value: tagtag
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
      saveToCache tagtag, account

    next()

module.exports = {createParamsMiddleware, createBodyMiddleware}

log = require "./log"
restify = require "restify"

class Api

  constructor: (options = {}) ->

    @options = options || {}
    @authMiddleware = @options.authMiddleware
    @friendsClient = @options.friendsClient
    @log = options.log || log.child(module: "friends-api")

  addRoutes: (prefix, server) ->

    endpoint = "/#{prefix}/auth/:authToken/friends"
    server.post endpoint, @authMiddleware, @post.bind(@)
    server.get endpoint, @authMiddleware, @get.bind(@)

  get: (req, res, next) ->

    username = req.params.user?.username
    params =
      log: req.log
      req_id: req.id()
      username: username
      authToken: req.params.authToken || req.context.authToken
      apiSecret: req.params.apiSecret

    @friendsClient.get params, (err, friends) =>
      if (err)
        @log.error
          message: "friendsClient.get"
          err: err
          reply: friends
        return next(err)

      res.send friends
      next()

  isValidList: (friends) ->
    return (
      typeof friends == 'object' and
      friends.length > 0 and
      typeof friends[0] == "string"
    )

  post: (req, res, next) ->

    # Retrieve input parameters
    username = req.params.user?.username
    friends = req.body

    # Check parameters validity
    if not @isValidList(friends)
      err = new restify.InvalidContentError "invalid content"
      return next(err)

    params =
      log: req.log
      req_id: req.id()
      username: username
      authToken: req.params.authToken || req.context.authToken
      apiSecret: req.params.apiSecret

    # Store
    @friendsClient.add params, friends, (err, friends) =>

      if (err)
        @log.error
          message: "friendsClient.add"
          err: err
          reply: friends
        return next(err)
      res.send ok:!err
      next()

module.exports =
  createApi: (options) -> new Api(options)

# vim: ts=2:sw=2:et:

graph = require 'fbgraph'
log = require "./log"

class FacebookClient
  constructor: (options = {}) ->
    if options.facebookAppSecret
      graph.setAppSecret options.facebookAppSecret
    @log = options.log || log.child(module:"facebook")

  _getFriendsPage: (accessToken, uri, list, cb) ->
    graph.get "#{uri}&access_token=#{accessToken}", (err, res) =>

      # Add new friends to the list
      if res?.data
        for friend in res.data
          list.push friend

      # Go to the next page, if any
      if res?.paging?.next
        _getFriendsPage accessToken, res.paging.next, cb
      else
        cb err, list

  getFriends: (accessToken, cb) ->
    @_getFriendsPage accessToken, "/me/friends?limit=50", [], (err, list) =>
      if err
        @log.error "Failed to retrieve friends", err
      cb err, list

module.exports =
  createClient: (options = {}) ->
    new FacebookClient(options)

# vim: ts=2:sw=2:et:

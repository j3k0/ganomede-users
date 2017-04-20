log = require "./log"
restify = require "restify"

class FacebookClient
  constructor: (options = {}) ->
    @log = options.log || log.child(module:"facebook")
    @fbgraphClient = options.fbgraphClient || restify.createJsonClient
      url: "https://graph.facebook.com"
      version: '*'

  _getFriendsPage: (accessToken, uri, list, cb) ->
    uri = "#{uri}&access_token=#{accessToken}"
    @fbgraphClient.get uri, (err, req, res, result) =>

      # Add new friends to the list
      if result?.data
        for friend in result.data
          list.push friend

      # Go to the next page, if any
      if result?.paging?.next
        @_getFriendsPage accessToken, result.paging.next, list, cb
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

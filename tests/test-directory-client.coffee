restify = require 'restify'
td = require 'testdouble'
directoryClientMod = require '../src/directory-client'

API_SECRET = 'my-api-secret'
CREDS =
  id: 'myuserid'
  password: 'mypassword'
WRONG_CREDS =
  id: 'myuserid'
  password: 'badpasswd'
TOKEN = 'mytoken'
ADD_ACCOUNT =
  secret: API_SECRET
  id: CREDS.id
  password: CREDS.password

jsonClientTD = ->
  jsonClient = td.object [ 'post' ]

  # attempt to authenticate with unknown credentials
  status = (code) -> statusCode:code

  td.when(jsonClient.post(
    '/users/auth', td.matchers.anything()))
      .thenCallback null, null, status(401)

  # attempt to authenticate with valid credentials
  td.when(jsonClient.post(
    '/users/auth', td.matchers.contains(CREDS)))
      .thenCallback null, null, status(200), token:TOKEN

  # ...
  td.when(jsonClient.post(
    '/users', td.matchers.anything()))
      .thenCallback null, null, status(400)

  td.when(jsonClient.post(
    '/users', td.matchers.contains(ADD_ACCOUNT)))
      .thenCallback null, null, status(200), id:CREDS.id

  jsonClient

baseTest = ->

  callback = td.function 'callback'
  jsonClient = jsonClientTD()
  log = td.object [ 'info', 'warn', 'error' ]
  directoryClient = directoryClientMod.createClient {
    log, jsonClient, apiSecret:API_SECRET }

  { directoryClient, jsonClient, callback }

describe 'directory-client', ->

  describe '.authenticate()', ->

    authenticate = (creds) ->
      ret = baseTest()
      ret.directoryClient.authenticate creds, ret.callback
      ret

    it 'sends a POST request to /directory/v1/users/auth with credentials', ->
      { jsonClient } = authenticate CREDS
      td.verify jsonClient.post('/users/auth', CREDS, td.callback)

    it 'reports failure when response status is not 200', ->
      { callback } = authenticate WRONG_CREDS
      td.verify callback td.matchers.isA(Error)

    it 'returns the generated token when response status is 200', ->
      { callback } = authenticate CREDS
      td.verify callback null, td.matchers.contains(token:TOKEN)

  describe '.addAccount()', ->

    addAccount = (account, aliases) ->
      ret = baseTest()
      ret.directoryClient.addAccount account, aliases, ret.callback
      ret

    it 'requires credentials as argument', ->
      { callback } = addAccount null
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)

    it 'requires an argument with id and password fields', ->
      { callback } = addAccount {}, []
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)
      { callback } = addAccount {id:CREDS.id}, []
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)
      { callback } = addAccount {password:CREDS.password}, []
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)

    it 'reports success', ->
      { callback } = addAccount CREDS
      td.verify callback(null, id:CREDS.id)

    it 'sends a POST request to /directory/v1/users', ->
      { jsonClient } = addAccount CREDS
      td.verify jsonClient.post(
        '/users', td.matchers.contains(ADD_ACCOUNT), td.callback)

    it 'reports failure when response status is not 200', ->
      { callback } = addAccount WRONG_CREDS
      td.verify callback td.matchers.isA(Error)

    it.skip 'reports failure when directory server is not reachable', ->
      throw new Error "TODO"

  describe.skip '.editAccount()', ->
    it 'sends a POST request to /directory/v1/users/id/:id', ->
      return
    it 'reports failure when response status is not 200', ->
      return
    it 'reports failure when directory server is not reachable', ->
      return

# vim: ts=2:sw=2:et:

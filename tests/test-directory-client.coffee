restify = require 'restify'
{expect} = require 'chai'
td = require 'testdouble'
directoryClientMod = require '../src/directory-client'
tagizer = require 'ganomede-tagizer'

{ EXISTING_USER, NEW_USER, API_SECRET,
  authResult, directoryAccount, findAlias,
  directoryAliasesObj
} = require './directory-data.coffee'

CREDS = directoryAccount(EXISTING_USER)
WRONG_CREDS = directoryAccount(NEW_USER)
ADD_ACCOUNT = directoryAccount(NEW_USER)
ADD_ACCOUNT.secret = API_SECRET

jsonClientTD = ->
  jsonClient = td.object [ 'post', 'get' ]

  # attempt to authenticate with unknown credentials
  status = (code) -> statusCode:code

  td.when(jsonClient.post(
    td.matchers.contains(path: '/users/auth'), td.matchers.anything()))
      .thenCallback null, null, status(401)

  # attempt to authenticate with valid credentials
  td.when(jsonClient.post(
    td.matchers.contains(path: '/users/auth'),
    td.matchers.contains directoryAccount(EXISTING_USER)))
    .thenCallback null, null, status(200), authResult(EXISTING_USER)

  # attempt to create a user with random data
  td.when(jsonClient.post(
    td.matchers.contains(path:'/users'), td.matchers.anything()))
      .thenCallback null, null, status(400)

  # attempt to create a user with valid account data from NEW_USER
  td.when(jsonClient.post(
    td.matchers.contains(path: '/users'), td.matchers.contains(ADD_ACCOUNT)))
      .thenCallback null, null, status(200), id:NEW_USER.id

  # fails when loading unknown aliases
  td.when(jsonClient.get(
    td.matchers.anything()))
      .thenCallback null, null, status(404)

  # fails when loading unknown aliases
  uri = "/users/alias/email/#{EXISTING_USER.email}"
  td.when(jsonClient.get(td.matchers.contains path: uri))
    .thenCallback null, null, status(200),
      id: EXISTING_USER.id
      aliases: directoryAliasesObj EXISTING_USER

  # loads existing user by alias

  jsonClient

baseTest = ->
  callback = td.function 'callback'
  jsonClient = jsonClientTD()
  log = td.object [ 'info', 'warn', 'error' ]
  # log = require '../src/log'
  directoryClient = directoryClientMod.createClient {
    log, jsonClient, apiSecret:API_SECRET }

  { directoryClient, jsonClient, callback }

describe 'directory-data', ->
  it 'provides test data', ->
    expect(findAlias "email", EXISTING_USER).to.eql
      type: "email"
      value: EXISTING_USER.email
      public: false
    expect(directoryAliasesObj EXISTING_USER).to.eql
      name: EXISTING_USER.username
      tag: tagizer(EXISTING_USER.username)

describe 'directory-client', ->

  describe '.authenticate()', ->

    authenticate = (creds) ->
      ret = baseTest()
      ret.directoryClient.authenticate creds, ret.callback
      ret

    it 'sends a POST request to /directory/v1/users/auth with credentials', ->
      { jsonClient } = authenticate CREDS
      td.verify jsonClient.post(
        td.matchers.contains(path: '/users/auth'),
        CREDS, td.callback)

    it 'reports failure when response status is not 200', ->
      { callback } = authenticate WRONG_CREDS
      td.verify callback td.matchers.isA(Error)

    it 'returns the generated token when response status is 200', ->
      { callback } = authenticate CREDS
      td.verify callback null, td.matchers.contains(authResult EXISTING_USER)

  describe '.byAlias()', ->

    byAlias = (alias) ->
      ret = baseTest()
      ret.directoryClient.byAlias alias, ret.callback
      ret

    it 'GET data from /directory/v1/users/alias/:type/:value', ->
      alias = findAlias "email", EXISTING_USER
      { jsonClient } = byAlias alias

      uri = "/users/alias/#{alias.type}/#{alias.value}"
      td.verify jsonClient.get(
        td.matchers.contains(path: uri),
        td.callback)

    it 'reports failure if alias is unknown', ->
      { callback } = byAlias findAlias "email", NEW_USER
      td.verify callback td.matchers.isA Error

    it 'provides the account to the callback if exists', ->
      { callback } = byAlias findAlias "email", EXISTING_USER
      td.verify callback(null, td.matchers.contains
        id: EXISTING_USER.id
        aliases: directoryAliasesObj EXISTING_USER)

  describe '.addAccount()', ->

    addAccount = (account) ->
      ret = baseTest()
      ret.directoryClient.addAccount account, ret.callback
      ret

    it 'requires credentials as argument', ->
      { callback } = addAccount null
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)

    it 'requires an argument with id and password fields', ->
      { callback } = addAccount {}
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)
      { callback } = addAccount {id:CREDS.id}
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)
      { callback } = addAccount {password:CREDS.password}
      td.verify callback(
        td.matchers.isA restify.InvalidContentError)

    it 'reports success', ->
      { callback } = addAccount directoryAccount(NEW_USER)
      td.verify callback(null, id:NEW_USER.id)

    it 'sends a POST request to /directory/v1/users', ->
      { jsonClient } = addAccount directoryAccount(NEW_USER)
      td.verify jsonClient.post(
        td.matchers.contains(path: '/users'),
        td.matchers.contains(ADD_ACCOUNT), td.callback)

    it 'reports failure when response status is not 200', ->
      { callback } = addAccount directoryAccount(EXISTING_USER)
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

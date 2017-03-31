authentication = require '../src/authentication'
{expect} = require 'chai'
td = require 'testdouble'

USERNAME = 'jeko'
EMAIL = 'jeko@email.com'
TOKEN = 'my-token'
TIMESTAMP = '12345'

createTestable = ->

  genToken = td.function 'genToken'
  td.when(genToken()).thenReturn TOKEN

  timestamp = td.function 'timestamp'
  td.when(timestamp()).thenReturn TIMESTAMP

  authdbClient = td.object [ 'addAccount' ]

  localUsermetaClient = td.object [ 'set' ]
  centralUsermetaClient = td.object [ 'set' ]

  authenticator = authentication.createAuthenticator {
    authdbClient, localUsermetaClient, centralUsermetaClient,
    genToken, timestamp }

  { authdbClient, localUsermetaClient, centralUsermetaClient, authenticator }

describe 'authentication', ->

  describe '.createAuthenticator()', ->
    it 'returns a authenticator', ->
      expect(authentication.createAuthenticator {}).to.be.ok

  describe 'authenticator.add()', ->
    it 'adds the user to authdb', ->
      { authdbClient, centralUsermetaClient, authenticator, localUsermetaClient,
      } = createTestable()
      ret = authenticator.add
        username: USERNAME
        email: EMAIL
      expect(ret).to.eql
        username: USERNAME
        email: EMAIL
        token: TOKEN
      td.verify authdbClient.addAccount TOKEN,
        username: USERNAME
        email: EMAIL
      , td.callback()
      td.verify localUsermetaClient.set(
        td.matchers.contains({
          username: USERNAME, apiSecret: process.env.API_SECRET}),
        'auth',
        TIMESTAMP,
        td.matchers.isA(Function))
      td.verify centralUsermetaClient.set(
        td.matchers.contains({
          username: USERNAME, apiSecret: process.env.API_SECRET}),
        'auth', TIMESTAMP,
        td.matchers.isA(Function))

  describe.skip 'authenticator.updateAuthMetadata()', ->
  describe.skip 'authenticator.getAuthMetadata()', ->

# vim: ts=2:sw=2:et:

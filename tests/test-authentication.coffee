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

  usermetaClient = td.object [ 'set' ]

  authenticator = authentication.createAuthenticator {
    authdbClient, usermetaClient, genToken, timestamp }

  { authdbClient, usermetaClient, authenticator }

describe 'authentication', ->

  describe '.createAuthenticator()', ->
    it 'returns a authenticator', ->
      expect(authentication.createAuthenticator {}).to.be.ok

  describe 'authenticator.add()', ->
    it 'adds the user to authdb', ->
      { authdbClient, usermetaClient, authenticator
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
      td.verify usermetaClient.set USERNAME, 'auth', TIMESTAMP,
        td.matchers.isA(Function)

# vim: ts=2:sw=2:et:

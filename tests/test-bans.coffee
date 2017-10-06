async = require 'async'
{expect} = require 'chai'
{BanInfo, Bans} = require '../src/bans'
td = require 'testdouble'

describe 'BanInfo', () ->
  username = 'someone'

  describe 'Existing ban', () ->
    now = Date.now()
    ban = new BanInfo(username, now)

    it 'contains #username', () ->
      expect(ban.username).to.equal(username)

    it '#createdAt has creation timestamp', () ->
      expect(ban.createdAt).to.equal(now)

    it '#exists is true', () ->
      expect(ban.exists).to.be.true

  describe 'Non-existing ban', () ->
    ban = new BanInfo(username, null)

    it 'contains #username', () ->
      expect(ban.username).to.equal(username)

    it '#createdAt is null', () ->
      expect(ban.createdAt).to.equal(0)

    it '#exists returns false', () ->
      expect(ban.exists).to.be.false

describe 'Bans', () ->

  usermetaClient = null
  bans = null

  beforeEach ->
    usermetaClient = td.object ['get', 'set']
    td.when(usermetaClient.set(
      td.matchers.anything(),
      td.matchers.anything(),
      td.matchers.anything()))
        .thenCallback null, null
    td.when(usermetaClient.get(
      td.matchers.anything(), td.matchers.anything()))
        .thenCallback null, null

    bans = new Bans({usermetaClient})

  started = Date.now()
  params = {
    banned: {username: 'bad-person', apiSecret: 'wever'},
    notBanned: {username: 'good-citizen', apiSecret: 'wever'}
  }

  describe '#ban()', () ->
    it 'adds bans', (done) ->
      bans.ban params.banned, (err) ->
        expect(err).to.be.null
        td.verify usermetaClient.set(
          params.banned, '$banned', td.matchers.anything(),
          td.callback)
        done()

  describe '#get()', () ->
    it 'returns BanInfo instances', (done) ->
      bans.get params.banned.username, (err, info) ->
        expect(err).to.be.null
        expect(info).to.be.instanceof(BanInfo)
        done()

    it.skip 'results are correct', (done) ->
      async.mapValues(
        params,
        (username, key, cb) -> bans.get(params.username, cb),
        (err, infos) ->
          expect(err).to.be.null
          expect(infos.banned.username).to.equal(params.banned.username)
          expect(infos.banned.exists).to.be.true
          expect(infos.notBanned.username).to.equal(params.notBanned.username)
          expect(infos.notBanned.exists).to.be.false
          done()
      )

  describe.skip '#unban()', () ->
    it 'removes existing bans', (done) ->
      bans.unban params.banned.username, (err) ->
        expect(err).to.be.null

        client.exists "bans:#{params.banned.username}", (err, reply) ->
          expect(err).to.be.null
          expect(reply).to.be.equal(0)
          done()

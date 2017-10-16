async = require 'async'
{expect} = require 'chai'
{BanInfo, Bans} = require '../src/bans'
td = require 'testdouble'

describe 'BanInfo', () ->
  username = 'someone'

  describe 'Existing ban', () ->
    it 'timestamps means ban exists', () ->
      info = new BanInfo(username, Date.now())
      expect(info.exists).to.be.true

    it 'existent bans have correct props', () ->
      now = Date.now()
      expect(new BanInfo(username, String(now))).to.eql({
        username,
        exists: true,
        createdAt: now
      })

  describe 'Non-existing ban', () ->
    it '<null> means no ban', () ->
      expect(new BanInfo(username, null).exists).to.be.false

    it 'non-timestamp string means no ban', () ->
      expect(new BanInfo(username, '').exists).to.be.false
      expect(new BanInfo(username, '<no>').exists).to.be.false
      expect(new BanInfo(username, '123').exists).to.be.false

    it 'non existent ban has correct fields', () ->
      expect(new BanInfo(username, null)).to.eql({
        username,
        createdAt: 0,
        exists: false
      })

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

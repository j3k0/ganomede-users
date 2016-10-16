async = require 'async'
redis = require 'redis'
{expect} = require 'chai'
{BanInfo, Bans} = require '../src/bans'

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
  client = redis.createClient()
  bans = new Bans({redis: client})
  started = Date.now()
  usernames = {
    banned: 'bad-person',
    notBanned: 'good-citizen'
  }

  after (done) -> async.series([
    (cb) -> client.flushdb(cb),
    (cb) -> client.quit(cb)
  ], done)

  describe '#ban()', () ->
    it 'adds bans', (done) ->
      bans.ban usernames.banned, (err) ->
        expect(err).to.be.null

        client.get "bans:#{usernames.banned}", (err, reply) ->
          expect(err).to.be.null
          expect(reply).to.be.within(started, Date.now())
          done()

  describe '#get()', () ->
    it 'returns BanInfo instances', (done) ->
      bans.get usernames.banned, (err, info) ->
        expect(err).to.be.null
        expect(info).to.be.instanceof(BanInfo)
        done()

    it 'results are correct', (done) ->
      async.mapValues(
        usernames,
        (username, key, cb) -> bans.get(username, cb),
        (err, infos) ->
          expect(err).to.be.null
          expect(infos.banned.username).to.equal(usernames.banned)
          expect(infos.banned.exists).to.be.true
          expect(infos.notBanned.username).to.equal(usernames.notBanned)
          expect(infos.notBanned.exists).to.be.false
          done()
      )

  describe '#unban()', () ->
    it 'removes existing bans', (done) ->
      bans.unban usernames.banned, (err) ->
        expect(err).to.be.null

        client.exists "bans:#{usernames.banned}", (err, reply) ->
          expect(err).to.be.null
          expect(reply).to.be.equal(0)
          done()

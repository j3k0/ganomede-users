/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// import async from 'async';
import { expect } from 'chai';
import { BanInfo, Bans } from '../src/bans';
import td from 'testdouble';


const params = {
  banned: {username: 'bad-person', apiSecret: 'wever'},
  notBanned: {username: 'good-citizen', apiSecret: 'wever'},
  multiBannedChecked: {usernames:['bad-person','good-citizen' ], apiSecret: 'wever'}
};

describe('BanInfo', function() {
  const username = 'someone';

  describe('Existing ban', function() {
    it('timestamps means ban exists', function() {
      const info = new BanInfo(username, Date.now());
      return expect(info.exists).to.be.true;
    });

    return it('existent bans have correct props', function() {
      const now = Date.now();
      return expect(new BanInfo(username, String(now))).to.eql({
        username,
        exists: true,
        createdAt: now
      });
    });
  });

  return describe('Non-existing ban', function() {
    it('<null> means no ban', () => expect(new BanInfo(username, null).exists).to.be.false);

    it('non-timestamp string means no ban', function() {
      expect(new BanInfo(username, '').exists).to.be.false;
      expect(new BanInfo(username, '<no>').exists).to.be.false;
      return expect(new BanInfo(username, '123').exists).to.be.false;
    });

    return it('non existent ban has correct fields', () => expect(new BanInfo(username, null)).to.eql({
      username,
      createdAt: 0,
      exists: false
    }));
  });
});

describe('Bans', function() {

  let usermetaClient: any = null;
  let bans: any = null;

  beforeEach(function() {
    usermetaClient = td.object(['get', 'set', 'getBulk']);
    td.when(usermetaClient.set(
      td.matchers.anything(),
      td.matchers.anything(),
      td.matchers.anything()))
        .thenCallback(null, null);
    td.when(usermetaClient.get(
      td.matchers.anything(), td.matchers.anything()))
        .thenCallback(null, null);

        td.when(usermetaClient.getBulk(
          td.matchers.anything(), td.matchers.anything()))
            .thenCallback(null, [{username:params.multiBannedChecked.usernames[0]}, {username:params.multiBannedChecked.usernames[1]}]);

    return bans = new Bans({usermetaClient});
  });

  // const started = Date.now();
 

  describe('#ban()', () => it('adds bans', done => bans.ban(params.banned, function(err) {
    expect(err).to.be.null;
    td.verify(usermetaClient.set(
      params.banned, '$banned', td.matchers.anything(),
      td.callback)
    );
    return done();
  })));

  describe('#get()', function() {
    it('returns BanInfo instances', done => bans.get(params.banned.username, function(err, info) {
      expect(err).to.be.null; 
      expect(info).to.be.instanceof(BanInfo);
      return done();
    }));

    /* return it.skip('results are correct', done => async.mapValues(
      params,
      (username, key, cb) => bans.get(params.username, cb),
      function(err, infos) {
        expect(err).to.be.null;
        expect(infos.banned.username).to.equal(params.banned.username);
        expect(infos.banned.exists).to.be.true;
        expect(infos.notBanned.username).to.equal(params.notBanned.username);
        expect(infos.notBanned.exists).to.be.false;
        return done();
    })); */
  });

  describe('#getbulk()', function() {
    it('returns Multi BanInfo instances', done => bans.getBulk(params.multiBannedChecked, function(err, info) {
      expect(err).to.be.null; 
      expect(info).to.be.instanceof(Object);
      expect(info[params.multiBannedChecked.usernames[0]]).to.be.instanceof(BanInfo);
      return done();
    }));
 
  });

  // return describe.skip('#unban()', () => it('removes existing bans', done => bans.unban(params.banned.username, function(err) {
  //   expect(err).to.be.null;

  //   return client.exists(`bans:${params.banned.username}`, function(err, reply) {
  //     expect(err).to.be.null;
  //     expect(reply).to.be.equal(0);
  //     return done();
  //   });
  // })));
});

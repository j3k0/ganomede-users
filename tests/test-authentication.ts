/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import authentication from '../src/authentication';
import { expect } from 'chai';
import td from 'testdouble';

const USERNAME = 'jeko';
const EMAIL = 'jeko@email.com';
const TOKEN = 'my-token';
const TIMESTAMP = '12345';

const createTestable = function() {

  const genToken = td.function('genToken');
  td.when(genToken()).thenReturn(TOKEN);

  const timestamp = td.function('timestamp');
  td.when(timestamp()).thenReturn(TIMESTAMP);

  const authdbClient = td.object([ 'addAccount' ]);

  const localUsermetaClient = td.object([ 'set' ]);
  const centralUsermetaClient = td.object([ 'set' ]);

  const authenticator = authentication.createAuthenticator({
    authdbClient, localUsermetaClient, centralUsermetaClient,
    genToken, timestamp });

  return { authdbClient, localUsermetaClient, centralUsermetaClient, authenticator };
};

describe('authentication', function() {

  describe('.createAuthenticator()', () => it('returns a authenticator', () => expect(authentication.createAuthenticator({})).to.be.ok));

  describe('authenticator.add()', () => it('adds the user to authdb', function() {
    const { authdbClient, centralUsermetaClient, authenticator, localUsermetaClient,
    } = createTestable();
    const ret = authenticator.add({
      username: USERNAME,
      email: EMAIL
    });
    expect(ret).to.eql({
      username: USERNAME,
      email: EMAIL,
      token: TOKEN
    });
    td.verify(authdbClient.addAccount(TOKEN, {
      username: USERNAME,
      email: EMAIL
    }
    , td.callback())
    );
    td.verify(localUsermetaClient.set(
      td.matchers.contains({
        username: USERNAME, apiSecret: process.env.API_SECRET}),
      'auth',
      TIMESTAMP,
      td.matchers.isA(Function))
    );
    return td.verify(centralUsermetaClient.set(
      td.matchers.contains({
        username: USERNAME, apiSecret: process.env.API_SECRET}),
      'auth', TIMESTAMP,
      td.matchers.isA(Function))
    );
  }));

  describe.skip('authenticator.updateAuthMetadata()', function() {});
  return describe.skip('authenticator.getAuthMetadata()', function() {});
});

// vim: ts=2:sw=2:et:

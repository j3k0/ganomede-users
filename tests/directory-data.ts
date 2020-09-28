/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import _ from 'lodash';
import tagizer from 'ganomede-tagizer';
const picker = fields => obj => _.pick(obj, fields);

const defaultExport = {};

var that = (defaultExport = {

APP_ID: "cc.fovea.test",

credentials:   picker([ 'username', 'password' ]),
publicAccount: picker([ 'username', 'email' ]),
authResult:    picker([ 'token' ]),
account:       picker([ 'username', 'email', 'password' ]),
authAccount:   picker([ 'username', 'email', 'token' ]),
facebookAccount: picker([
  'username', 'password', 'facebookId', 'accessToken' ]),
directoryAccount: picker([ 'id', 'password' ]),
directoryAliases(account) {
  const ret = [];
  if (account.facebook_id) {
    ret.push({
      type: `facebook.id.${that.APP_ID}`,
      value: account.facebook_id,
      public: false
    });
  }
  if (account.email) {
    ret.push({
      type: "email",
      value: account.email,
      public: false
    });
  }
  if (account.username) {
    ret.push({
      type: "name",
      value: account.username,
      public: true
    });
    ret.push({
      type: "tag",
      value: tagizer.tag(account.username),
      public: true
    });
  }
  return ret;
},
findAlias(type, account) {
  return that.directoryAliases(account).filter(a => a.type === type)[0];
},
directoryAliasesObj(account) {
  return that.directoryAliases(account).reduce(function(acc, obj) {
    if (obj.public) {
      acc[obj.type] = obj.value;
    }
    return acc;
  }
  , {});
},
facebookLogin(account) {
  return {
    accessToken: account.facebook_access_token,
    username: account.username,
    password: account.password
  };
},

API_SECRET: 'my-very-secret',

EXISTING_USER: {
  id: 'ex1sTING',
  username: 'ex1sTING',
  email: 'user@email.com',
  password: '123456',
  token: 'auth-token',
  facebook_id: '1000',
  facebook_access_token: 'access-token',
  fullName: "Existing User",
  birthday: '21/09/2010'
},

SECONDARY_USER: {
  id: 's3cdary',
  username: 's3cdary',
  email: 'other@email.com',
  password: '654321',
  token: 'token-auth',
  facebook_id: '2000',
  facebook_access_token: 'secondary-access-token',
  fullName: "Secondary User",
  birthday: '01/01/1940'
},

TERNARY_USER: {
  id: 't3rnary',
  username: 't3rnary',
  email: 'third@email.com',
  password: '123456',
  token: 'token3-auth',
  facebook_id: '3000',
  facebook_access_token: 'ternary-access-token',
  fullName: "Ternary User",
  birthday: '01/05/1933'
},

NEW_USER: {
  id: '1newUser',
  username: '1newUser',
  password: '12345678',
  email: 'newuser@email.com',
  token: 'token-auth-new',
  facebook_id: '3000',
  facebook_access_token: 'new-access-token',
  fullName: "New User",
  birthday: '24/12/2000',
  location: {
    id: "kj12345",
    location: {
      country_code: "fr",
      latitude: 12.34,
      longitude: 55.1
    }
  }
}
});
// vim: ts=2:sw=2:et:
export default defaultExport;

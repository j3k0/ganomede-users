import * as _ from 'lodash';
import * as tagizer from 'ganomede-tagizer';
import { v4 as uuidv4 } from 'uuid';

const picker = fields => obj => _.pick(obj, fields);

interface DirectoryAlias {
  type: string;
  value: string;
  public: boolean;
}

const directoryData = {};

export const APP_ID = "cc.fovea.test";

export const credentials = picker([ 'username', 'password' ]);
export const publicAccount = picker([ 'username', 'email' ]);
export const authResult = picker([ 'token' ]);
export const account = picker([ 'username', 'email', 'password' ]);
export const authAccount = picker([ 'username', 'email', 'token' ]);
export const facebookAccount = picker([
  'username', 'password', 'facebookId', 'accessToken' ]);
export const directoryAccount = picker([ 'id', 'password' ]);

export function directoryAliases(account) {
  const ret: DirectoryAlias[] = [];
  if (account.facebook_id) {
    ret.push({
      type: `facebook.id.${APP_ID}`,
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
}

export function findAlias(type, account) {
  return directoryAliases(account).filter(a => a.type === type)[0];
}

export function directoryAliasesObj(account) {
  return directoryAliases(account).reduce(function(acc, obj) {
    if (obj.public) {
      acc[obj.type] = obj.value;
    }
    return acc;
  }
  , {});
}

export function facebookLogin(account) {
  return {
    accessToken: account.facebook_access_token,
    username: account.username,
    password: account.password
  };
}

export const API_SECRET = 'my-very-secret';

export const EXISTING_USER = {
  id: 'ex1sTING',
  username: 'ex1sTING',
  email: 'user@email.com',
  password: '123456',
  token: 'auth-token',
  facebook_id: '1000',
  facebook_access_token: 'access-token',
  fullName: "Existing User",
  birthday: '21/09/2010'
};

export const SECONDARY_USER = {
  id: 's3cdary',
  username: 's3cdary',
  email: 'other@email.com',
  password: '654321',
  token: 'token-auth',
  facebook_id: '2000',
  facebook_access_token: 'secondary-access-token',
  fullName: "Secondary User",
  birthday: '01/01/1940'
};

export const TERNARY_USER = {
  id: 't3rnary',
  username: 't3rnary',
  email: 'third@email.com',
  password: '123456',
  token: 'token3-auth',
  facebook_id: '3000',
  facebook_access_token: 'ternary-access-token',
  fullName: "Ternary User",
  birthday: '01/05/1933'
};

export const NEW_USER = {
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
};

export const randomUser = () => {
  const ret = {...NEW_USER};
  const rand = uuidv4();
  ret.id = rand;
  ret.username = rand;
  ret.email = `${ret.username}@email.com`
  ret.token = `tok-${ret.id}`;
  ret.facebook_id = `id-${rand.slice(0,12)}`;
  ret.facebook_access_token = `fbtok-${rand.slice(0,12)}`;
  ret.fullName = `Random User ${rand.slice(0,6)}`;
  return ret;
}

export default directoryData;
// vim: ts=2:sw=2:et:

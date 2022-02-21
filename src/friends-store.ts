/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import Logger from 'bunyan';
import logMod from './log';
import { UsermetaClient, UsermetaClientSingleOptions } from './usermeta';

 const uniq = function(a:string[]) {
  const has = {};
  return a.filter(function(item) {
    if (has.hasOwnProperty(item)) {
      return false;
    } else {
      return has[item] = true;
    }
  });
};

export interface FriendsStoreOptions {
  log?: Logger;
  keyName?: string;
  maxFriends?: number;
  usermetaClient: UsermetaClient;
}

export interface FriendsClient {
  add(account: string | UsermetaClientSingleOptions, newFriends: string[], cb: FriendsClientCallback);
  del(account: string | UsermetaClientSingleOptions, removeFriend: string, cb: FriendsClientCallback);
  get(account: string | UsermetaClientSingleOptions, cb: FriendsClientCallback);
  set(account: string | UsermetaClientSingleOptions, friends: string[], cb: FriendsClientCallback);
}

export type FriendsClientCallback = (err?: any, friends?: string[] | null) => void;

const createStore = function(options: FriendsStoreOptions): FriendsClient {

  let log;
  if (options.log) {
    ({
      log
    } = options);
  } else {
    log = logMod.child({module:"friends-store"});
  }

  // Constants
  const KEY_NAME = options.keyName || "$friends";
  const MAX_FRIENDS = options.maxFriends || 1000;

  // Usermeta
  const {
    usermetaClient
  } = options;
  if (!usermetaClient) {
    throw new Error("usermetaClient not defined");
  }

  if ('validKeys' in usermetaClient && usermetaClient.validKeys && !usermetaClient.isValid(KEY_NAME)) {
    usermetaClient.validKeys[KEY_NAME] = true;
  }

  // Empty set, prevent creating empty arrays all the time
  const EMPTY_SET = [];
  const SEPARATOR = ",";

  log.info("Initialized", {
    keyName: KEY_NAME,
    maxFriends: MAX_FRIENDS,
    separator: SEPARATOR
  }
  );

  return {
    // Retrieve account friends
    get(account, cb) {
      const done = function(err, result) {
        if (result) {
          cb(err, result.split(SEPARATOR));
        } else {
          cb(err, EMPTY_SET);
        }
      };
      usermetaClient.get(account, KEY_NAME, done);
    },

    // Save the account friends
    set(account, friends, cb) {
      friends = friends.splice(0, MAX_FRIENDS);
      usermetaClient.set(account, KEY_NAME, friends.join(SEPARATOR), (err, result) => {
        log.info({friends, result: result && JSON.stringify(result), err}, 'Save friends.');
        cb(err, (typeof result?.split === 'function' && result?.split(SEPARATOR)) || []);
      }, 0);
    },

    // Add a friend
    add(account, newFriends, cb) {

      if (typeof newFriends === "string") {
        return this.add(account, [ newFriends ], cb);
      }

      this.get(account, (err, friends) => {
        if (err) {
          return cb(err);
        }
        if (!friends || friends === EMPTY_SET) {
          friends = newFriends;
        } else {
          friends = friends.concat(newFriends);
        }
        this.set(account, uniq(friends), cb);
      });
    },

    del(account, removeFriend, cb) {

      this.get(account, (err, friends) => {
        if (err) {
          return cb(err);
        }
        if (!friends || friends === EMPTY_SET) {
          friends = [];
        }
        friends = friends.filter(f => f !== removeFriend);
        this.set(account, uniq(friends), cb);
      });
    }

  };
};

export default {createClient: createStore};

// vim: ts=2:sw=2:et:

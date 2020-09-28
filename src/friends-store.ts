/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const uniq = function(a) {
  const has = {};
  return a.filter(function(item) {
    if (has.hasOwnProperty(item)) {
      return false;
    } else {
      return has[item] = true;
    }
  });
};

const createStore = function(options) {

  let log;
  if (options.log) {
    ({
      log
    } = options);
  } else {
    log = require("./log").child({module:"friends-store"});
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

  if (usermetaClient.validKeys && !usermetaClient.isValid(KEY_NAME)) {
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
          return cb(err, result.split(SEPARATOR));
        } else {
          return cb(err, EMPTY_SET);
        }
      };
      return usermetaClient.get(account, KEY_NAME, done);
    },

    // Save the account friends
    set(account, friends, cb) {
      friends = friends.splice(0, MAX_FRIENDS);
      return usermetaClient.set(account, KEY_NAME, friends.join(SEPARATOR), cb, 0);
    },

    // Add a friend
    add(account, newFriends, cb) {

      if (typeof newFriends === "string") {
        return this.add(account, [ newFriends ], cb);
      }

      return this.get(account, (err, friends) => {
        if (err) {
          return cb(err);
        }
        if (friends === EMPTY_SET) {
          friends = newFriends;
        } else {
          friends = friends.concat(newFriends);
        }
        return this.set(account, uniq(friends), cb);
      });
    }
  };
};

export default {createClient: createStore};

// vim: ts=2:sw=2:et:

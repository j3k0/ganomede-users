/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import vasync from 'vasync';
import logDefault from "./log";

const storeFriends = function(options) {

  const {
    username,
    aliasesClient,
    friendsClient,
    facebookClient,
    accessToken,
    callback
  } = options;
  const rootLog = options.rootLog || logDefault;
  const log = options.log || rootLog.child({module:"facebook-friends"});
  const apiSecret = options.apiSecret || process.env.API_SECRET;

  // Retrive usernames using aliases
  const retrieveUsernames = function(fbFriends, cb) {
    const usernames: string[] = [];
    return vasync.forEachParallel({
      func(fbFriend, done: () => void) {
        return aliasesClient.get(`fb:${fbFriend.id}`, function(err, value) {
          if (value) {
            usernames.push(value);
          }
          return done();
        });
      },
      inputs: fbFriends
    }
    , function(err, results) {
      if (err) {
        log.error("Failed to retrieve friends usernames.");
      }
      return cb(null, usernames);
    });
  };

  // Store the list of facebook friends
  const store = function() {

    let friends = null;

    return vasync.waterfall([

      // Get friends from facebook
      function(cb) {
        log.info("get friends from facebook");
        return facebookClient.getFriends(accessToken, cb);
      },
      
      // Retrieve their in-game usernames
      function(friends, cb) {
        log.info("get friends usernames");
        log.info(friends);
        return retrieveUsernames(friends, cb);
      },
      
      // Add them as game friends forever (GFF)
      function(names, cb) {
        friends = names;
        log.info("add them as friends");
        return friendsClient.add({username, apiSecret}, names, cb);
      }
    ],
    (err, result) => callback(err, friends));
  };

  return store();
};

export default {storeFriends};

// vim: ts=2:sw=2:et:

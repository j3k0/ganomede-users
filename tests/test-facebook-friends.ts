/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import { expect } from 'chai';
import facebookFriends from "../src/facebook-friends";

describe("facebook-friends", function() {

  let aliasesClient: any = null;
  let facebookClient: any = null;
  let friendsClient: any = null;

  beforeEach(function() {
    aliasesClient = {
      get(key, callback) {
        const ALIASES = {
          "fb:1": "sousou",
          "fb:2": "willy",
          "fb:3": "hussein",
          "fb:4": "alexey"
        };
        return callback(null, ALIASES[key]);
      }
    };

    facebookClient = {
      getFriends(accessToken, callback) {
        return callback(null, [{
          id: 1,
          name: "Souad"
        }, {
          id: 2,
          name: "Wilbert"
        }, {
          id: 3,
          name: "Hussein"
        }]);
      }
    };

    return friendsClient = {
      add(username, friends, callback) {
        return callback(null, {ok:true});
      }
    };
  });

  const storeFriends = options => facebookFriends.storeFriends({
    username: options.username || "jeko",
    aliasesClient: options.aliasesClient || aliasesClient,
    friendsClient: options.friendsClient || friendsClient,
    facebookClient: options.facebookClient || facebookClient,
    accessToken: options.accessToken || "whatever",
    callback: options.callback
  });

  describe("storeFriends", function() {
    it("store friends", function(done) {
      const myFriendsClient = {
        add(username, friends, callback) {
          expect(username).to.eql({
            username: "jeko",
            apiSecret: process.env.API_SECRET
          });
          assert.equal(3, friends.length);
          return callback(null, {ok:true});
        }
      };

      storeFriends({
        friendsClient: myFriendsClient,
        callback(err, friends) {
          assert.ok(!err);
          assert.equal(3, friends.length);
          assert.equal("sousou", friends[0]);
          assert.equal("willy", friends[1]);
          assert.equal("hussein", friends[2]);
          return done();
        }
      });
    })
  });
});

// vim: ts=2:sw=2:et:

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import log from "./log";
import restifyClients from "restify-clients";

export class FacebookClient {

  log: any;
  fbgraphClient: any;

  constructor(options) {
    if (options == null) { options = {}; }
    this.log = options.log || log.child({module:"facebook"});
    this.fbgraphClient = options.fbgraphClient || restifyClients.createJsonClient({
      url: "https://graph.facebook.com",
      version: '*'
    });
  }

  private _getFriendsPage(accessToken, uri, list, cb) {
    uri = `${uri}&access_token=${accessToken}`;
    return this.fbgraphClient.get(uri, (err, req, res, result) => {

      // Add new friends to the list
      if (result != null ? result.data : undefined) {
        for (let friend of Array.from(result.data)) {
          list.push(friend);
        }
      }

      // Go to the next page, if any
      if (__guard__(result != null ? result.paging : undefined, x => x.next)) {
        return this._getFriendsPage(accessToken, result.paging.next, list, cb);
      } else {
        return cb(err, list);
      }
    });
  }

  getFriends(accessToken, cb) {
    return this._getFriendsPage(accessToken, "/me/friends?limit=50", [], (err, list) => {
      if (err) {
        this.log.error("Failed to retrieve friends", err);
      }
      return cb(err, list);
    });
  }
}

export default {
  createClient(options) {
    if (options == null) { options = {}; }
    return new FacebookClient(options);
  }
};

// vim: ts=2:sw=2:et:

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}
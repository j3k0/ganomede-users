/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import log from "./log";
import restify from "restify";

class Api {

  constructor(options) {

    if (options == null) { options = {}; }
    this.options = options || {};
    this.authMiddleware = this.options.authMiddleware;
    this.friendsClient = this.options.friendsClient;
    this.log = options.log || log.child({module: "friends-api"});
  }

  addRoutes(prefix, server) {

    const endpoint = `/${prefix}/auth/:authToken/friends`;
    server.post(endpoint, this.authMiddleware, this.post.bind(this));
    return server.get(endpoint, this.authMiddleware, this.get.bind(this));
  }

  get(req, res, next) {

    const username = req.params.user != null ? req.params.user.username : undefined;
    const params = {
      log: req.log,
      req_id: req.id(),
      username,
      authToken: req.params.authToken || req.context.authToken,
      apiSecret: req.params.apiSecret
    };

    return this.friendsClient.get(params, (err, friends) => {
      if (err) {
        this.log.error({
          message: "friendsClient.get",
          err,
          reply: friends
        });
        return next(err);
      }

      res.send(friends);
      return next();
    });
  }

  isValidList(friends) {
    return (
      (typeof friends === 'object') &&
      (friends.length > 0) &&
      (typeof friends[0] === "string")
    );
  }

  post(req, res, next) {

    // Retrieve input parameters
    const username = req.params.user != null ? req.params.user.username : undefined;
    const friends = req.body;

    // Check parameters validity
    if (!this.isValidList(friends)) {
      const err = new restify.InvalidContentError("invalid content");
      return next(err);
    }

    const params = {
      log: req.log,
      req_id: req.id(),
      username,
      authToken: req.params.authToken || req.context.authToken,
      apiSecret: req.params.apiSecret
    };

    // Store
    return this.friendsClient.add(params, friends, (err, friends) => {

      if (err) {
        this.log.error({
          message: "friendsClient.add",
          err,
          reply: friends
        });
        return next(err);
      }
      res.send({ok:!err});
      return next();
    });
  }
}

export default {createApi(options) { return new Api(options); }};

// vim: ts=2:sw=2:et:

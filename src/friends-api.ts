import log from "./log";
import restifyErrors from "restify-errors";
import restify from "restify";
import { FriendsClient } from "./friends-store";
import { UsermetaClientOptions } from "./usermeta";

export class FriendsApi {

  options: any;
  authMiddleware: any;
  friendsClient: FriendsClient;
  log: any;

  constructor(options) {

    if (options == null) { options = {}; }
    this.options = options || {};
    this.authMiddleware = this.options.authMiddleware;
    this.friendsClient = this.options.friendsClient;
    this.log = options.log || log.child({module: "friends-api"});
  }

  addRoutes(prefix:string, server:restify.Server) {

    const endpoint = `/${prefix}/auth/:authToken/friends`;
    server.post(endpoint, this.authMiddleware, this.post.bind(this));
    server.get(endpoint, this.authMiddleware, this.get.bind(this));
    server.del(endpoint + '/:id', this.authMiddleware, this.del.bind(this));
  }

  get(req:restify.Request, res:restify.Response, next:restify.Next) {

    const username = req.params.user != null ? req.params.user.username : undefined;
    const params:UsermetaClientOptions = {
      log: req.log,
      req_id: req.id(),
      username,
      authToken: req.params.authToken || (req as any).context.authToken,
      apiSecret: req.params.apiSecret
    };

    this.friendsClient.get(params, (err, friends) => {
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
      Array.isArray(friends) &&
      (friends.length > 0) &&
      (typeof friends[0] === "string")
    );
  }

  del(req:restify.Request, res:restify.Response, next:restify.Next) {
    const username: string | undefined | null = req.params?.user?.username;
    const target: string | undefined | null = req.params?.id;
    if (!username || !target) {
      return next(new restifyErrors.BadRequestError("No username or no target to remove from friends"));
    }
    const params:UsermetaClientOptions = {
      log: req.log,
      req_id: req.id(),
      username,
      authToken: req.params.authToken || (req as any).context.authToken,
      apiSecret: req.params.apiSecret
    };
    this.friendsClient.del(params, target, (err, friends) => {
      if (err) {
        this.log.error({
          message: "friendsClient.del",
          err,
          reply: friends
        });
        return next(err);
      }
      res.json({ ok: true });
      next();
    });
  }

  post(req:restify.Request, res:restify.Response, next:restify.Next) {

    // Retrieve input parameters
    const username = req.params?.user?.username;
    const friends: string[] = req.body;

    // Check parameters validity
    if (!this.isValidList(friends)) {
      const err = new restifyErrors.InvalidContentError("invalid content");
      return next(err);
    }

    const params:UsermetaClientOptions = {
      log: req.log,
      req_id: req.id(),
      username,
      authToken: req.params.authToken || (req as any).context.authToken,
      apiSecret: req.params.apiSecret
    };

    // Store
    this.friendsClient.add(params, friends, (err, friends: undefined | null | string[]) => {

      if (err) {
        this.log.error({
          message: "friendsClient.add",
          err,
          reply: friends
        });
        return next(err);
      }
      res.send({ok:true});
      next();
    });
  }
}

export default {
  createApi(options) {
    return new FriendsApi(options);
  }
};

// vim: ts=2:sw=2:et:

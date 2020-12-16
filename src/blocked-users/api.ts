import Logger from "bunyan";
import restify from "restify";
import restifyErrors from "restify-errors";
import { RequestHandler, Request, Response, Next } from "restify";

import log from "../log";
import { UsermetaClient, UsermetaClientOptions } from "../usermeta";
import { DirectoryClient } from "../directory-client";
import parseTagMod from '../middlewares/mw-parse-tag';
import { EventSender } from "../event-sender";
import { BLOCKED, UNBLOCKED, CHANNEL, eventData, BlockedUserEventType, REPORTED } from "./events";
import config from "../config";

export interface BlockedUsersApiOptions {
  log?: Logger;
  authMiddleware: RequestHandler;
  directoryClient: DirectoryClient;
  usermetaClient: UsermetaClient;
  sendEvent: EventSender;
}

export const META_KEY:string = '$blocked';

export class BlockedUsersApi {

  options: BlockedUsersApiOptions;
  authMiddleware: RequestHandler;
  usermetaClient: UsermetaClient;
  directoryClient: DirectoryClient;
  log: Logger;
  sendEvent: EventSender;

  constructor(options: BlockedUsersApiOptions) {

    this.options = options;
    this.authMiddleware = options.authMiddleware;
    // this.friendsClient = this.options.friendsClient;
    this.log = options.log || log.child({ module: "blocked-users-api" });
    this.usermetaClient = options.usermetaClient;
    this.directoryClient = options.directoryClient;
    this.sendEvent = options.sendEvent;
  }

  addRoutes(prefix: string, server: restify.Server) {

    // middleware that loads `req.params.targetUser` from `req.params.tag`
    const loadTargetFromParamsTag = parseTagMod.createParamsMiddleware({
      directoryClient: this.directoryClient,
      log: this.log,
      tagField: "tag",
      userField: "targetUser",
      usernameField: "targetUsername"
    });
    Object.defineProperty(loadTargetFromParamsTag,
      "name", { value: "loadTargetFromParamsTag" });

    // middleware that loads `req.params.targetUser` from `req.body.username`
    const loadTargetFromBodyUsername = parseTagMod.createBodyMiddleware({
      directoryClient: this.directoryClient,
      log: this.log,
      tagField: "username",
      userField: "targetUser",
      usernameField: "targetUsername"
    });
    Object.defineProperty(loadTargetFromBodyUsername,
      "name", { value: "loadTargetFromBodyUsername" });

    const endpoint = `/${prefix}/auth/:authToken/blocked-users`;
    server.get(endpoint,
      this.authMiddleware,
      this.get()
    );
    server.post(endpoint,
      this.authMiddleware,
      loadTargetFromBodyUsername,
      this.post(BLOCKED)
    );
    server.del(`${endpoint}/:tag`,
      this.authMiddleware,
      loadTargetFromParamsTag,
      this.del(UNBLOCKED)
    );
    const reportEndpoint = `/${prefix}/auth/:authToken/reported-user`;
    server.post(reportEndpoint,
      this.authMiddleware,
      loadTargetFromBodyUsername,
      this.post(REPORTED)
    );
  }

  /** handler for GET requests */
  get():RequestHandler {
    return (req: Request, res: Response, next: Next) => {

      // retrieve the username
      const username: string | undefined | null = req.params?.user?.username;
      if (!username)
        return next(new restifyErrors.InternalServerError("no username for provided auth token"));

      // prepare the usermeta request to load the list of blocked users
      const params: UsermetaClientOptions = {
        req_id: req.id(),
        apiSecret: config.secret,
        authToken: req.params.authToken || (req as any).context.authToken,
        username
      };
      req.log.info({ params }, 'usermetaClient.get');
      this.usermetaClient.get(params, META_KEY, (err: Error | null, reply?: string | null) => {
        if (err) {
          return next(new restifyErrors.InternalServerError({
            context: err,
          }, 'Request to usermeta client failed'));
        }

        // send the array of usernames
        res.send(reply ? reply.split(',') : []);
        next();
      });
    };
  }

  /** handler for POST requests */
  post(eventType: BlockedUserEventType): RequestHandler {
    return (req: Request, res: Response, next: Next) => {

      // check the originating username (blocking user)
      const username: string | undefined | null = req.params?.user?.username;
      if (!username) {
        return next(new restifyErrors.InternalServerError("no username for provided auth token"));
      }

      // check the target username (blocked user)
      const target: string | undefined | null = req.params.targetUsername || req.body?.username;
      if (!target) {
        return next(new restifyErrors.BadRequestError({
          code: 'BadRequestError',
        }, "no username in request body"));
      }

      // load the list of blocked users for the originating user
      const params: UsermetaClientOptions = {
        req_id: req.id(),
        apiSecret: config.secret,
        authToken: req.params.authToken || (req as any).context.authToken,
        username
      };
      this.usermetaClient.get(params, META_KEY, (err, reply) => {
        if (err) {
          return next(new restifyErrors.InternalServerError({
            context: err,
          }, 'Request to usermeta client failed (get)'));
        }
        // if the user isn't in the list, add it and save the new list.
        const value: string[] = reply ? reply.split(',') : [];
        const isBlocked: boolean = value.indexOf(target) >= 0;
        if (!isBlocked) {
          value.push(target);
        }
        if (!isBlocked || eventType === REPORTED) {
          this.sendEvent(CHANNEL, eventType, eventData(req.id(), username, target));
        }
        this.usermetaClient.set(params, META_KEY, value.join(','), (err, _reply) => {
          if (err) {
            return next(new restifyErrors.InternalServerError({
              context: err,
            }, 'Request to usermeta client failed (set)'));
          }
          res.send(value);
          next();
        });
      });
    };
  }

  /** handler for DEL requests */
  del(eventType: BlockedUserEventType): RequestHandler {
    return (req: Request, res: Response, next: Next) => {
      const username: string | undefined | null = req.params?.user?.username;
      if (!username) {
        return next(new restifyErrors.InternalServerError("no username for provided auth token"));
      }
      const target: string | undefined | null = req.params.targetUsername || req.params?.tag;
      if (!target) {
        return next(new restifyErrors.BadRequestError({
          code: 'BadRequestError',
        }, "no username specified in request"));
      }
      const params: UsermetaClientOptions = {
        req_id: req.id(),
        apiSecret: config.secret,
        authToken: req.params.authToken || (req as any).context.authToken,
        username
      };
      this.usermetaClient.get(params, META_KEY, (err, reply) => {
        if (err) {
          return next(new restifyErrors.InternalServerError({
            context: err,
          }, 'Request to usermeta client failed'));
        }
        const oldValue: string[] = (reply ? reply.split(',') : []);
        const value: string[] = oldValue
          .filter(blockedUser => blockedUser !== target);
        if (oldValue.length > value.length) {
          this.sendEvent(CHANNEL, eventType, eventData(req.id(), username, target));
        }
        this.usermetaClient.set(params, META_KEY, value.join(','), (err, reply) => {
          if (err) {
            return next(new restifyErrors.InternalServerError({
              context: err,
            }, 'Request to usermeta client failed'));
          }
          res.send(value);
          next();
        });
      });
    };
  }
}

export default {
  createApi(options: BlockedUsersApiOptions) {
    return new BlockedUsersApi(options);
  }
};

// vim: ts=2:sw=2:et:

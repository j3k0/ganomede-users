import restify from 'restify';
import restifyErrors from 'restify-errors';
import { sendError } from '../utils/send-error';
import logMod from "../log";
import { Bans } from '../bans';
import { AuthdbClient } from '../authentication';

export interface CheckBanMiddlewareOptions {
  bans: Bans;
  apiSecret: string;
  authdbClient: AuthdbClient;
}

export default { createMiddleware };

export function createMiddleware(options: CheckBanMiddlewareOptions) {
  const apiSecret = options.apiSecret;
  const authdbClient = options.authdbClient;
  const bans = options.bans;
  const log = logMod.child({ module: "mw-check-ban" });

  // next() - no error, no ban
  // next(err) - error
  // next(ForbiddenError) - ban
  return function checkBanMiddleware(req: restify.Request, _res: restify.Response, next: restify.Next) {
    const username = (req.params && req.params.username) ||
      (req.body && req.body.username) ||
      null;

    if (!username) {
      return sendError(req, new restifyErrors.BadRequestError({
        code: 'BadRequestError'
      }), next);
    }

    return checkBan(username, function (err, exists) {
      if (err) {
        return next(err);
      }

      if (exists) {
        // Remove authToken of banned accounts
        if (req.params.authToken) {
          authdbClient.addAccount(req.params.authToken, null, function () { });
        }

        return next(new restifyErrors.ForbiddenError({
          message: 'user is banned',
          code: 'ForbiddenError'
        }));
      } else {
        return next();
      }
    });
  };

  // callback(error, isBannedBoolean)
  function checkBan(username: string, callback: (error: Error | null, isBanned?: boolean) => void) {
    bans.get({ username, apiSecret }, function (err, ban) {
      if (err) {
        log.error('checkBan() failed', { err, username });
        return callback(err);
      }

      return callback(null, ban.exists);
    });
  }
}
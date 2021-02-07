import { AuthdbClient, Authenticator, AuthenticatorAccount } from "../authentication";
import { Bans } from "../bans";
import checkBanMiddleware from './mw-check-ban';
import restify from 'restify';
import { AliasesClient } from "../aliases";
import { sendError } from "../utils/send-error";
import { Backend, UserToken } from "../backend/directory";
import logMod from "../log";

// Login a user account
export interface LoginMiddlewareOptions {
    bans: Bans;
    apiSecret: string;
    authdbClient: AuthdbClient;
    aliasesClient: AliasesClient;
    backend: Backend;
    authenticator: Authenticator;
}

export default { createMiddleware };

export function createMiddleware(options: LoginMiddlewareOptions) {
    const checkBan = checkBanMiddleware.createMiddleware(options);
    const backend = options.backend;
    const log = logMod.child({ module: "mw-login" });

    return function loginMiddleware(req: restify.Request, res: restify.Response, next: restify.Next) {
        if (req.body.facebookToken) {
            req.log.debug({ body: req.body }, 'facebook token found, using loginFacebook');
            return loginFacebook(req, res, next);
        }

        if (req.body.appleId) {
            req.log.debug({ body: req.body }, 'apple id found, using loginApple');
            return loginApple(req, res, next);
        }

        return checkBan(req, res, function (err) {
            if (err) {
                return next(err);
            }

            return loginDefault(req, res, next);
        });
    };

    // Login (or register) a facebook user account
    function loginFacebook(req: restify.Request, res: restify.Response, next: restify.Next) {
        const account = {
            req_id: req.id(), // pass over request id for better tracking
            accessToken: req.body.facebookToken,
            username: req.body.username,
            password: req.body.password,
            facebookId: req.body.facebookId
        };

        req.log.debug({ account }, 'backend.loginFacebook');
        return backend.loginFacebook(account, function (err, result) {
            if (err) {
                req.log.warn({ err }, 'backend.loginFacebook failed');
                return next(err);
            } else if (typeof result !== 'undefined') {
                req.log.debug({ result }, 'backend.loginFacebook succeeded');
                res.send(result);
            } else {
                req.log.warn('backend.loginFacebook returns no result');
            }
            return next();
        });
    };

    // Login (or register) a facebook user account
    function loginApple(req: restify.Request, res: restify.Response, next: restify.Next) {
        const account = {
            req_id: req.id(), // pass over request id for better tracking
            username: req.body.username,
            password: req.body.password,
            appleId: req.body.appleId,
            appleIdentityToken: req.body.appleIdentityToken,
            appleAuthorizationCode: req.body.appleAuthorizationCode,
            givenName: req.body.givenName,
            surname: req.body.surname,
        };

        req.log.debug({ account }, 'backend.loginApple');
        return backend.loginApple(account, function (err, result) {
            if (err) {
                req.log.warn({ err }, 'backend.loginApple failed');
                return next(err);
            } else if (typeof result !== 'undefined') {
                req.log.debug({ result }, 'backend.loginApple succeeded');
                res.send(result);
            } else {
                req.log.warn('backend.loginApple returns no result');
            }
            return next();
        });
    }
    
    function loginDefault(req: restify.Request, res: restify.Response, next: restify.Next) {

        const account = {
            req_id: req.id(), // pass over request id for better tracking
            username: req.body.username,
            password: req.body.password
        };
        return backend.loginAccount(account, function (err, data) {
            if (err) {
                return sendError(req, err, next);
            }

            // login successful.
            // however, there may be an an alias for this account.
            // in this case, we need to log the user as the alias!
            return options.aliasesClient.get(account.username, function (err, alias) {

                if (err) {
                    log.warn("Error retrieving alias", err);
                }

                // No alias found, return the source user.
                const aliasAccount = aliasAsAccount(alias, data);
                if (err || !alias || !aliasAccount) {
                    res.send(data);
                } else {
                    res.send(options.authenticator.add(aliasAccount));
                }
                return next();
            });
        });
    };
}

function aliasAsAccount(alias: string | AuthenticatorAccount | undefined | null, token?: UserToken): AuthenticatorAccount | undefined {
    if (typeof alias === 'string' || !alias) {
        if (token) {
            return {
                username: alias || token?.username || '',
                token: token?.token || '',
                email: (token as any)?.email || ''
            }
        }
    }
    else {
        return alias;
    }
}

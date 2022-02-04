/**
 * @file api-me.ts
 * 
 * The /me endpoint
 * 
 * Return metadata informations about the requesting user.
 * 
 * This is used by the game to check the session status and
 * retrieve the user profile at application startup.
 */

import restify from 'restify';
import restifyErrors from 'restify-errors';
import { sendError } from '../utils/send-error';
import checkBan from '../middlewares/mw-check-ban';
import { Bans } from '../bans';
import { AuthdbClient, Authenticator } from '../authentication';
import { UsermetaClient, UsermetaClientSingleOptions } from '../usermeta';
import facebookFriends, { FacebookFriends } from '../facebook-friends';
import { AliasesClient } from '../aliases';
import { FriendsClient } from '../friends-store';
import { FacebookClient } from '../facebook';
import async from 'async';

export interface ApiMeOptions {
    prefix: string;
    server: restify.Server;
    bans: Bans;
    apiSecret: string;
    authdbClient: AuthdbClient;
    authenticator: Authenticator;
    rootUsermetaClient: UsermetaClient;
    aliasesClient: AliasesClient;
    friendsClient: FriendsClient;
    facebookClient: FacebookClient;
}

export default { addRoutes };

export function addRoutes(options: ApiMeOptions) {
    options.server.get(
        `/${options.prefix}/auth/:authToken/me`,
        getAccountFromAuthDb,
        checkBan.createMiddleware(options),
        getAccountMetadata,
        getAccountSend
    );

    // Facebook friends
    function storeFacebookFriends (facebookFriends: FacebookFriends, storeOptions) {
        return facebookFriends.storeFriends({
            username: storeOptions.username,
            accessToken: storeOptions.accessToken,
            callback: storeOptions.callback || function () { },
            aliasesClient: storeOptions.aliasesClient || options.aliasesClient,
            friendsClient: storeOptions.friendsClient || options.friendsClient,
            facebookClient: storeOptions.facebookClient || options.facebookClient
        });
    }

    // Load account details. This call most generally made by a client connecting
    // to the server, using a restored session. It's a good place to check
    // and refresh a few things, namely facebook friends for now.
    function getAccountFromAuthDb(req, res, next) {
        // We're loading the account from a token (required)
        const token = req.params.authToken;
        if (!token) {
            const err = new restifyErrors.InvalidContentError({
                message: "invalid content",
                code: 'InvalidContentError'
            });
            return sendError(req, err, next);
        }

        // Use the authentication database to retrieve more about the user.
        // see `addAuth` for details of what's in the account, for now:
        //  - username
        //  - email
        //  - facebookToken (optionally)
        return options.authdbClient.getAccount(token, function (err, account) {
            if (err || !account) {
                req.log.warn({ err }, "NotAuthorizedError");
                err = new restifyErrors.NotAuthorizedError({
                    message: "not authorized",
                    code: 'InvalidContentError'
                });
                return sendError(req, err, next);
            }

            req.params._store = { account };
            req.body = req.body || {};
            req.body.username = req.body.username || account.username;
            // console.log 'next', account
            return next();
        });
    };
    

    function getAccountMetadata(req, res, next) {
        // console.log 'getAccountMetadata'
        const { account } = req.params._store;
        const params: UsermetaClientSingleOptions = {
            req_id: req.id(),
            authToken: req.params.authToken,
            username: account.username
        };
        // fill in already loaded info when we have them
        if (req.params.user) {
            params.username = account.username;
            params.tag = account.tag;
            params.name = account.name;
            params.email = account.email;
        }
        async.mapValues<1, string | null>({
            'country': 1,
            'yearofbirth': 1,
            '$chatdisabled': 1,
        }, function(_one, key, callback) {
            options.rootUsermetaClient.get(params, key, callback);
        }, function(err, results) {
            if (err) {
                req.log.warn({err}, 'Failed to fetch metadata');
            }
            req.params._store.account.metadata = results;
            return next();
        });
    }

    function getAccountSend(req: restify.Request, res: restify.Response, next: restify.Next) {
        // console.log 'getAccountSend'
        // Respond to request.
        const { account } = req.params._store;
        res.send(account);

        // Reload facebook friends in the background
        // (next has been called)
        if (account.facebookToken) {
            storeFacebookFriends(facebookFriends, {
                username: account.username,
                accessToken: account.facebookToken,
                callback(err) {
                    if (err) {
                        return req.log.error(`Failed to store friends for ${account.username}`, err);
                    }
                }
            });
        }

        // Update the "auth" metadata
        if (account.username) {
            options.authenticator!.updateAuthMetadata(account);
        }

        return next();
    }

}

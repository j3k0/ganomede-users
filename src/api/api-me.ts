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
import { CONFIRMED_META_KEY } from '../email-confirmation/api';

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
        const keys: string[] = ['country', 'yearofbirth', '$chatdisabled', '$blocked', 'location',
            'singleplayerstats', 'productId', 'purchaseId', 'purchaseDate', 'expirationDate', CONFIRMED_META_KEY];
        options.rootUsermetaClient.getBulkForUser(params, keys, (err2, reply2) => {
            if (err2) {
                req.log.warn({ err2 }, 'Failed to fetch metadata');
            }

            const emptyRecord:Record<string, string|undefined> = {};
            const results:Record<string, string|undefined> = reply2?.reduce((acc, usermeta) => ({
                [usermeta.key]: usermeta.value,
                ...acc
            } as Record<string, string | undefined>), emptyRecord) || emptyRecord;

            // Suggestion by Hussein to return confirmedemails as an object, but it might break code that
            // expects all metadata to be strings.
            // const confirmedEmails = results[CONFIRMED_META_KEY];
            // if (confirmedEmails) {
            //     try {
            //         results[CONFIRMED_META_KEY] = JSON.parse(confirmedEmails);
            //     } catch(err) {
            //         req.log.warn({ confirmedEmails }, 'Failed to parse confirmed emails: ' + (err as Error)?.message);
            //     }
            // }

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

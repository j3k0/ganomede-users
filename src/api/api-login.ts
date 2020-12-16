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
import { Bans } from '../bans';
import { AuthdbClient, Authenticator } from '../authentication';
import loginMiddleware from '../middlewares/mw-login';
import { AliasesClient } from '../aliases';
import { Backend } from '../backend/directory';
import parseTagMiddleware from '../middlewares/mw-parse-tag';
import { DirectoryClient } from '../directory-client';
import logMod from "../log";

export interface ApiLoginOptions {
    prefix: string;
    server: restify.Server;
    bans: Bans;
    apiSecret: string;
    authdbClient: AuthdbClient;
    aliasesClient: AliasesClient;
    backend: Backend;
    authenticator: Authenticator;
    directoryClient: DirectoryClient;
}

export default { addRoutes };

export function addRoutes(options: ApiLoginOptions) {

    const log = logMod.child({module: "api-login"});

    const bodyTag = parseTagMiddleware.createBodyMiddleware({
        directoryClient: options.directoryClient,
        log,
        tagField: "username"
    });
    Object.defineProperty(bodyTag, "name", { value: "bodyTag" });

    const login = loginMiddleware.createMiddleware(options);

    options.server.post(`/${options.prefix}/login`, bodyTag, login);
}

// vim: ts=2:sw=2:et:
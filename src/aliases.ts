//
// Store alias stormpath username -> co-account username
// in usermeta (someone@fovea.cc -> jeko)
//
import internalUsermeta, { InternalUsermetaClient } from "./internal-usermeta";
export type AliasesClient = InternalUsermetaClient;

export default {
    createClient: internalUsermeta.clientFactory("$alias")
};

// vim: ts=2:sw=2:et:

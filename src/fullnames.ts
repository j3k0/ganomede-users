//
// Store users' full names in usermeta
//
import internalUsermeta from "./internal-usermeta";

export default {createClient: internalUsermeta.clientFactory("fullname")};

// vim: ts=2:sw=2:et:

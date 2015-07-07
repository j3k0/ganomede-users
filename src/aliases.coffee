#
# Store alias stormpath username -> co-account username
# in usermeta (someone@fovea.cc -> jeko)
#
internalUsermeta = require "./internal-usermeta"
module.exports =
  createClient: internalUsermeta.clientFactory "$alias"

# vim: ts=2:sw=2:et:

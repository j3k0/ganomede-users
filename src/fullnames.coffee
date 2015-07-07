#
# Store users' full names in usermeta
#
internalUsermeta = require "./internal-usermeta"
module.exports =
  createClient: internalUsermeta.clientFactory "fullname"

# vim: ts=2:sw=2:et:

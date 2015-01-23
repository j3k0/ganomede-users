# Users

addRoutes = (prefix, server) ->
  server.get "/#{prefix}/me", (req, res, next) ->
    res.send
      ok: true
    next()

module.exports =
  addRoutes: addRoutes

# vim: ts=2:sw=2:et:

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import log from "./log";
import aboutApi from "./about-api";
import pingApi from "./ping-api";
import usersApi from "./users-api";

const addRoutes = function(prefix, server) {
  log.info("adding routes");

  // Platform Availability
  pingApi.addRoutes(prefix, server);

  // About
  aboutApi.addRoutes(prefix, server);

  // About
  usersApi.addRoutes(prefix, server);
};

const initialize = function(callback) {
  log.info("initializing backend");
  return usersApi.initialize(function(err) {
    if (err) {
      log.error(err);
      process.exit(1);
      return;
    }
    return (typeof callback === 'function' ? callback() : undefined);
  });
};

const destroy = () => log.info("destroying backend");

export default {
  initialize,
  destroy,
  addRoutes,
  log
};

// vim: ts=2:sw=2:et:

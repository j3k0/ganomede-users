/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import errors from "./errors";

const validateUsername = function(username) {
  if (!username) {
    return new errors.BadUsernameError("username empty");
  }
  if (username.length > 10) {
    return new errors.TooLongError("username is too long");
  }
  if (username.length < 3) {
    return new errors.TooShortError("username is too short");
  }
  if (!username.match(/^[a-zA-Z0-9]+$/)) {
    return new errors.BadUsernameError("username contains invalid characters");
  }
  return null;
};

export default validateUsername;
// vim: ts=2:sw=2:et:

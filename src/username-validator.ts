import restifyErrors from 'restify-errors';
import errors from "./errors";

export function validateUsername(username:string):restifyErrors.RestError|null {
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
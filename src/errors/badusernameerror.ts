/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import restify from 'restify';
import util from 'util';

var BadUsernameError = function(message) {
  restify.RestError.call(this, {
    restCode: 'BadUsernameError',
    statusCode: 400,
    message,
    constructorOpt: BadUsernameError
  }
  );
  return this.name = 'BadUsernameError';
};

util.inherits(BadUsernameError, restify.RestError);

export default BadUsernameError;

// vim: ts=2:sw=2:et:

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import restify from 'restify';
import util from 'util';

var TooLongError = function(message) {
  restify.RestError.call(this, {
    restCode: 'TooLongError',
    statusCode: 400,
    message,
    constructorOpt: TooLongError
  }
  );
  return this.name = 'TooLongError';
};

util.inherits(TooLongError, restify.RestError);

export default TooLongError;

// vim: ts=2:sw=2:et:

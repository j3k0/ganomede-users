/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import restify from 'restify';
import util from 'util';

var TooShortError = function(message) {
  restify.RestError.call(this, {
    restCode: 'TooShortError',
    statusCode: 400,
    message,
    constructorOpt: TooShortError
  }
  );
  return this.name = 'TooShortError';
};

util.inherits(TooShortError, restify.RestError);

export default TooShortError;

// vim: ts=2:sw=2:et:

import * as restifyErrors from 'restify-errors'

export class BadUsernameError extends restifyErrors.RestError {
  constructor(message) {
    super({
      restCode: 'BadUsernameError',
      statusCode: 400,
      message,
      constructorOpt: BadUsernameError
    });
  }
}

export default BadUsernameError;

// vim: ts=2:sw=2:et:
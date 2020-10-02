import restifyErrors from 'restify-errors';

export class TooLongError extends restifyErrors.RestError {
  constructor(message) {
    super({
      restCode: 'TooLongError',
      name: 'TooLongError',
      statusCode: 400,
      message,
      constructorOpt: TooLongError
    });
  }
};

export default TooLongError;

// vim: ts=2:sw=2:et:

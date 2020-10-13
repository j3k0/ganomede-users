import restifyErrors from 'restify-errors';

export class TooShortError extends restifyErrors.RestError {
  constructor(message) {
    super({
      restCode: 'TooShortError',
      name: 'TooShortError',
      statusCode: 400,
      message,
      constructorOpt: TooShortError
    });
  }
};

export default TooShortError;

// vim: ts=2:sw=2:et:
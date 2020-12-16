import restify from "restify";

export function sendError(req: restify.Request, err: any, next: restify.Next) {
  if (err.code === 'InvalidCredentialsError' || err.code == 'UnauthorizedError' || err.code == 'InvalidCredentials' || err.code == 'StormpathResourceError2006') {
    req.log.info(err);
  }
  else if (err.rawError) {
    req.log.warn(err.rawError);
  } else {
    req.log.warn(err);
  }
  return next(err);
}

import { HttpError } from "restify-errors";
import { Request, Response } from "restify";
import Logger from "bunyan";

export interface JsonClientRetry {
  get<T>(options: JsonClientOptions & { log: Logger }, callback: JsonClientCallback<T>): void;
  post<T>(options: JsonClientOptions & { log: Logger }, body: any, callback: JsonClientCallback<T>): void;
}

export interface JsonClientOptions {
  path: string;
  headers?: any;
}

export type JsonClientCallback<T> = (err: HttpError | null, _req: Request, _res: Response, body?: T | null) => void;

export function jsonClientRetry(jsonClient: any): JsonClientRetry {
  return {
    get<T>(options: JsonClientOptions & { log: Logger }, callback: JsonClientCallback<T>): void {
      requestAndRetry({
        log: options.log,
        requester: (cb) => jsonClient.get(options, (err: HttpError | null, req: Request, res: Response, body?: T | null) => cb(err, { body, req, res })),
        done: (err: HttpError | null, result: JsonClientResult<T>) => callback(err, result?.req, result?.res, result?.body)
      });
    },
    post<T>(options: JsonClientOptions & { log: Logger }, body: any, callback: JsonClientCallback<T>): void {
      // post should probably not be retried
      requestAndRetry({
        log: options.log,
        requester: (cb) => jsonClient.post(options, body, (err: HttpError | null, req: Request, res: Response, body?: T | null) => cb(err, { body, req, res })),
        done: (err: HttpError | null, result: JsonClientResult<T>) => callback(err, result?.req, result?.res, result?.body)
      });
    }
  };
}

interface JsonClientResult<T> {
  req: Request;
  res: Response;
  body?: T | null;
}

function requestAndRetry<T>(options: RequestAndRetryOptions<T>, numTries: number = 1, maxTries: number = 3) {
  options.requester((err: HttpError | null, result: T) => {
    if (numTries < maxTries && err?.code === 'ECONNRESET') {
      options.log.error({ err_code: err.code, numTries }, "Retrying failed request");
      setTimeout(() => requestAndRetry(options, numTries + 1, maxTries), 300);
    }
    else {
      options.done(err, result);
    }
  });
}

type RequestAndRetryCallback<T> = (err: HttpError | null, result: T) => void;

interface RequestAndRetryOptions<T> {
  log: Logger;
  requester: (cb: RequestAndRetryCallback<T>) => void;
  done: RequestAndRetryCallback<T>;
}

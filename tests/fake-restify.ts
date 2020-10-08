/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// vim: ts=2:sw=2:et:

import td from 'testdouble';
import { RequestHandler } from 'restify';
import vasync from "vasync"
import { v4 as uuidv4 } from 'uuid';
import logMod from '../src/log';
import { HttpError } from 'restify-errors';

class Res {
  status: number;
  body: any;
  constructor() {
    this.status = 200;
  }
  send(data) {
    return this.body = data;
  }
}

interface Routes {
  [url: string]: RequestHandler[];
}

interface RoutesByMethod {
  get: Routes;
  head: Routes;
  put: Routes;
  post: Routes;
  del: Routes;
}

class Server {
  routes: RoutesByMethod;
  res?: Res;
  log: any;
  
  constructor() {
    this.routes = {
      get: {},
      head: {},
      put: {},
      post: {},
      del: {}
    };
    this.log = logMod; // td.object([ 'info', 'warn', 'error', 'debug' ]);
  }
  get(url, ...callbacks:RequestHandler[]) {
    return this.routes.get[url] = callbacks;
  }
  head(url, ...callbacks:RequestHandler[]) {
    return this.routes.head[url] = callbacks;
  }
  put(url, ...callbacks:RequestHandler[]) {
    return this.routes.put[url] = callbacks;
  }
  post(url, ...callbacks:RequestHandler[]) {
    return this.routes.post[url] = callbacks;
  }
  del(url, ...callbacks:RequestHandler[]) {
    return this.routes.del[url] = callbacks;
  }

  request(type, url, req:any = {}, callback?:(res?: Res) => void) {
    if (!req.log)
      req.log = logMod;
    if (!req.req_id)
      req.req_id = uuidv4();
    if (!req.id)
      req.id = () => req.req_id;
    const res = this.res = new Res();
    vasync.pipeline({
      funcs: this.routes[type][url].map(
        requestHandler => (_, callback) =>
          requestHandler(req, res, callback))
    }, (err?:HttpError) => {
      if (err) {
        this.res!.status = err.statusCode || 500;
        this.res!.send(err);
      }
      if (typeof callback === 'function')
        callback(this.res);
    });
  }

  on(_event: string, _callback: any): void {
    // ignored
  }
}

export default {
  createServer() {
    return new Server();
  }
};
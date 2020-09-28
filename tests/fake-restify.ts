/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// vim: ts=2:sw=2:et:

class Res {
  constructor() {
    this.status = 200;
  }
  send(data) {
    return this.body = data;
  }
}

class Server {
  constructor() {
    this.routes = {
      get: {},
      head: {},
      put: {},
      post: {},
      del: {}
    };
  }
  get(url, callback) {
    return this.routes.get[url] = callback;
  }
  head(url, callback) {
    return this.routes.head[url] = callback;
  }
  put(url, callback) {
    return this.routes.put[url] = callback;
  }
  post(url, callback) {
    return this.routes.post[url] = callback;
  }
  del(url, callback) {
    return this.routes.del[url] = callback;
  }

  request(type, url, req, callback) {
    return this.routes[type][url](req, (this.res = new Res),
      data => {
        if (data) {
          this.res.status = data.status || 500;
          this.res.send(data);
        }
        return (typeof callback === 'function' ? callback(this.res) : undefined);
    });
  }
}

export default {createServer() { return new Server; }};

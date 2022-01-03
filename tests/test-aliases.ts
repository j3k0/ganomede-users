/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import aliases from "../src/aliases";

describe("aliases", function() {
  let aliasesClient: any = null;
  before(function() {
    const fakeUsermetaClient = {
      meta: {},
      isValid(key) { return true; },
      get(username, key, cb) {
        return cb(null, this.meta[`${username}:${key}`]);
      },
      set(username, key, value, cb) {
        this.meta[`${username}:${key}`] = value;
        return cb(null);
      },
      getBulk(username, keys, cb) {
        return cb(null, null); //TODO
      },
      setBulk(username, keyValues, cb) {
        return cb(null, null); //TODO
      }
    };
    aliasesClient = aliases.createClient({
      usermetaClient: fakeUsermetaClient});
  });

  it("Sets aliases", done => aliasesClient.set("fb:123", "roger", function(err) {
    assert.ok(!err);
    return done();
  }));

  it("Gets aliases", done => aliasesClient.get("fb:123", function(err, alias) {
    assert.ok(!err);
    assert.equal("roger", alias);
    return done();
  }));

  return it("Returns null for nonexisting aliases", done => aliasesClient.get("none", function(err, value) {
    assert.ok(!err);
    assert.equal(null, value);
    return done();
  }));
});


// vim: ts=2:sw=2:et:

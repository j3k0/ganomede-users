/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import friendsStore from "../src/friends-store";

const manyFriend = (prefix: string, n: number) => (() => {
  const result: string[] = [];
  while (n-- > 0) {
    result.push(`${prefix}${n}`);
  }
  return result;
})();

describe("friends", function() {
  let friendsClient: any = null;
  before(function() {
    const fakeUsermetaClient = {
      type: 'fakeUsermetaClient',
      meta: {},
      isValid(key) { return true; },
      get(username, key, cb) {
        return cb(null, this.meta[`${username}:${key}`]);
      },
      set(username, key, value, cb, maxLength) {
        this.meta[`${username}:${key}`] = value;
        this.meta[`${username}:${key}:maxLength`] = maxLength;
        return cb(null);
      },
      getBulk(username, keys, cb) {
        return cb(null, null); //TODO
      },
      setBulk(username, keyValues, cb) {
        return cb(null, null); //TODO
      }
    };
    friendsClient = friendsStore.createClient({
      usermetaClient: fakeUsermetaClient,
      maxFriends: 100
    });
  });

  it("Sets friends", done => friendsClient.set("jeko", manyFriend("a", 50), function(err) {
    assert.ok(!err);
    return done();
  }));

  it("Gets friends", done => friendsClient.get("jeko", function(err, friends) {
    assert.ok(!err);
    assert.equal(50, friends.length, "has 50 friends");
    assert.equal("a49", friends[0]);
    assert.equal("a0", friends[49]);
    return done();
  }));

  it("Add friends to the list", done => friendsClient.add("jeko", manyFriend("b", 30), function(err) {
    assert.ok(!err);
    return friendsClient.get("jeko", function(err, friends) {
      assert.ok(!err);
      assert.equal(80, friends.length);
      return done();
    });
  }));

  it("Doesn't add duplicates", done => friendsClient.add("jeko", manyFriend("a", 70), function(err) {
    assert.ok(!err);
    return friendsClient.get("jeko", function(err, friends) {
      assert.ok(!err);
      assert.equal(100, friends.length);
      return done();
    });
  }));

  it("Doesn't add more that maxFriends", done => friendsClient.add("jeko", manyFriend("c", 100), function(err) {
    assert.ok(!err);
    return friendsClient.get("jeko", function(err, friends) {
      assert.ok(!err);
      assert.equal(100, friends.length);
      return done();
    });
  }));

  return it("Returns empty if no friends", done => friendsClient.get("none", function(err, value) {
    assert.ok(!err);
    assert.equal(0, value.length);
    return done();
  }));
});

// vim: ts=2:sw=2:et:

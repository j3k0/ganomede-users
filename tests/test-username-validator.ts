/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";

describe('username-validator', function() {
  const usernameValidator = require("../src/username-validator");

  it('should allow valid usernames', function() {
    const err = usernameValidator('01aAbBzZ9');
    return assert.ok(!err);
  });

  it('should not allow long username', function() {
    assert.ok(!usernameValidator('0123456789'));
    const err = usernameValidator('01234567890');
    return assert.ok((err != null ? err.name : undefined) === 'TooLongError');
  });

  it('should not allow short username', function() {
    assert.ok(!usernameValidator('012'));
    const err = usernameValidator('01');
    return assert.ok((err != null ? err.name : undefined) === 'TooShortError');
  });

  return it('should not allow special characters', function() {
    const err = usernameValidator('0000@');
    assert.ok((err != null ? err.name : undefined) === 'BadUsernameError');

    assert.ok(usernameValidator('0000@'));
    assert.ok(usernameValidator('_0000'));
    assert.ok(usernameValidator('00-00'));
    assert.ok(usernameValidator('0/000'));
    assert.ok(usernameValidator('000é0'));
    assert.ok(usernameValidator(' 0000'));
    return assert.ok(usernameValidator('0000 '));
  });
});

// vim: ts=2:sw=2:et:

/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import usernameValidator from "../src/username-validator";

describe('username-validator', function() {

  it('should allow valid usernames', function() {
    const err = usernameValidator('01aAbBzZ9');
    assert.ok(!err);
  });

  it('should not allow long username', function() {
    assert.ok(!usernameValidator('0123456789'));
    const err = usernameValidator('01234567890');
    assert.equal(err?.name, 'TooLongError');
  });

  it('should not allow short username', function() {
    assert.ok(!usernameValidator('012'));
    const err = usernameValidator('01');
    assert.equal(err?.name, 'TooShortError');
  });

  it('should not allow special characters', function() {
    const err = usernameValidator('0000@');
    assert.equal(err?.name, 'BadUsernameError');

    assert.ok(usernameValidator('0000@'));
    assert.ok(usernameValidator('_0000'));
    assert.ok(usernameValidator('00-00'));
    assert.ok(usernameValidator('0/000'));
    assert.ok(usernameValidator('000é0'));
    assert.ok(usernameValidator(' 0000'));
    assert.ok(usernameValidator('0000 '));
  });
});

// vim: ts=2:sw=2:et:

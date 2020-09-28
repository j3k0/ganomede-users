/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert";
import errors from "../src/errors";

describe("errors", function() {

  it("Should declare TooLongError", function() {
    assert.ok(errors.TooLongError);
    return assert.ok(new errors.TooLongError("provided arg was too long"));
  });

  it("Should declare TooShortError", function() {
    assert.ok(errors.TooShortError);
    return assert.ok(new errors.TooShortError("provided arg was too short"));
  });

  return it("Should declare BadUsernameError", function() {
    assert.ok(errors.BadUsernameError);
    return assert.ok(new errors.BadUsernameError("provided username is bad"));
  });
});

// vim: ts=2:sw=2:et:


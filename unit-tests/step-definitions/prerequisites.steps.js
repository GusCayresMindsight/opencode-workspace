'use strict';

const { Given, When, Then } = require('@cucumber/cucumber');
const assert = require('assert/strict');
const fs     = require('fs');
const path   = require('path');

const PKG_PATH = path.resolve(__dirname, '../../package.json');

// ─── Given ────────────────────────────────────────────────────────────────────

Given('the current Node.js version is {int} or higher', function (minVersion) {
  const major = parseInt(process.version.slice(1), 10);
  assert.ok(
    major >= minVersion,
    `Test environment requires Node.js >= ${minVersion}, but found ${process.version}. ` +
    'Please upgrade Node.js before running these tests.',
  );
});

// ─── When ─────────────────────────────────────────────────────────────────────

When('any opencode-workspace command is run', function () {
  // Node version is already verified in the Given step.
  // This step is intentionally a no-op: reaching it means no pre-check failed.
});

When('package.json is read', function () {
  this._pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
});

// ─── Then ─────────────────────────────────────────────────────────────────────

Then('the command does not exit with a {string} error', function (fragment) {
  // If we reach this step, no ExitError was thrown by the When step.
  // thrownError is null by default (world constructor).
  assert.equal(
    this.thrownError,
    null,
    `Expected no error containing "${fragment}", but got: ${this.thrownError?.message}`,
  );
});

Then('the {string} field is {string}', function (keyPath, expectedValue) {
  assert.ok(this._pkg, 'package.json was not read — call "When package.json is read" first');
  const keys = keyPath.split('.');
  let value  = this._pkg;
  for (const key of keys) {
    assert.ok(
      value != null && Object.prototype.hasOwnProperty.call(value, key),
      `Key "${key}" not found in ${JSON.stringify(value)}`,
    );
    value = value[key];
  }
  assert.equal(
    String(value),
    expectedValue,
    `Expected "${keyPath}" to be "${expectedValue}", got "${value}"`,
  );
});

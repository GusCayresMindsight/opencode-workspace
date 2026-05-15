module.exports = {
  default: {
    paths:   ['docs/*.feature'],
    require: [
      'unit-tests/support/world.js',
      'unit-tests/support/hooks.js',
      'unit-tests/step-definitions/**/*.steps.js',
    ],
    tags:    'not @wip',
    format:  ['progress-bar', 'summary'],
    timeout: 30000,
  },
};

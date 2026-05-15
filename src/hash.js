'use strict';

const { createHash } = require('crypto');

/**
 * Stable cache key for a tool: hash of its description + full input schema.
 * Changing either the description or any schema field invalidates the cache
 * and forces a re-embed.
 *
 * @param {string|null|undefined} description
 * @param {object|null|undefined} inputSchema
 * @returns {string} hex sha256
 */
function hashTool(description, inputSchema) {
  const content = (description || '') + JSON.stringify(inputSchema || {});
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

module.exports = { hashTool };

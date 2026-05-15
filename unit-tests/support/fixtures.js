'use strict';

// ─── Canned tool lists ────────────────────────────────────────────────────────

const GITHUB_TOOLS = [
  { name: 'get_pull_request',    description: 'Get details of a pull request',              inputSchema: {} },
  { name: 'list_pull_requests',  description: 'List pull requests in a repository',          inputSchema: {} },
  { name: 'create_issue',        description: 'Create a new issue in a GitHub repository',   inputSchema: {} },
  { name: 'search_repositories', description: 'Search GitHub repositories',                  inputSchema: {} },
];

const NOTION_TOOLS = [
  { name: 'search',      description: 'Search Notion pages and databases', inputSchema: {} },
  { name: 'create_page', description: 'Create a new page in Notion',       inputSchema: {} },
];

const PLAYWRIGHT_TOOLS = [
  { name: 'browser_navigate', description: 'Navigate to a URL in the browser', inputSchema: {} },
  { name: 'browser_click',    description: 'Click on an element on the page',   inputSchema: {} },
];

const SEMGREP_TOOLS = [
  { name: 'semgrep_scan', description: 'Run a Semgrep scan on code files', inputSchema: {} },
];

const ALL_FIXTURES = {
  github:     GITHUB_TOOLS,
  notion:     NOTION_TOOLS,
  playwright: PLAYWRIGHT_TOOLS,
  semgrep:    SEMGREP_TOOLS,
};

// ─── Fake vector space ────────────────────────────────────────────────────────
// Each server occupies one dimension of a 384-dim vector.
// Tool embeddings are unit vectors at their server's dimension.
// Query embeddings are built by keyword matching — deterministic and fast.

const SERVER_DIM = {
  github:               0,
  notion:               1,
  playwright:           2,
  gitlab:               3,
  fetch:                4,
  semgrep:              5,
  'aws-knowledge':      6,
  'sequential-thinking':7,
};

const KEYWORD_MAP = [
  { dim: 0, keywords: ['github', 'pull request', 'pull_request', 'issue', 'repository', 'repo'] },
  { dim: 1, keywords: ['notion', 'page', 'database', 'workspace'] },
  { dim: 2, keywords: ['playwright', 'browser', 'click', 'navigate', 'screenshot'] },
  { dim: 3, keywords: ['gitlab', 'merge request', 'pipeline'] },
  { dim: 4, keywords: ['fetch', 'http', 'url', 'request'] },
  { dim: 5, keywords: ['semgrep', 'scan', 'security', 'sast'] },
  { dim: 6, keywords: ['aws', 'amazon', 'cloud', 'lambda', 's3'] },
  { dim: 7, keywords: ['sequential', 'thinking', 'reasoning', 'step'] },
];

/** 384-dim unit vector at the given dimension index. */
function unitVec(dim) {
  const v = new Array(384).fill(0);
  v[dim] = 1.0;
  return v;
}

/** Fake embedding for a piece of text: keyword-match → server dimension. */
function vectorForText(text) {
  const lower = text.toLowerCase();
  for (const { dim, keywords } of KEYWORD_MAP) {
    if (keywords.some(kw => lower.includes(kw))) return unitVec(dim);
  }
  return unitVec(383); // last dimension for neutral / unmatched text
}

/** Unit vector for a server name (used when seeding the corpus). */
function vectorForServer(serverName) {
  const dim = SERVER_DIM[serverName] ?? 383;
  return unitVec(dim);
}

/** Returns a mock Embedder compatible with the Embedder base class interface. */
function makeFakeEmbedder() {
  return {
    async embed(text) { return vectorForText(text); },
    get dimensions() { return 384; },
  };
}

module.exports = {
  GITHUB_TOOLS,
  NOTION_TOOLS,
  PLAYWRIGHT_TOOLS,
  SEMGREP_TOOLS,
  ALL_FIXTURES,
  SERVER_DIM,
  vectorForServer,
  vectorForText,
  makeFakeEmbedder,
  unitVec,
};

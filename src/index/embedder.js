'use strict';

// ─── Base class ───────────────────────────────────────────────────────────────

class Embedder {
  /** @returns {Promise<number[]>} unit-normalised float32 vector */
  // eslint-disable-next-line no-unused-vars
  async embed(_text) { throw new Error('not implemented'); }

  /** Dimensionality of the produced vectors */
  get dimensions() { return 384; }
}

// ─── Local (HuggingFace ONNX) ────────────────────────────────────────────────

class LocalEmbedder extends Embedder {
  constructor(config) {
    super();
    this._model    = config.model ?? 'Xenova/all-MiniLM-L6-v2';
    this._pipeline = null;
  }

  async embed(text) {
    if (!this._pipeline) {
      // Lazy-load: avoids 2-4 s startup cost when retrieval is skipped
      const { pipeline } = await import('@huggingface/transformers');
      this._pipeline = await pipeline('feature-extraction', this._model, {
        device: 'cpu',
        dtype: 'fp32',
      });
    }
    const output = await this._pipeline(text, { pooling: 'mean', normalize: true });
    // output.data is a Float32Array; convert to plain JS array
    return Array.from(output.data);
  }

  get dimensions() { return 384; }   // all-MiniLM-L6-v2 → 384-dim
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

class OpenAIEmbedder extends Embedder {
  constructor(config) {
    super();
    this._model  = config.model  ?? 'text-embedding-3-small';
    this._apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!this._apiKey) {
      throw new Error(
        'OpenAI embedding provider requires an API key.\n' +
        'Set OPENAI_API_KEY or add "embedding.apiKey" to ' +
        '~/.config/opencode-workspace/config.json',
      );
    }
  }

  async embed(text) {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization:  `Bearer ${this._apiKey}`,
      },
      body: JSON.stringify({ model: this._model, input: text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI embeddings API error ${res.status}: ${body}`);
    }
    const json = await res.json();
    return json.data[0].embedding;
  }

  get dimensions() {
    // text-embedding-3-large → 3072; everything else defaults to 1536
    return this._model.includes('large') ? 3072 : 1536;
  }
}

// ─── Voyage (placeholder) ────────────────────────────────────────────────────

class VoyageEmbedder extends Embedder {
  constructor() { super(); }
  async embed() { throw new Error('Voyage embedding provider: not implemented'); }
}

// ─── Cohere (placeholder) ────────────────────────────────────────────────────

class CohereEmbedder extends Embedder {
  constructor() { super(); }
  async embed() { throw new Error('Cohere embedding provider: not implemented'); }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * @param {{ provider: string, model?: string, apiKey?: string }} config
 * @returns {Embedder}
 */
function createEmbedder(config) {
  switch ((config.provider ?? 'local').toLowerCase()) {
    case 'local':  return new LocalEmbedder(config);
    case 'openai': return new OpenAIEmbedder(config);
    case 'voyage': return new VoyageEmbedder(config);
    case 'cohere': return new CohereEmbedder(config);
    default:
      throw new Error(`Unknown embedding provider: "${config.provider}"`);
  }
}

module.exports = { createEmbedder, Embedder };

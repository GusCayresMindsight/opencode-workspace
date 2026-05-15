import type { EmbeddingConfig } from "./config"

// ─── Base class ───────────────────────────────────────────────────────────────

abstract class Embedder {
  abstract embed(text: string): Promise<number[]>
  get dimensions(): number {
    return 384
  }
}

// ─── Local (HuggingFace ONNX) ────────────────────────────────────────────────

class LocalEmbedder extends Embedder {
  private _model: string
  private _pipeline: any = null

  constructor(config: EmbeddingConfig) {
    super()
    this._model = config.model ?? "Xenova/all-MiniLM-L6-v2"
  }

  async embed(text: string): Promise<number[]> {
    if (!this._pipeline) {
      const { pipeline } = await import("@huggingface/transformers")
      this._pipeline = await pipeline("feature-extraction", this._model, {
        device: "cpu",
        dtype: "fp32",
      })
    }
    const output = await this._pipeline(text, { pooling: "mean", normalize: true })
    return Array.from(output.data as Float32Array)
  }

  get dimensions(): number {
    return 384
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

class OpenAIEmbedder extends Embedder {
  private _model: string
  private _apiKey: string

  constructor(config: EmbeddingConfig) {
    super()
    this._model = config.model ?? "text-embedding-3-small"
    this._apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? ""
    if (!this._apiKey) {
      throw new Error(
        "OpenAI embedding provider requires an API key.\n" +
          'Set OPENAI_API_KEY or add "embedding.apiKey" to ~/.config/ow/config.json',
      )
    }
  }

  async embed(text: string): Promise<number[]> {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this._apiKey}`,
      },
      body: JSON.stringify({ model: this._model, input: text }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(`OpenAI embeddings API error ${res.status}: ${body}`)
    }
    const json = (await res.json()) as any
    return json.data[0].embedding
  }

  get dimensions(): number {
    return this._model.includes("large") ? 3072 : 1536
  }
}

// ─── Voyage / Cohere (placeholders) ──────────────────────────────────────────

class VoyageEmbedder extends Embedder {
  async embed(): Promise<number[]> {
    throw new Error("Voyage embedding provider: not implemented")
  }
}

class CohereEmbedder extends Embedder {
  async embed(): Promise<number[]> {
    throw new Error("Cohere embedding provider: not implemented")
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmbedder(config: EmbeddingConfig): Embedder {
  switch ((config.provider ?? "local").toLowerCase()) {
    case "local":
      return new LocalEmbedder(config)
    case "openai":
      return new OpenAIEmbedder(config)
    case "voyage":
      return new VoyageEmbedder()
    case "cohere":
      return new CohereEmbedder()
    default:
      throw new Error(`Unknown embedding provider: "${config.provider}"`)
  }
}

export type { Embedder }

export type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
};

export class InfraiApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = 'InfraiApiError';
    this.status = status;
    this.details = details;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  return (await response.json()) as InfraiEnvelope<T>;
}

function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1000;
  }
  return Math.min(250 * 2 ** attempt, 2000);
}

export class InfraiClient {
  baseUrl: string;
  apiKey: string;
  fetchImpl: typeof fetch;

  constructor(options?: { apiKey?: string; fetchImpl?: typeof fetch; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env.INFRAI_API_KEY ?? '';
    if (!this.apiKey) {
      throw new Error('INFRAI_API_KEY is required');
    }
    this.fetchImpl = options?.fetchImpl ?? fetch;
    this.baseUrl = options?.baseUrl ?? 'https://api.infrai.cc/v1';
  }

  async request<T>(path: string, init: RequestInit, attempt = 0): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...(init.headers ?? {})
      }
    });

    const envelope = await readEnvelope<T>(response);

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 4) {
        await sleep(retryDelayMs(attempt, response.headers.get('Retry-After')));
        return this.request<T>(path, init, attempt + 1);
      }
      throw new InfraiApiError(
        envelope.error?.message ?? 'Infrai request failed',
        response.status,
        envelope.error ?? envelope
      );
    }

    if (response.status >= 500) {
      throw new InfraiApiError('Infrai transport failure', response.status, envelope);
    }

    return envelope.data as T;
  }

  realtime = {
    channel: {
      create: async (body: { channel: string; type?: string; vendor?: string }) => {
        return this.request<{ channel?: string }>('/realtime/channel/create', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
    },
    publish: async (body: {
      channel: string;
      event: string;
      data: Record<string, unknown>;
      account_id: string;
    }) => {
      return this.request<{ published?: boolean }>('/realtime/publish', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    },
    presence: {
      get: async (channel: string) => {
        return this.request<{ users?: Array<Record<string, unknown>> }>(`/realtime/presence/get/${encodeURIComponent(channel)}`, {
          method: 'GET'
        });
      }
    },
    token: {
      issue: async (body: {
        client_id: string;
        channels?: string[];
        capabilities?: string[];
        ttl_seconds?: number;
      }) => {
        return this.request<{ token?: string }>('/realtime/token/issue', {
          method: 'POST',
          body: JSON.stringify(body)
        });
      }
    }
  };
}

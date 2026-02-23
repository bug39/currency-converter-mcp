const SOURCE = "ECB/Frankfurter";

interface ResponseMeta {
  cached?: boolean;
  source?: string;
}

export function success(text: string, data: Record<string, unknown>, meta: ResponseMeta = {}) {
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      success: true,
      fetchedAt: new Date().toISOString(),
      source: meta.source ?? SOURCE,
      cached: meta.cached ?? false,
      ...data,
    },
  };
}

export function error(message: string, type: string = "UNKNOWN_ERROR") {
  return {
    content: [{ type: "text" as const, text: message }],
    structuredContent: { success: false, fetchedAt: new Date().toISOString(), error: { type, message } },
    isError: true,
  };
}

const DOH_TIMEOUT = 4_000
const DOH_PROVIDER_DEADLINE = 3_000
const DOH_TOTAL_DEADLINE = 8_000
const CACHE_TTL_MIN = 60_000

const DOH_PROVIDERS = [
  `https://dns.google/resolve?name=api.telegram.org&type=A`,
  `https://cloudflare-dns.com/dns-query?name=api.telegram.org&type=A`,
]

const SEED_FALLBACK_IPS = ["149.154.167.220"]

let ipCache: { ips: string[]; ts: number } | null = null

async function fetchWithTimeout(url: string, timeout: number): Promise<Response | null> {
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), timeout)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/dns-json" },
    })
    clearTimeout(id)
    return res
  } catch {
    return null
  }
}

async function resolveViaDoh(providerUrl: string): Promise<string[]> {
  const res = await fetchWithTimeout(providerUrl, DOH_PROVIDER_DEADLINE)
  if (!res || !res.ok) return []
  const data = (await res.json()) as { Answer?: { data: string; TTL: number }[] }
  if (!data.Answer) return []
  return data.Answer.map((a) => a.data).filter((ip) => !ip.includes(":"))
}

async function resolveTelegramIps(): Promise<string[]> {
  if (ipCache && Date.now() - ipCache.ts < CACHE_TTL_MIN) {
    return ipCache.ips
  }

  const start = Date.now()
  const results = await Promise.allSettled(DOH_PROVIDERS.map((url) => resolveViaDoh(url)))

  const discovered = new Set<string>()
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const ip of r.value) discovered.add(ip)
    }
  }

  let ips = [...discovered]
  if (ips.length === 0) {
    ips = [...SEED_FALLBACK_IPS]
  }

  const elapsed = Date.now() - start
  if (elapsed < DOH_TOTAL_DEADLINE) {
    const remaining = DOH_TOTAL_DEADLINE - elapsed
    for (const url of DOH_PROVIDERS) {
      if (Date.now() - start >= DOH_TOTAL_DEADLINE) break
      const res = await fetchWithTimeout(url, Math.min(remaining, DOH_PROVIDER_DEADLINE))
      if (res && res.ok) {
        const data = (await res.json()) as { Answer?: { data: string; TTL: number }[] }
        if (data.Answer) {
          for (const a of data.Answer) {
            if (!a.data.includes(":")) discovered.add(a.data)
          }
        }
      }
    }
    if (discovered.size > 0) {
      ips = [...discovered]
    }
  }

  ipCache = { ips, ts: Date.now() }
  return ips
}

export function createFallbackFetch(proxyUrl?: string): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const parsed = new URL(url)

    if (proxyUrl && parsed.hostname === "api.telegram.org") {
      const proxyParsed = new URL(proxyUrl)
      try {
        const proxyInit = { ...init }
        const proxyRes = await fetch(
          `${proxyParsed.protocol}//${proxyParsed.host}${proxyParsed.pathname}${parsed.pathname}${parsed.search}`,
          {
            ...proxyInit,
            headers: { ...(proxyInit.headers as Record<string, string>), host: parsed.host },
          },
        )
        if (proxyRes.ok) return proxyRes
      } catch {}
    }

    if (parsed.hostname !== "api.telegram.org") {
      return fetch(input, init)
    }

    const ips = await resolveTelegramIps()
    let lastErr: unknown

    for (const ip of ips) {
      try {
        const fallbackUrl = `${parsed.protocol}//${ip}${parsed.pathname}${parsed.search}`
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), DOH_TIMEOUT)
        const res = await fetch(fallbackUrl, {
          ...init,
          signal: controller.signal,
          headers: {
            ...(init?.headers as Record<string, string>),
            host: parsed.host,
          },
        })
        clearTimeout(timeout)
        return res
      } catch (err) {
        lastErr = err
      }
    }

    try {
      return await fetch(input, init)
    } catch (err) {
      throw lastErr ?? err
    }
  }
}

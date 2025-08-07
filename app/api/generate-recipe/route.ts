import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import { normalizeUrl } from "@/lib/markdown";

interface FormFields {
    cuisine: string | undefined,
    diet: string | undefined,
    include: Array<string> | undefined,
    exclude: Array<string> | undefined,


}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const groundingTool = {
    googleSearch: {}
}

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 7000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const merged: RequestInit = { ...init, signal: controller.signal };
    return fetch(input, merged).finally(() => clearTimeout(id));
}

async function resolveVertexRedirect(u: string): Promise<string> {
    const isVertex = (h: string) => /(^|\.)vertexaisearch\.cloud\.google\.com$/i.test(h);
    let finalUrl = u;
    try {
        // Attempt to decode base64 payload embedded in the path
        try {
            const urlObj = new URL(u);
            if (isVertex(urlObj.hostname)) {
                const path = urlObj.pathname || "";
                const ix = path.indexOf("/grounding-api-redirect/");
                if (ix !== -1) {
                    const payload = path.slice(ix + "/grounding-api-redirect/".length);
                    // Some payloads are URL-safe base64; normalize and try both raw and decodedURIComponent
                    const tryDecode = (s: string) => {
                        const norm = s.replace(/-/g, "+").replace(/_/g, "/");
                        // pad to length multiple of 4 correctly
                        const padLen = (4 - (norm.length % 4)) % 4;
                        const padded = norm + "=".repeat(padLen);
                        try {
                            if (typeof Buffer !== "undefined") {
                                return Buffer.from(padded, "base64").toString("utf8");
                            }
                        } catch { }
                        try {
                            // atob works with standard base64 (not url-safe); use padded
                            const bin = (globalThis as any).atob ? (globalThis as any).atob(padded) : "";
                            return decodeURIComponent(Array.prototype.map.call(bin, (c: string) =>
                                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                            ).join(''));
                        } catch {
                            return "";
                        }
                    };
                    const decoded1 = tryDecode(payload);
                    const decoded2 = tryDecode(decodeURIComponent(payload));
                    const decoded = decoded1.length >= decoded2.length ? decoded1 : decoded2;
                    if (decoded) {
                        const match = decoded.match(/https?:\/\/[^\s"'>)]+/i);
                        if (match?.[0] && !/vertexaisearch\.cloud\.google\.com/i.test(match[0])) {
                            return normalizeUrl(match[0]);
                        }
                    }
                }
            }
        } catch {
            // ignore and continue
        }

        // Try HEAD then GET to follow HTTP redirects
        try {
            const headResp = await fetchWithTimeout(u, { method: 'HEAD', redirect: 'follow' as RequestRedirect });
            finalUrl = headResp.url || u;
        } catch {
            const getResp = await fetchWithTimeout(u, { method: 'GET', redirect: 'follow' as RequestRedirect });
            finalUrl = getResp.url || u;
        }

        const parsed = new URL(finalUrl);
        if (!isVertex(parsed.hostname)) {
            return normalizeUrl(finalUrl);
        }

        // If still on vertex domain (non-HTTP redirect), fetch body and attempt to extract destination
        const bodyResp = await fetchWithTimeout(u, { method: 'GET' });
        const html = await bodyResp.text();
        // Look for meta refresh
        const metaMatch = html.match(/http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"']*url=([^"';>]+)["']/i);
        if (metaMatch?.[1]) {
            const candidate = metaMatch[1].trim();
            if (/^https?:\/\//i.test(candidate) && !/vertexaisearch\.cloud\.google\.com/i.test(candidate)) {
                return normalizeUrl(candidate);
            }
        }
        // Look for first anchor with absolute http(s) href not pointing to vertex domain
        const anchorMatch = html.match(/<a\s+[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/i);
        if (anchorMatch?.[1] && !/vertexaisearch\.cloud\.google\.com/i.test(anchorMatch[1])) {
            return normalizeUrl(anchorMatch[1]);
        }
    } catch {
        // ignore and fall through
    }
    return u;
}

async function resolveCanonicalOrFinal(u: string): Promise<string> {
    const STOP = new Set([
        'easy', 'best', 'quick', 'simple', 'classic', 'authentic', 'healthy', 'keto', 'low', 'low-carb', 'gluten', 'gluten-free', 'vegan', 'vegetarian', 'paleo', 'dairy-free', 'spicy', 'russian', 'italian', 'mexican', 'thai', 'greek', 'indian', 'recipe', 'recipes',
        'with', 'and', 'or', 'the', 'a', 'an', 'to', 'of', 'on', 'in'
    ]);
    const CORRECT: Record<string, string> = { 'ukranian': 'ukrainian' };
    const tokensFromPath = (path: string) => {
        return path
            .toLowerCase()
            .replace(/[^a-z0-9\/-]+/g, '-')
            .split(/[\/-]+/)
            .filter(Boolean)
            .map(t => CORRECT[t] || t)
            .filter(t => !STOP.has(t) && !/^\d+$/.test(t));
    };
    const scoreText = (text: string, toks: string[]) => {
        const hay = text.toLowerCase();
        let s = 0;
        for (const t of toks) if (t.length >= 3 && hay.includes(t)) s++;
        return s;
    };
    const pickBestByTokens = (candidates: string[], toks: string[]) => {
        let best = candidates[0] || u;
        let bestScore = -1;
        for (const c of candidates) {
            try {
                const url = new URL(c, u).toString();
                const path = new URL(url).pathname;
                const s = scoreText(path, toks);
                if (s > bestScore) { bestScore = s; best = url; }
            } catch { }
        }
        return best;
    };
    const siteSearchWordPress = async (origin: string, toks: string[]) => {
        const q = encodeURIComponent(toks.join(' '));
        const searchUrl = `${origin}/?s=${q}`;
        const res = await fetchWithTimeout(searchUrl, { method: 'GET' }, 7000);
        const html = await res.text();
        const re = new RegExp(`href=["'](${origin.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}[^"'#]+)["']`, 'ig');
        const cands = new Set<string>();
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) cands.add(m[1]);
        return pickBestByTokens(Array.from(cands), toks);
    };
    const siteSearchFood = async (toks: string[]) => {
        const q = encodeURIComponent(toks.join(' '));
        const searchUrl = `https://www.food.com/search/${q}`;
        const res = await fetchWithTimeout(searchUrl, { method: 'GET' }, 7000);
        const html = await res.text();
        const re = /href=["'](https?:\/\/www\.food\.com\/recipe\/[^"']+)["']/ig;
        const cands: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(html))) cands.push(m[1]);
        return pickBestByTokens(cands, toks);
    };
    const maybeImproveBySearch = async (current: string, toks: string[]) => {
        try {
            const url = new URL(current);
            const origin = `${url.protocol}//${url.host}`;
            if (/thenewbaguette\.com$/i.test(url.hostname)) {
                return await siteSearchWordPress(origin, toks);
            }
            if (/^www\.food\.com$/i.test(url.hostname)) {
                return await siteSearchFood(toks);
            }
        } catch { }
        return current;
    };
    try {
        const resp = await fetchWithTimeout(u, { method: 'GET', redirect: 'follow' as RequestRedirect });
        const dest = resp.url || u;
        const statusOk = (resp as any).ok === true;
        const html = await resp.text();

        // If we were redirected somewhere else, prefer that
        if (dest && dest !== u) return normalizeUrl(dest);

        // Try canonical or og:url hints
        const canonMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i);
        let candidate = canonMatch?.[1];
        if (!candidate) {
            const ogMatch = html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["'][^>]*>/i);
            candidate = ogMatch?.[1];
        }
        if (candidate) {
            try {
                const base = new URL(u);
                const abs = new URL(candidate, base).toString();
                return normalizeUrl(abs);
            } catch {/* ignore */ }
        }

        const toks = tokensFromPath(new URL(u).pathname);

        // If not OK or looks like a not-found page, try slug corrections on same origin
        const looks404 = !statusOk || /404|not\s+found|page\s+not\s+found/i.test(html);
        if (looks404) {
            try {
                const baseUrl = new URL(u);
                const parts = baseUrl.pathname.split('/').filter(Boolean);
                if (parts.length) {
                    const last = parts[parts.length - 1];
                    const tokens = last.split('-').filter(Boolean);
                    const filtered = tokens.filter(t => !STOP.has(t.toLowerCase()));
                    const candidates = new Set<string>();
                    if (filtered.length) {
                        candidates.add(filtered.join('-'));
                        // singularize simple plural
                        if (filtered[filtered.length - 1].endsWith('s')) {
                            const copy = [...filtered];
                            copy[copy.length - 1] = copy[copy.length - 1].replace(/s$/, '');
                            candidates.add(copy.join('-'));
                        }
                    }
                    if (tokens.length > 1) {
                        candidates.add(tokens.slice(1).join('-'));
                    }

                    for (const slug of Array.from(candidates).slice(0, 3)) {
                        const candidateUrl = `${baseUrl.origin}/${slug}/`;
                        try {
                            const head = await fetchWithTimeout(candidateUrl, { method: 'HEAD', redirect: 'follow' as RequestRedirect }, 5000);
                            if ((head as any).ok) return normalizeUrl((head as any).url || candidateUrl);
                            const get = await fetchWithTimeout(candidateUrl, { method: 'GET', redirect: 'follow' as RequestRedirect }, 7000);
                            if ((get as any).ok) {
                                const dest2 = (get as any).url || candidateUrl;
                                // Check canonical on the resolved page too
                                const html2 = await get.text();
                                const c2 = html2.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
                                if (c2) {
                                    try { return normalizeUrl(new URL(c2, dest2).toString()); } catch { }
                                }
                                return normalizeUrl(dest2);
                            }
                        } catch { /* try next */ }
                    }
                }
            } catch { /* ignore */ }
        }
    } catch { /* ignore */ }
    return u;
}

async function rewriteLinksToDirect(input: string): Promise<string> {
    if (!input) return input;
    let out = input;
    // First pass: normalize query-parameter based redirects and trackers
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
        const normalized = normalizeUrl(String(url));
        return `[${text}](${normalized})`;
    });
    out = out.replace(/https?:\/\/[^\s)\]]+/g, (url) => normalizeUrl(String(url)));

    // Second pass: resolve Vertex AI grounding redirect URLs
    const vertexRegex = /https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s)\]]+/g;
    const matches = Array.from(new Set(out.match(vertexRegex) || []));
    if (matches.length === 0) return out;

    const resolutions = await Promise.all(matches.map(async (m) => [m, await resolveVertexRedirect(m)] as const));

    for (const [from, to] of resolutions) {
        if (to && to !== from) {
            const safeFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(safeFrom, 'g');
            out = out.replace(re, to);
        }
    }

    // Third pass: verify and canonicalize all remaining URLs (limit to a few to avoid latency)
    const urlRegex = /https?:\/\/[^\s)\]]+/g;
    const allUrls = Array.from(new Set(out.match(urlRegex) || [])).slice(0, 5);
    if (allUrls.length) {
        const checked = await Promise.all(allUrls.map(async (u) => [u, await resolveCanonicalOrFinal(u)] as const));
        for (const [from, to] of checked) {
            if (to && to !== from) {
                const safeFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const re = new RegExp(safeFrom, 'g');
                out = out.replace(re, to);
            }
        }
    }

    return out;
}

export async function POST(request: NextRequest) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: "Server not configured: GEMINI_API_KEY is missing." },
                { status: 500 }
            );
        }

        const body = await request.json().catch(() => ({}));

        const cuisine = typeof body?.cuisine === 'string' ? body.cuisine.trim() : undefined;
        const diet = typeof body?.diet === 'string' ? body.diet.trim() : undefined;
        const includeArr: string[] = Array.isArray(body?.include)
            ? body.include.filter(Boolean)
            : typeof body?.include === 'string' && body.include.trim().length
                ? body.include.split(',').map((s: string) => s.trim()).filter(Boolean)
                : [];
        const excludeArr: string[] = Array.isArray(body?.exclude)
            ? body.exclude.filter(Boolean)
            : typeof body?.exclude === 'string' && body.exclude.trim().length
                ? body.exclude.split(',').map((s: string) => s.trim()).filter(Boolean)
                : [];

        const hasAny = Boolean(cuisine || diet || includeArr.length || excludeArr.length);

        // Build a concrete Google Search query from the inputs
        const base = [cuisine, diet].filter(Boolean).join(" ").trim();
        const includePhrase = includeArr.length ? ` with ${includeArr.join(" ")}` : "";
        const excludePhrase = excludeArr.length ? ` ${excludeArr.map(i => `-${i}`).join(" ")}` : "";
        const searchQuery = hasAny
            ? `simple easy ${base} recipe${includePhrase}${excludePhrase}`.replace(/\s+/g, " ").trim()
            : "simple beginner-friendly popular easy weeknight recipe";

        const prompt = `You have access to the googleSearch tool. First, CALL googleSearch using this exact query string and review the top results to ground your answer:
Query: "${searchQuery}"

Then synthesize ONE clear, concise recipe that best matches the user's intent and the retrieved sources.

Output a friendly recipe with:
- Title
- Ingredients with amounts
- Step-by-step instructions (5–8 steps)
- Estimated total time and servings
 At the end, list 1–3 source URLs you used as full https:// links (no redirects/shorteners; remove tracking params).\n\n STRICT: Never output URLs from the domain vertexaisearch.cloud.google.com or any redirector domains; only output the final publisher's direct URL (e.g., the recipe site).`;

        const result: any = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ],
            config: { tools: [groundingTool] }
        });

        const text = typeof result?.response?.text === 'function'
            ? result.response.text()
            : (result?.text ?? '');

        // const cleaned = await rewriteLinksToDirect(text);
        return NextResponse.json({ recipe: text });
    } catch (err) {
        console.error('generate-recipe error', err);
        return NextResponse.json(
            { error: 'Failed to generate recipe. Please try again.' },
            { status: 500 }
        );
    }
}

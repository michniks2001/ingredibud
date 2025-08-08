import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { normalizeUrl } from "@/lib/markdown";

// Ensure we use Node runtime for streaming compatibility
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Re-introducing a lightweight URL cleaner
function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 3000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const merged: RequestInit = { ...init, signal: controller.signal };
    return fetch(input, merged).finally(() => clearTimeout(id));
}

async function resolveVertexRedirect(u: string): Promise<string> {
    try {
        const headResp = await fetchWithTimeout(u, { method: 'HEAD', redirect: 'follow' });
        if (headResp.ok && headResp.url && !/vertexaisearch\.cloud\.google\.com/i.test(headResp.url)) {
            return normalizeUrl(headResp.url);
        }
    } catch {
        // Fallback to GET if HEAD fails (some servers don't support it)
        try {
            const getResp = await fetchWithTimeout(u, { method: 'GET', redirect: 'follow' });
            if (getResp.ok && getResp.url && !/vertexaisearch\.cloud\.google\.com/i.test(getResp.url)) {
                return normalizeUrl(getResp.url);
            }
        } catch { /* Suppress errors and return original URL */ }
    }
    return u; // Return original URL if resolution fails
}

async function rewriteLinksToDirect(input: string): Promise<string> {
    if (!input) return input;

    const vertexRegex = /https?:\/\/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect\/[^\s)\]]+/g;
    const matches = Array.from(new Set(input.match(vertexRegex) || []));
    if (matches.length === 0) return input;

    let out = input;
    const resolutions = await Promise.all(matches.map(async (m) => [m, await resolveVertexRedirect(m)] as const));

    for (const [from, to] of resolutions) {
        if (to && to !== from) {
            const safeFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            out = out.replace(new RegExp(safeFrom, 'g'), to);
        }
    }
    return out;
}

// Remove any model-emitted URLs so we can inject trusted citations only
function stripModelUrls(input: string): string {
    if (!input) return input;
    // Remove markdown links [text](http...)
    let s = input.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi, "$1");
    // Remove bare URLs
    s = s.replace(/https?:\/\/[^\s<)]+/gi, "");
    return s;
}

// Minimal types for grounding metadata to avoid using 'any'
type GroundingChunkWeb = { uri?: string; title?: string };
type GroundingChunk = { web?: GroundingChunkWeb };
type GroundingSupport = { groundingChunkIndices?: number[] };
type GroundingMetadata = { groundingChunks?: GroundingChunk[]; groundingSupports?: GroundingSupport[] };
type Candidate = { groundingMetadata?: GroundingMetadata };
type GenerateContentResponseLike = { candidates?: Candidate[]; text?: string };

// Extract grounded URLs (and optional titles) from Google Search grounding metadata
function extractGroundedSources(response: GenerateContentResponseLike | undefined): { url: string; title?: string }[] {
    const cand = response?.candidates?.[0];
    const gm = cand?.groundingMetadata;
    const chunks: GroundingChunk[] = gm?.groundingChunks || [];
    const supports: GroundingSupport[] = gm?.groundingSupports || [];

    const indexSet = new Set<number>();
    for (const s of supports) {
        const indices: number[] = s?.groundingChunkIndices || [];
        for (const i of indices) indexSet.add(i);
    }

    const pickAll = indexSet.size === 0; // fallback if no supports
    const seen = new Set<string>();
    const out: { url: string; title?: string }[] = [];

    const addByIndex = (i: number) => {
        const ch = chunks[i];
        const uri = ch?.web?.uri as string | undefined;
        if (!uri) return;
        const norm = normalizeUrl(uri);
        if (!/^https?:\/\//i.test(norm)) return;
        if (seen.has(norm)) return;
        seen.add(norm);
        const title = ch?.web?.title as string | undefined;
        out.push({ url: norm, title });
    };

    if (pickAll) {
        for (let i = 0; i < chunks.length; i++) addByIndex(i);
    } else {
        for (const i of indexSet) addByIndex(i);
    }

    return out.slice(0, 3);
}


export async function POST(request: NextRequest) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            return new Response(
                JSON.stringify({ error: "Server not configured: GEMINI_API_KEY is missing." }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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

        const base = [cuisine, diet].filter(Boolean).join(" ").trim();
        const includePhrase = includeArr.length ? ` with ${includeArr.join(" ")}` : "";
        const excludePhrase = excludeArr.length ? ` ${excludeArr.map(i => `-${i}`).join(" ")}` : "";
        const searchQuery = hasAny
            ? `simple easy ${base} recipe${includePhrase}${excludePhrase}`.replace(/\s+/g, " ").trim()
            : "simple beginner-friendly popular easy weeknight recipe";

        const prompt = `Based on a Google Search for "${searchQuery}", synthesize ONE clear, concise recipe.
Output a friendly recipe with:
- Title
- Ingredients with amounts
- Step-by-step instructions (5–8 steps)
- Estimated total time and servings.

Important:
- Do NOT include any URLs or link references in the recipe body.
- You may reference facts, but leave citations to the system. The server will attach sources from Google Search grounding.`;

        // Streamed generation with Google Search grounding enabled
        const stream = await ai.models.generateContentStream({
            model: "gemini-2.5-pro",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: { tools: [{ googleSearch: {} }] }
        });

        const encoder = new TextEncoder();
        let lastResponse: GenerateContentResponseLike | undefined;

        const readable = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    // Stream the body text as it arrives, stripping any URLs in the body
                    for await (const chunk of stream as AsyncGenerator<GenerateContentResponseLike>) {
                        lastResponse = chunk;
                        const piece = stripModelUrls(chunk?.text || "");
                        if (piece) controller.enqueue(encoder.encode(piece));
                    }

                    // Append Sources section from grounding metadata at the end
                    const sources = extractGroundedSources(lastResponse);
                    if (sources.length) {
                        const sourcesMd = "\n\nSources:\n" + sources
                            .map(s => s.title ? `- [${s.title}](${s.url})` : `- ${s.url}`)
                            .join("\n");
                        const cleaned = await rewriteLinksToDirect(sourcesMd);
                        controller.enqueue(encoder.encode(cleaned));
                    }
                } catch {
                    // Best-effort error note in stream
                    controller.enqueue(encoder.encode("\n\n[An error occurred while streaming the response.]"));
                } finally {
                    controller.close();
                }
            }
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/markdown; charset=utf-8',
                'Cache-Control': 'no-cache',
                'X-Content-Type-Options': 'nosniff'
            }
        });

    } catch (err: unknown) {
        console.error('generate-recipe error', err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        return new Response(
            JSON.stringify({ error: `Failed to generate recipe. ${errorMessage}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

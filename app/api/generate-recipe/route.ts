import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { normalizeUrl } from "@/lib/markdown";

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
    } catch (e) {
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

        const prompt = `Based on a Google search for "${searchQuery}", synthesize ONE clear, concise recipe. Output a friendly recipe with: - Title - Ingredients with amounts - Step-by-step instructions (5–8 steps) - Estimated total time and servings. At the end, list 1–3 source URLs you used as full https:// links.`;

        const result = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            tools: [{ googleSearch: {} }] // Explicitly enable the search tool
        });

        const text = result.text;
        const cleanedText = await rewriteLinksToDirect(text);

        return NextResponse.json({ recipe: cleanedText });

    } catch (err: unknown) {
        console.error('generate-recipe error', err);
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        return new Response(
            JSON.stringify({ error: `Failed to generate recipe. ${errorMessage}` }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

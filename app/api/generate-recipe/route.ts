import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { normalizeUrl } from "@/lib/markdown";

// Use Edge runtime for best streaming behavior on Vercel
export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Helper to format text as an SSE data event
function sseData(text: string): string {
    const lines = (text || '').split('\n');
    return lines.map(l => `data: ${l}`).join('\n') + '\n\n';
}

// Removed redirect-resolution helpers in streaming Edge path to avoid extra network latency

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

        const encoder = new TextEncoder();
        let lastResponse: GenerateContentResponseLike | undefined;

        let keepAlive: ReturnType<typeof setInterval> | undefined;
        const readable = new ReadableStream<Uint8Array>({
            async start(controller) {
                try {
                    // Flush headers early and keep alive until first token
                    controller.enqueue(encoder.encode(': init\n\n'));
                    let hasFirstChunk = false;
                    keepAlive = setInterval(() => {
                        if (!hasFirstChunk) controller.enqueue(encoder.encode(': keep-alive\n\n'));
                    }, 3000);

                    // Streamed generation with Google Search grounding enabled (start inside stream)
                    const stream = await ai.models.generateContentStream({
                        model: "gemini-2.5-pro",
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        config: {
                            tools: [{ googleSearch: {} }],
                            maxOutputTokens: 600,
                            temperature: 0.6
                        }
                    });

                    const startedAt = Date.now();
                    const deadlineMs = 55000; // end gracefully before platform limit

                    // Stream the body text as it arrives, stripping any URLs in the body
                    let lastWithGM: GenerateContentResponseLike | undefined;
                    for await (const chunk of stream as AsyncGenerator<GenerateContentResponseLike>) {
                        lastResponse = chunk;
                        if (!hasFirstChunk) { hasFirstChunk = true; clearInterval(keepAlive); }
                        const gm = chunk?.candidates?.[0]?.groundingMetadata;
                        if (gm && ((gm.groundingChunks?.length ?? 0) > 0 || (gm.groundingSupports?.length ?? 0) > 0)) {
                            lastWithGM = chunk;
                        }
                        const piece = stripModelUrls(chunk?.text || "");
                        if (piece) controller.enqueue(encoder.encode(sseData(piece)));
                        if (Date.now() - startedAt > deadlineMs) {
                            controller.enqueue(encoder.encode(sseData("\n[Ending early due to time limits]\n")));
                            break;
                        }
                    }

                    // Append Sources section from grounding metadata at the end
                    const sources = extractGroundedSources(lastWithGM || lastResponse);
                    if (sources.length) {
                        const sourcesMd = "\n\nSources:\n" + sources
                            .map(s => s.title ? `- [${s.title}](${s.url})` : `- ${s.url}`)
                            .join("\n");
                        controller.enqueue(encoder.encode(sseData(sourcesMd)));
                    }
                } catch {
                    // Best-effort error note in stream
                    controller.enqueue(encoder.encode(sseData("\n[An error occurred while streaming the response.]\n")));
                } finally {
                    // Ensure keep-alive is cleared
                    if (keepAlive) clearInterval(keepAlive);
                    controller.close();
                }
            }
        });

        return new Response(readable, {
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-store',
                'Connection': 'keep-alive',
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

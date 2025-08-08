"use client";

import { useState } from "react";
import { markdownToHtml } from "@/lib/markdown";

export default function RecipeForm() {
    const [cuisine, setCuisine] = useState("");
    const [diet, setDiet] = useState("");
    const [include, setInclude] = useState("");
    const [exclude, setExclude] = useState("");
    const [recipeHtml, setRecipeHtml] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError("");
        setRecipeHtml("");
        setOpen(true);

        try {
            const res = await fetch("/api/generate-recipe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cuisine: cuisine || undefined,
                    diet: diet || undefined,
                    include: include || undefined,
                    exclude: exclude || undefined,
                }),
            });

            if (!res.ok) {
                const msg = await res.text().catch(() => "");
                throw new Error(msg || "Failed to generate recipe");
            }

            if (!res.body) {
                throw new Error("No response body received");
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            let md = "";
            const processBuffer = () => {
                // SSE events are separated by double newlines
                let idx;
                while ((idx = buffer.indexOf("\n\n")) !== -1) {
                    const rawEvent = buffer.slice(0, idx);
                    buffer = buffer.slice(idx + 2);
                    const lines = rawEvent.split("\n");
                    // Ignore comment/keep-alive lines starting with ':'
                    const dataLines = lines.filter(l => l.startsWith("data: ")).map(l => l.slice(6));
                    if (dataLines.length) {
                        const chunk = dataLines.join("\n");
                        md += chunk;
                        setRecipeHtml(markdownToHtml(md));
                    }
                }
            };

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                processBuffer();
            }
            // Flush remaining
            buffer += decoder.decode();
            processBuffer();

        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("Something went wrong.");
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="max-w-2xl mx-auto p-4">
            <form onSubmit={onSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium mb-1">Cuisine (optional)</label>
                    <input
                        type="text"
                        value={cuisine}
                        onChange={(e) => setCuisine(e.target.value)}
                        placeholder="e.g. Italian, Mexican"
                        className="w-full border rounded px-3 py-2"
                        disabled={loading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Diet (optional)</label>
                    <input
                        type="text"
                        value={diet}
                        onChange={(e) => setDiet(e.target.value)}
                        placeholder="e.g. vegetarian, vegan, keto"
                        className="w-full border rounded px-3 py-2"
                        disabled={loading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Include ingredients (optional)</label>
                    <input
                        type="text"
                        value={include}
                        onChange={(e) => setInclude(e.target.value)}
                        placeholder="comma-separated, e.g. chicken, garlic, lemon"
                        className="w-full border rounded px-3 py-2"
                        disabled={loading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium mb-1">Exclude ingredients (optional)</label>
                    <input
                        type="text"
                        value={exclude}
                        onChange={(e) => setExclude(e.target.value)}
                        placeholder="comma-separated, e.g. nuts, dairy"
                        className="w-full border rounded px-3 py-2"
                        disabled={loading}
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-white shadow hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
                >
                    {loading && (
                        <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden>
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8
 0 018-8v4a4 4 0 00-4 4H4z"></path>
                        </svg>
                    )}
                    {loading ? "Generating…" : "Generate recipe"}
                </button>
            </form>

            {error && (
                <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>
            )}

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="max-w-2xl w-full rounded bg-white shadow-lg">
                        <div className="flex items-center justify-between border-b px-4 py-3">
                            <h2 className="font-semibold">Generated Recipe</h2>
                            <button
                                onClick={() => setOpen(false)}
                                className="rounded-md p-2 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer transition-transform duration-150 hover:rotate-90"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="max-h-[70vh] overflow-auto px-4 py-4">
                            {loading && !recipeHtml ? (
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden>
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                                    </svg>
                                    Generating…
                                </div>
                            ) : (
                                <article
                                    className="prose max-w-none"
                                    dangerouslySetInnerHTML={{ __html: recipeHtml }}
                                />
                            )}
                        </div>
                        <div className="flex justify-end gap-2 border-t px-4 py-3">
                            <button
                                onClick={() => setOpen(false)}
                                className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-95"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


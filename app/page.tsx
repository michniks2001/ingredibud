import Navbar from "@/components/navbar";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-amber-50 via-white to-white" />
          <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-24">
            <div className="max-w-3xl">
              <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200">AI + Google Search Grounding</span>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
                Find simple, delicious recipes in seconds
              </h1>
              <p className="mt-4 text-lg text-gray-600 md:text-xl">
                Tell us what you have, your diet, or a cuisine you love. We’ll craft a clear recipe grounded by real sources.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link href="/recipes" className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-white shadow hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
                  Get started
                </Link>
                <a href="#features" className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-5 py-3 text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 active:scale-95">
                  Learn more
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-12 md:py-16">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white/70 p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Grounded results</h3>
              <p className="mt-2 text-gray-600">Recipes are powered by Gemini and grounded via Google Search, with direct links to sources.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white/70 p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Simple + fast</h3>
              <p className="mt-2 text-gray-600">Clean ingredients, 5–8 steps, and quick time estimates make cooking stress-free.</p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white/70 p-6 shadow-sm">
              <h3 className="text-lg font-semibold">Personalized</h3>
              <p className="mt-2 text-gray-600">Filter by cuisine, diet, or include/exclude ingredients to fit your taste.</p>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center">
            <Link href="/recipes" className="inline-flex items-center justify-center rounded-lg bg-gray-900 px-5 py-3 text-white shadow hover:bg-black focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg active:scale-95">
              Try the Recipe Generator
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
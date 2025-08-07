import Navbar from "@/components/navbar";
import Link from "next/link";

export default function FaqPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold">FAQ</h1>
        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">How are recipes generated?</h2>
            <p className="mt-1 text-gray-700">We use Gemini with Google Search grounding to synthesize clear, simple recipes and include direct source links.</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Can I get a random recipe?</h2>
            <p className="mt-1 text-gray-700">Yes—go to the Recipes page and submit the form with no fields to get a simple, popular recipe.</p>
          </div>
          <div>
            <h2 className="text-lg font-semibold">Do you filter out redirect/tracking links?</h2>
            <p className="mt-1 text-gray-700">Yes. We unwrap common redirectors (including Vertex AI grounding) and strip typical tracking parameters.</p>
          </div>
        </div>
        <div className="mt-8">
          <Link href="/recipes" className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-white shadow hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500">
            Try the Recipe Generator
          </Link>
        </div>
      </main>
    </>
  );
}

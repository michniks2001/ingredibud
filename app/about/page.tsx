import Navbar from "@/components/navbar";
import Link from "next/link";

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold">About Ingredibud</h1>
        <p className="mt-4 text-gray-700">
          Ingredibud helps you quickly discover simple, reliable recipes powered by Gemini and grounded with Google Search. Enter a cuisine, diet, or ingredients, and we’ll craft a clear recipe with direct source links.
        </p>
        <p className="mt-4 text-gray-700">
          We focus on clarity, speed, and practicality—ingredients with amounts, 5–8 steps, and time/servings estimates.
        </p>
        <div className="mt-8">
          <Link href="/recipes" className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-5 py-3 text-white shadow hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500">
            Try the Recipe Generator
          </Link>
        </div>
      </main>
    </>
  );
}

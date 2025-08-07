import Link from "next/link";
import Navbar from "@/components/navbar";
import RecipeForm from "@/components/recipe-form";

export default function RecipesPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-[calc(100dvh-64px)] w-full">
        <section className="mx-auto max-w-3xl px-4 py-10">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Recipe Generator</h1>
          <p className="text-gray-600 mb-6">
            Describe what you’d like to cook, and we’ll generate a simple, grounded recipe. Leave fields empty for a random idea.
          </p>
          <div className="rounded-xl border border-gray-200 bg-white/70 shadow-sm p-4 md:p-6">
            <RecipeForm />
          </div>
          <div className="mt-6 text-sm text-gray-500">
            <Link href="/">← Back to home</Link>
          </div>
        </section>
      </main>
    </>
  );
}

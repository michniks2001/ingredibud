"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <nav className="sticky top-0 z-40 w-full border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2" onClick={close}>
          <span className="inline-block h-2 w-2 rounded-full bg-amber-600" />
          <h2 className="font-semibold text-xl text-gray-900">Ingredibud.io</h2>
        </Link>

        {/* Desktop Nav */}
        <ul className="hidden md:flex items-center gap-6 text-sm md:text-base">
          <li>
            <Link href="/" className="text-gray-700 hover:text-amber-700 transition-colors">
              Home
            </Link>
          </li>
          <li>
            <Link href="/recipes" className="text-gray-700 hover:text-amber-700 transition-colors">
              Recipes
            </Link>
          </li>
          <li>
            <Link href="/about" className="text-gray-700 hover:text-amber-700 transition-colors">
              About
            </Link>
          </li>
          <li>
            <Link href="/faq" className="text-gray-700 hover:text-amber-700 transition-colors">
              FAQ
            </Link>
          </li>
        </ul>

        {/* Mobile menu button */}
        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 cursor-pointer"
          aria-label="Toggle menu"
          aria-controls="mobile-menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Nav Panel */}
      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-gray-200 bg-white">
          <ul className="mx-auto max-w-6xl px-4 py-3 space-y-2">
            <li>
              <Link href="/" onClick={close} className="block rounded px-3 py-2 text-gray-800 hover:bg-gray-50">
                Home
              </Link>
            </li>
            <li>
              <Link href="/recipes" onClick={close} className="block rounded px-3 py-2 text-gray-800 hover:bg-gray-50">
                Recipes
              </Link>
            </li>
            <li>
              <Link href="/about" onClick={close} className="block rounded px-3 py-2 text-gray-800 hover:bg-gray-50">
                About
              </Link>
            </li>
            <li>
              <Link href="/faq" onClick={close} className="block rounded px-3 py-2 text-gray-800 hover:bg-gray-50">
                FAQ
              </Link>
            </li>
          </ul>
        </div>
      )}
    </nav>
  );
}

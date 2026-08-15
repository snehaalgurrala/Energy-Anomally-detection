import Link from "next/link";
import { PILL_BUTTON } from "@/lib/format";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <h1 className="text-lg font-semibold">Household not found</h1>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        No household exists for this meter ID.
      </p>
      <Link
        href="/households"
        className={`mt-2 ${PILL_BUTTON} py-2 hover:bg-black/[.04] dark:hover:bg-[#1a1a1a]`}
      >
        Back to Households
      </Link>
    </main>
  );
}

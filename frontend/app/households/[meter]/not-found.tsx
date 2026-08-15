import Link from "next/link";
import { PILL_BUTTON } from "@/lib/format";
import { StatusMessage } from "@/components/status-message";

export default function NotFound() {
  return (
    <StatusMessage
      title="Household not found"
      description="No household exists for this meter ID."
      action={
        <Link href="/households" className={`mt-2 ${PILL_BUTTON} py-2`}>
          Back to Households
        </Link>
      }
    />
  );
}

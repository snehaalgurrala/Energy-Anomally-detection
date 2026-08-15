import Link from "next/link";
import { PILL_BUTTON } from "@/lib/format";
import { StatusMessage } from "@/components/status-message";

export default function NotFound() {
  return (
    <StatusMessage
      title="Anomaly not found"
      description="No record exists for this meter and date combination."
      action={
        <Link href="/anomalies" className={`mt-2 ${PILL_BUTTON} py-2`}>
          Back to Anomalies
        </Link>
      }
    />
  );
}

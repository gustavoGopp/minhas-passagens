"use client";
import { ErrorView } from "@/components/error-view";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md px-6 py-16">
      <ErrorView error={error} retry={retry} />
    </div>
  );
}

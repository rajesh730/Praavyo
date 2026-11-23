import { after } from "next/server";

/**
 * Run notification fan-out after the response is sent, so approving or
 * posting feels instant while bells and devices are reached in the
 * background (Next keeps the function alive until `task` settles).
 *
 * Outside a request (scripts, tests) it simply runs now. Never throws.
 */
export function runAfterResponse(task) {
  const guarded = async () => {
    try {
      await task();
    } catch (error) {
      console.error("[afterResponse] background task failed:", error.message);
    }
  };
  try {
    after(guarded);
    return undefined;
  } catch {
    return guarded();
  }
}

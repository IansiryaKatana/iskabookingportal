const RELOAD_AT_KEY = "stale-chunk-reload-at";

export function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const name = error instanceof Error ? error.name : "";
  return (
    name === "ChunkLoadError" ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Unable to preload CSS")
  );
}

/** After a deploy, old hashed JS files 404 as HTML. Reload once to pick up the new index. */
export function reloadOnceForStaleChunk(): void {
  const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) ?? "0");
  if (Date.now() - last < 15_000) return;
  sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  window.location.reload();
}

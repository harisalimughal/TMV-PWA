/**
 * The git commit a build was made from, stamped into index.html as
 * `<meta name="tmv-build" content="...">` (see vite.config.ts) so anyone can see which
 * version a site is running.
 *
 * Order: GITHUB_SHA (set by GitHub Actions) shortened to 7 characters, else the local
 * `git rev-parse --short HEAD`, else "unknown". Pure: the caller passes the environment
 * and a function that runs git, so tests need neither.
 */
export const SHORT_SHA_LENGTH = 7;

export function resolveBuildSha(
  env: Record<string, string | undefined>,
  gitShortSha: () => string
): string {
  const githubSha = env.GITHUB_SHA?.trim();
  if (githubSha) return githubSha.slice(0, SHORT_SHA_LENGTH);
  try {
    const local = gitShortSha().trim();
    if (local) return local;
  } catch {
    // Not a git checkout, or git is not installed.
  }
  return "unknown";
}

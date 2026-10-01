/** GOAL-124: quarantine confirmed wrong media without deleting the original. */
export const BLOCKED_LOCAL_MEDIA: Readonly<Record<string, { reason: string; review: string }>> = {
  '/assets/exercises/mobility_alongamento_quadriceps/0.jpg': {
    reason: 'WRONG_EXERCISE',
    review: 'HUMAN_REVIEW_REQUIRED',
  },
};

export function isLocalMediaBlocked(path: string): boolean {
  return Object.hasOwn(BLOCKED_LOCAL_MEDIA, path);
}

export function usableLocalMediaPaths(paths: readonly string[]): string[] {
  return paths.filter(path => !isLocalMediaBlocked(path));
}

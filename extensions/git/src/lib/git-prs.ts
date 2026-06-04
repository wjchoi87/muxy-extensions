export function pr_state(pr: { state: string }): "open" | "closed" | "merged" {
  const s = pr.state.toLowerCase();
  if (s === "merged") return "merged";
  if (s === "closed") return "closed";
  return "open";
}

const RESOLVE_RETRIES = 3;
const RESOLVE_DELAY_MS = 1200;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function is_resolved(pr: MuxyGitPR): boolean {
  if (pr_state(pr) !== "open") return true;
  return pr.mergeable !== null && pr.checks.status !== "pending";
}

export async function fetch_resolved_status(): Promise<MuxyGitStatus> {
  let status = await muxy.git.status();
  for (let i = 0; i < RESOLVE_RETRIES; i++) {
    if (!status.pullRequest || is_resolved(status.pullRequest)) break;
    await delay(RESOLVE_DELAY_MS);
    status = await muxy.git.status();
  }
  return status;
}

export type MergeMethod = "merge" | "squash" | "rebase";

export function merge_pr(
  number: number,
  method: MergeMethod,
  deleteBranch: boolean,
): Promise<void> {
  return muxy.git.pr.merge({ number, method, deleteBranch });
}

export function close_pr(number: number): Promise<void> {
  return muxy.git.pr.close({ number });
}

export function create_pr(
  title: string,
  body: string,
  baseBranch: string | undefined,
  draft: boolean,
): Promise<MuxyGitPR> {
  return muxy.git.pr.create({ title, body, baseBranch, draft });
}

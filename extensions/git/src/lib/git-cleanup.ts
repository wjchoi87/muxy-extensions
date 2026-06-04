import { exec_git, git_output, active_worktree_path, alert_error } from "@/lib/git";

interface CleanupTarget {
  branch: string | null;
  defaultBranch: string | null;
  dirty: boolean;
}

export async function active_project_path(): Promise<string | undefined> {
  const projects = await muxy.projects.list().catch(() => [] as MuxyProject[]);
  const fromProjects = projects.find((p) => p.isActive)?.path ?? projects[0]?.path;
  if (fromProjects) return fromProjects;
  const active = await active_worktree();
  return active?.path ?? (await active_worktree_path());
}

export async function active_worktree(project?: string): Promise<MuxyWorktree | undefined> {
  const worktrees = await muxy.worktrees.list(project).catch(() => [] as MuxyWorktree[]);
  return worktrees.find((w) => w.isActive) ?? worktrees.find((w) => w.isPrimary);
}

export async function is_on_worktree(project?: string): Promise<boolean> {
  const cwd = (await active_worktree(project))?.path ?? (await active_worktree_path());
  const gitDir = await git_output(cwd, ["rev-parse", "--git-dir"]);
  const commonDir = await git_output(cwd, ["rev-parse", "--git-common-dir"]);
  if (gitDir !== null && commonDir !== null) return gitDir !== commonDir;

  const active = await active_worktree(project);
  return !!active && !active.isPrimary;
}

export async function remove_active_worktree(
  branch: string | null,
  force: boolean,
  project: string | undefined,
): Promise<void> {
  const worktrees = await muxy.worktrees.list(project).catch(() => [] as MuxyWorktree[]);
  const active = worktrees.find((w) => w.isActive) ?? worktrees.find((w) => w.isPrimary);
  if (!active || active.isPrimary) {
    throw new Error("No active worktree to remove.");
  }

  const replacement =
    worktrees.find((w) => w.isPrimary && w.id !== active.id) ??
    worktrees.find((w) => w.id !== active.id);
  if (replacement) {
    await muxy.git.worktree
      .switchTo({ project, identifier: replacement.path })
      .catch(() => muxy.worktrees.switchTo(replacement.path, project));
  }
  await muxy.git.worktree.remove({ project, path: active.path, force });
  if (branch) await muxy.git.branch.deleteRemote({ project, branch }).catch(() => undefined);
  await muxy.worktrees.refresh(project);
}

export async function remove_worktree_or_branch({
  branch,
  defaultBranch,
  dirty,
}: CleanupTarget): Promise<void> {
  const project = await active_project_path();

  if (await is_on_worktree(project)) {
    await remove_active_worktree(branch, dirty, project);
    return;
  }

  if (!branch) {
    throw new Error("No branch to clean up.");
  }
  if (branch === defaultBranch) {
    throw new Error(`"${branch}" is the default branch and won't be deleted.`);
  }

  const active = await active_worktree(project);
  const cwd = active?.path ?? (await active_worktree_path());
  const target = defaultBranch ?? "main";

  const switched = await exec_git(cwd, ["switch", target], `Could not switch to ${target}`);
  if (!switched) return;

  const current = await git_output(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (current === branch) {
    throw new Error(`Still on "${branch}" after switching to ${target}.`);
  }

  const deleted = await exec_git(cwd, ["branch", "-D", branch], "Could not delete branch");
  if (!deleted) return;

  await muxy.git.branch.deleteRemote({ project, branch }).catch(() => undefined);
  await muxy.worktrees.refresh(project);
}

export async function cleanup_branch(target: CleanupTarget): Promise<boolean> {
  if (!target.branch) return false;
  try {
    await remove_worktree_or_branch(target);
    return true;
  } catch (err) {
    await alert_error("Cleanup failed", err);
    return false;
  }
}

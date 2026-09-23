"""Package task changes since a Git commit without external dependencies."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path, PurePosixPath


EXCLUDED_DIRECTORIES = {
    ".git", "node_modules", ".wxt", ".output", "dist", "coverage",
    "artifacts", "__pycache__", ".pytest_cache",
}


def is_excluded(path: str, task_id: str | None = None) -> bool:
    """Return whether a repository-relative path belongs outside an artifact."""
    parts = PurePosixPath(path).parts
    if any(part in EXCLUDED_DIRECTORIES for part in parts):
        return True
    name = parts[-1] if parts else ""
    if name == ".env" or (name.startswith(".env.") and name != ".env.example"):
        return True
    if name.endswith(".pyc"):
        return True
    return bool(task_id and name == f"{task_id}-report.md")


def archive_name(repo_root: Path, relative_path: str) -> str:
    """Validate a Git path and return its repository-relative ZIP name."""
    if not relative_path or "\\" in relative_path or re.match(r"^[A-Za-z]:", relative_path):
        raise ValueError(f"Unsafe repository path: {relative_path!r}")
    posix_path = PurePosixPath(relative_path)
    if posix_path.is_absolute() or any(part in (".", "..") for part in relative_path.split("/")):
        raise ValueError(f"Unsafe repository path: {relative_path!r}")
    resolved_root = repo_root.resolve()
    resolved_file = (resolved_root / relative_path).resolve()
    if not resolved_file.is_relative_to(resolved_root):
        raise ValueError(f"Path escapes repository: {relative_path!r}")
    return posix_path.as_posix()


def git(repo_root: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", *args], cwd=repo_root, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, check=False,
    )
    if result.returncode:
        message = result.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"git {' '.join(args)} failed: {message}")
    return result.stdout


def git_paths(repo_root: Path, *args: str) -> set[str]:
    output = git(repo_root, *args)
    return {value.decode("utf-8", errors="surrogateescape") for value in output.split(b"\0") if value}


def repository_root() -> Path:
    script_dir = Path(__file__).resolve().parent
    root = Path(git(script_dir, "rev-parse", "--show-toplevel").decode("utf-8").strip()).resolve()
    if not (root / ".git").exists():
        raise RuntimeError(f"Invalid Git repository: {root}")
    return root


def package(task_id: str, base_sha: str, output_dir: str) -> tuple[Path, Path]:
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", task_id):
        raise ValueError("Task ID must contain only letters, digits, underscores, or hyphens")
    root = repository_root()
    validated_base = git(root, "rev-parse", "--verify", f"{base_sha}^{{commit}}").decode("ascii").strip()

    changed = git_paths(root, "diff", "--name-only", "-z", "--no-renames", "--diff-filter=ACMRT", validated_base, "--")
    changed |= git_paths(root, "ls-files", "--others", "--exclude-standard", "-z", "--")
    deleted = git_paths(root, "diff", "--name-only", "-z", "--no-renames", "--diff-filter=D", validated_base, "--")

    included: list[str] = []
    excluded: list[str] = []
    for relative_path in sorted(changed):
        name = archive_name(root, relative_path)
        if is_excluded(name, task_id):
            excluded.append(name)
        elif not (root / name).is_file():
            raise ValueError(f"Changed file is missing or not a regular file: {name}")
        else:
            included.append(name)
    for relative_path in deleted:
        archive_name(root, relative_path)

    target = Path(output_dir)
    if not target.is_absolute():
        target = root / target
    target = target.resolve()
    if not target.is_relative_to(root):
        raise ValueError(f"Output directory escapes repository: {target}")
    target.mkdir(parents=True, exist_ok=True)
    zip_path = target / f"{task_id}-changed-files.zip"
    manifest_path = target / f"{task_id}-manifest.json"

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in included:
            archive.write(root / name, arcname=name)

    manifest = {
        "task_id": task_id,
        "base_sha": validated_base,
        "created_or_modified": included,
        "deleted": sorted(deleted),
        "excluded": excluded,
        "zip_path": zip_path.relative_to(root).as_posix(),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return zip_path, manifest_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--base-sha", required=True)
    parser.add_argument("--output-dir", required=True)
    args = parser.parse_args()
    try:
        zip_path, manifest_path = package(args.task_id, args.base_sha, args.output_dir)
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as error:
        print(f"Artifact packaging failed: {error}", file=sys.stderr)
        return 1
    print(zip_path)
    print(manifest_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

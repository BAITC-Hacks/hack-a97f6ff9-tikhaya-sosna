"""Pure helper tests for task artifact packaging."""

import tempfile
import unittest
from pathlib import Path

from scripts.package_task_artifacts import archive_name, is_excluded


class ArtifactPathTests(unittest.TestCase):
    def test_excluded_directories_and_bytecode(self) -> None:
        for path in (
            "node_modules/test.js",
            "artifacts/EXT-01/report.md",
            "__pycache__/test.pyc",
        ):
            with self.subTest(path=path):
                self.assertTrue(is_excluded(path))

    def test_env_example_is_allowed(self) -> None:
        self.assertFalse(is_excluded("apps/extension/.env.example"))

    def test_secret_env_files_are_excluded(self) -> None:
        for path in (".env", ".env.local", "apps/extension/.env", "apps/extension/.env.local"):
            with self.subTest(path=path):
                self.assertTrue(is_excluded(path))

    def test_repository_relative_path_validation(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(archive_name(root, "apps/extension/file.ts"), "apps/extension/file.ts")
            for path in ("../secret.txt", "../../etc/passwd", "/etc/passwd", "C:/secret.txt"):
                with self.subTest(path=path), self.assertRaises(ValueError):
                    archive_name(root, path)

    def test_zip_path_preserves_directory(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertEqual(archive_name(Path(directory), "apps/extension/file.ts"), "apps/extension/file.ts")


if __name__ == "__main__":
    unittest.main()

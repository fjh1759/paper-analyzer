"""Unit checks only: there is no real paper PDF in the project."""

import hashlib
import importlib.util
import io
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / ".agents" / "skills" / "paper-analyzer" / "scripts" / "prepare_pdf.py"
spec = importlib.util.spec_from_file_location("paper_analyzer_prepare", SCRIPT)
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)


class PreparePdfChecks(unittest.TestCase):
    def test_root_and_schema_references_resolve(self):
        self.assertEqual(prepare.ROOT, ROOT)
        self.assertTrue(prepare.SCHEMA.is_file())

    def test_page_ranges_are_one_based_deduplicated_and_bounded(self):
        self.assertEqual(prepare.parse_pages("1,3-5,3", 8), [1, 3, 4, 5])
        for value in ["0", "9", "4-2", "1-9", "1.5", "", "1-2-3", "-1"]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                prepare.parse_pages(value, 8)

    def test_sparse_or_failed_text_is_flagged_not_treated_as_missing_scientific_content(self):
        self.assertIn("no_extractable_text", prepare.page_flags("  \n")[1])
        self.assertIn("sparse_text", prepare.page_flags("a short page")[1])
        self.assertIn("replacement_or_null_characters", prepare.page_flags("text\ufffd\x00")[1])
        self.assertEqual(prepare.page_flags("a" * 100)[1], [])

    def test_fingerprint_uses_exact_source_bytes(self):
        with tempfile.TemporaryDirectory(prefix="paper-analyzer-unit-") as directory:
            path = Path(directory) / "source.bin"
            path.write_bytes(b"unit test bytes, not a PDF")
            self.assertEqual(prepare.fingerprint(path), hashlib.sha256(path.read_bytes()).hexdigest())

    def test_missing_pdf_fails_without_publishing_analysis(self):
        with tempfile.TemporaryDirectory(prefix="paper-analyzer-unit-") as directory:
            missing = Path(directory) / "missing.pdf"
            with self.assertRaisesRegex(ValueError, "PDF not found"):
                prepare.prepare(str(missing))
            stdout, stderr = io.StringIO(), io.StringIO()
            with patch("sys.argv", [str(SCRIPT), "prepare", str(missing)]), redirect_stdout(stdout), redirect_stderr(stderr):
                self.assertEqual(prepare.main(), 1)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("PDF not found", stderr.getvalue())

    def test_renderer_rejects_a_manifest_outside_the_owned_cache(self):
        with self.assertRaisesRegex(ValueError, "inside .qa/paper-analyzer"):
            prepare.render(str(ROOT / "analysis" / "manifest.json"), "1")


if __name__ == "__main__":
    unittest.main()

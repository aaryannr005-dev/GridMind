"""Build GridMind's existing Python bridge as a self-contained Windows exe.

Run from the repository root on Windows:
    python -m pip install -r scripts/requirements-build.txt
    python scripts/build_engine.py
"""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "build"
BINARY = OUTPUT_DIR / "gridmind-engine.exe"


def main() -> int:
    if sys.platform != "win32":
        raise RuntimeError(
            "Build the Windows engine on Windows; PyInstaller does not cross-compile Windows executables"
        )
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    BINARY.unlink(missing_ok=True)
    (ROOT / "build" / "pyinstaller-spec").mkdir(parents=True, exist_ok=True)
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--console",
        "--collect-all",
        "tzdata",
        "--paths",
        str(ROOT / "src"),
        "--name",
        "gridmind-engine",
        "--distpath",
        str(OUTPUT_DIR),
        "--workpath",
        str(ROOT / "build" / "pyinstaller-work"),
        "--specpath",
        str(ROOT / "build" / "pyinstaller-spec"),
        str(ROOT / "scripts" / "gridmind_engine_entry.py"),
    ]
    subprocess.run(command, cwd=ROOT, check=True)
    if not BINARY.is_file() or BINARY.stat().st_size == 0:
        raise RuntimeError(f"PyInstaller did not produce the expected executable: {BINARY}")
    print(f"Built {BINARY} ({BINARY.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""PyInstaller entry point for the existing GridMind engine bridge."""

import sys

from gridmind.bridge import main


if __name__ == "__main__":
    # PyInstaller's Windows console process may otherwise choose the active
    # legacy code page for stdout; the JSON-lines protocol is always UTF-8.
    sys.stdout.reconfigure(encoding="utf-8")
    main()

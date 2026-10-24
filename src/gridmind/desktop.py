"""Desktop wrapper for the existing local Streamlit dashboard."""

from __future__ import annotations

import importlib.util
import logging
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Callable

DEFAULT_PORT = 8501
PORT_ATTEMPTS = 10
STARTUP_TIMEOUT_SECONDS = 30.0
HEALTH_PATH = "/_stcore/health"


class DesktopStartupError(RuntimeError):
    """A user-facing startup or prerequisite failure."""


def _app_script() -> Path:
    """Find the packaged Streamlit UI independently of the current directory."""
    candidate = Path(__file__).resolve().with_name("dashboard_app.py")
    if not candidate.is_file():
        raise DesktopStartupError(
            "The GridMind dashboard files are missing. Reinstall GridMind or launch it from its installed folder."
        )
    return candidate


def _log_path() -> Path:
    if sys.platform == "win32":
        root = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    else:
        root = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local" / "state"))
    return root / "GridMind" / "logs" / "desktop.log"


def _configure_logging() -> None:
    path = _log_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        handler = RotatingFileHandler(path, maxBytes=256_000, backupCount=2, encoding="utf-8")
    except OSError:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
        return
    logging.basicConfig(level=logging.INFO, handlers=[handler], format="%(asctime)s %(levelname)s %(message)s")


def _webview2_available() -> bool:
    if sys.platform != "win32":
        return True
    import winreg

    roots = (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE)
    access_modes = (winreg.KEY_READ, winreg.KEY_READ | getattr(winreg, "KEY_WOW64_32KEY", 0))
    for root in roots:
        for access in access_modes:
            try:
                clients = winreg.OpenKey(root, r"SOFTWARE\Microsoft\EdgeUpdate\Clients", 0, access)
            except OSError:
                continue
            with clients:
                index = 0
                while True:
                    try:
                        child_name = winreg.EnumKey(clients, index)
                    except OSError:
                        break
                    index += 1
                    try:
                        with winreg.OpenKey(clients, child_name) as child:
                            display_name, _ = winreg.QueryValueEx(child, "name")
                            version, _ = winreg.QueryValueEx(child, "pv")
                        if "webview2" in str(display_name).casefold() and str(version) not in ("", "0.0.0.0"):
                            return True
                    except OSError:
                        continue
    roots_to_check = [Path(os.environ.get(key, "")) for key in ("PROGRAMFILES(X86)", "PROGRAMFILES")]
    for root in roots_to_check:
        runtime_dir = root / "Microsoft" / "EdgeWebView" / "Application"
        try:
            if any((version / "msedgewebview2.exe").is_file() for version in runtime_dir.iterdir()):
                return True
        except OSError:
            pass
    return False


def _check_prerequisites() -> None:
    if importlib.util.find_spec("streamlit") is None:
        raise DesktopStartupError("GridMind's local dashboard component is missing. Reinstall GridMind with its desktop dependencies.")
    if importlib.util.find_spec("webview") is None:
        raise DesktopStartupError("The desktop window component is missing. Reinstall GridMind with its desktop dependencies.")
    if not _webview2_available():
        raise DesktopStartupError(
            "Microsoft Edge WebView2 Runtime is required. Install the Evergreen WebView2 Runtime from Microsoft, then restart GridMind."
        )


def _port_is_available(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((host, port))
        except OSError:
            return False
        return True


def _select_port(start: int = DEFAULT_PORT) -> int:
    for port in range(start, start + PORT_ATTEMPTS):
        if _port_is_available(port):
            return port
    raise DesktopStartupError(
        f"GridMind could not find an available local port in {start}–{start + PORT_ATTEMPTS - 1}. Close another GridMind window or application using these ports, then try again."
    )


def _healthy(url: str, timeout: float = 0.5) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            return response.status == 200 and response.read(64).strip() == b"ok"
    except (OSError, urllib.error.URLError):
        return False


class StreamlitService:
    """Own the local Streamlit process for the lifetime of the desktop window."""

    def __init__(
        self,
        app_script: Path,
        *,
        process_factory: Callable[..., subprocess.Popen] = subprocess.Popen,
        port_selector: Callable[[], int] = _select_port,
        health_check: Callable[[str], bool] = _healthy,
    ) -> None:
        self.app_script = Path(app_script).resolve()
        self.process_factory = process_factory
        self.port_selector = port_selector
        self.health_check = health_check
        self.process: subprocess.Popen | None = None
        self.port: int | None = None

    @property
    def url(self) -> str:
        if self.port is None:
            raise RuntimeError("Streamlit has not been started")
        return f"http://127.0.0.1:{self.port}"

    def start(self, timeout: float = STARTUP_TIMEOUT_SECONDS) -> str:
        self.port = self.port_selector()
        command = [
            sys.executable, "-m", "streamlit", "run", str(self.app_script),
            "--server.address=127.0.0.1", f"--server.port={self.port}",
            "--server.headless=true", "--browser.gatherUsageStats=false",
            "--global.developmentMode=false",
            "--server.enableCORS=true", "--server.enableXsrfProtection=true",
        ]
        options: dict[str, object] = {
            "cwd": str(self.app_script.parent),
            "stdin": subprocess.DEVNULL,
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if os.name == "nt":
            options["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        else:
            options["start_new_session"] = True
        try:
            logging.info("Starting local dashboard service on loopback port %s", self.port)
            self.process = self.process_factory(command, **options)
        except OSError as exc:
            raise DesktopStartupError("GridMind could not start its local dashboard service. Check the installation and try again.") from exc

        deadline = time.monotonic() + timeout
        health_url = f"{self.url}{HEALTH_PATH}"
        while time.monotonic() < deadline:
            if self.process.poll() is not None:
                self.stop()
                raise DesktopStartupError(
                    "GridMind's dashboard service stopped during startup. Check the installation and make sure ports 8501–8510 are available."
                )
            if self.health_check(health_url):
                logging.info("Local dashboard service is ready on loopback port %s", self.port)
                return self.url
            time.sleep(0.1)
        self.stop()
        raise DesktopStartupError(
            "GridMind's dashboard service did not become ready in time. Close another GridMind window or check whether security software is blocking local connections, then try again."
        )

    def stop(self, timeout: float = 5.0) -> None:
        process, self.process = self.process, None
        if process is None or process.poll() is not None:
            return
        logging.info("Stopping local dashboard service")
        try:
            try:
                process.terminate()
            except OSError:
                if process.poll() is not None:
                    return
                raise
            process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL, check=False,
                )
            else:
                import signal

                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except OSError:
                    process.kill()
            try:
                process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                logging.error("Dashboard process did not exit after forced shutdown")


def main() -> int:
    _configure_logging()
    try:
        _check_prerequisites()
        import webview

        service = StreamlitService(_app_script())
        try:
            url = service.start()
            window = webview.create_window("GridMind", url, min_size=(900, 650))
            window.events.closing += service.stop
            webview.start(debug=False)
        finally:
            service.stop()
        return 0
    except DesktopStartupError as exc:
        logging.error("Desktop startup failed: %s", exc)
        _show_error(f"GridMind could not start: {exc}")
        return 1
    except Exception as exc:
        logging.error("Unexpected desktop wrapper failure (%s)", type(exc).__name__)
        _show_error("GridMind could not open its desktop window. Check the desktop log for details.")
        return 1


def _show_error(message: str) -> None:
    if sys.platform == "win32":
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, message, "GridMind", 0x10)
    else:
        print(message, file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())

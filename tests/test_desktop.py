from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from gridmind.desktop import DesktopStartupError, StreamlitService, _select_port


class FakeProcess:
    def __init__(self, command, **options):
        self.command = command
        self.options = options
        self.returncode = None
        self.terminated = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = 0

    def wait(self, timeout=None):
        if self.returncode is None:
            raise subprocess.TimeoutExpired("process", timeout)
        return self.returncode

    def kill(self):
        self.returncode = -9


def service_for(tmp_path: Path, *, healthy=lambda _url: True, process_factory=FakeProcess):
    script = tmp_path / "folder with spaces" / "app.py"
    script.parent.mkdir()
    script.touch()
    created = []

    def factory(command, **options):
        process = process_factory(command, **options)
        created.append(process)
        return process

    service = StreamlitService(
        script,
        process_factory=factory,
        port_selector=lambda: 8765,
        health_check=healthy,
    )
    return service, created


def test_start_waits_for_health_and_uses_loopback_and_stable_path(tmp_path):
    checks = []

    def healthy(url):
        checks.append(url)
        return len(checks) == 2

    service, processes = service_for(tmp_path, healthy=healthy)
    assert service.start(timeout=1) == "http://127.0.0.1:8765"
    assert checks == [
        "http://127.0.0.1:8765/_stcore/health",
        "http://127.0.0.1:8765/_stcore/health",
    ]
    process = processes[0]
    assert process.command[0:5] == [process.command[0], "-m", "streamlit", "run", str(service.app_script)]
    assert "--server.address=127.0.0.1" in process.command
    assert process.options["cwd"] == str(service.app_script.parent)
    assert process.options["stdout"] == subprocess.DEVNULL


def test_start_reports_service_exit(tmp_path):
    def exited(command, **options):
        process = FakeProcess(command, **options)
        process.returncode = 3
        return process

    service, _ = service_for(tmp_path, healthy=lambda _url: False, process_factory=exited)
    with pytest.raises(DesktopStartupError, match="stopped during startup"):
        service.start(timeout=0.2)


def test_start_reports_readiness_timeout_and_stops_service(tmp_path):
    service, processes = service_for(tmp_path, healthy=lambda _url: False)
    with pytest.raises(DesktopStartupError, match="did not become ready"):
        service.start(timeout=0.01)
    assert processes[0].terminated
    assert service.process is None


def test_stop_is_safe_to_call_more_than_once(tmp_path):
    service, processes = service_for(tmp_path)
    service.start()
    service.stop()
    service.stop()
    assert processes[0].terminated
    assert service.process is None


def test_port_selector_reports_exhausted_range(monkeypatch):
    monkeypatch.setattr("gridmind.desktop._port_is_available", lambda _port: False)
    with pytest.raises(DesktopStartupError, match="available local port"):
        _select_port(start=9900)

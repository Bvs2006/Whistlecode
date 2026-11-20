from __future__ import annotations
from typing import Dict, Optional
from .base import BaseDriver, DriverHealth
from .browser import BrowserDriver
from .desktop import DesktopDriver
from .file import FileDriver


class DriverRegistry:
    """
    Driver registry keyed by surface ('browser', 'desktop', 'file').
    Executor calls drivers via this registry, never Playwright directly.
    """

    def __init__(self):
        self._drivers: Dict[str, BaseDriver] = {
            "browser": BrowserDriver(),
            "desktop": DesktopDriver(),
            "file": FileDriver(),
        }

    def register(self, surface: str, driver: BaseDriver) -> None:
        self._drivers[surface.lower()] = driver

    def get(self, surface: str) -> Optional[BaseDriver]:
        return self._drivers.get(surface.lower())

    async def teardown_all(self) -> None:
        for driver in list(self._drivers.values()):
            try:
                await driver.teardown()
            except Exception:
                pass

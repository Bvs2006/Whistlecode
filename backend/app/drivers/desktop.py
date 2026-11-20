from __future__ import annotations
from typing import Dict, Any, Optional, Tuple, List
from ..models.workflow import Step, TargetCandidate, Postcondition
from ..models.run import VerificationState
from .base import BaseDriver, DriverHealth


class DesktopDriver(BaseDriver):
    """
    Desktop automation driver stub (Windows desktop UI).
    Returns health 'unavailable' with a clear explanation until Stage: Desktop (Step 11).
    """

    def __init__(self):
        super().__init__(surface="desktop")

    async def health(self) -> DriverHealth:
        return DriverHealth(
            status="unavailable",
            surface="desktop",
            reason="Desktop automation is not yet available on this system (requires desktop driver setup in Step 11)",
            details={"platform": "windows", "enabled": False}
        )

    async def find_target(
        self,
        step: Step,
        candidates: Optional[List[TargetCandidate]] = None
    ) -> Tuple[Optional[Any], Optional[str], Optional[TargetCandidate]]:
        return None, "capability unavailable: Desktop automation driver is not installed", None

    async def act(
        self,
        step: Step,
        parameters: Dict[str, Any]
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        return False, "capability unavailable: Desktop automation driver is not installed", {"surface": "desktop"}

    async def observe(self, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        return {
            "surface": "desktop",
            "active_window": "",
            "status": "unavailable",
            "error": "capability unavailable"
        }

    async def verify(
        self,
        conditions: List[Postcondition],
        parameters: Dict[str, Any]
    ) -> Tuple[VerificationState, Dict[str, Any]]:
        return VerificationState.FAILED, {
            "surface": "desktop",
            "error": "capability unavailable: Desktop automation driver is not installed"
        }

    async def capture_state(self) -> Dict[str, Any]:
        return {
            "surface": "desktop",
            "status": "unavailable",
            "error": "capability unavailable"
        }

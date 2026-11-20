from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, Tuple, List
from pydantic import BaseModel, Field
from ..models.workflow import Step, TargetCandidate, Postcondition
from ..models.run import VerificationState


class DriverHealth(BaseModel):
    status: str  # "available" | "unavailable" | "degraded"
    surface: str  # "browser" | "desktop" | "file"
    reason: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class BaseDriver(ABC):
    """
    Abstract Driver interface (EXE-3 / Step 2).
    Every surface driver provides:
      - find_target: resolves ranked candidates
      - act: executes actions on the specific surface
      - observe: inspects the current surface state
      - verify: verifies postconditions against observed surface state
      - capture_state: takes a telemetry snapshot (DOM, active window, screenshot, etc.)
      - health: reports driver readiness and availability
    """

    def __init__(self, surface: str):
        self.surface = surface

    @abstractmethod
    async def health(self) -> DriverHealth:
        """Returns the operational availability of this driver."""
        pass

    @abstractmethod
    async def find_target(
        self,
        step: Step,
        candidates: Optional[List[TargetCandidate]] = None
    ) -> Tuple[Optional[Any], Optional[str], Optional[TargetCandidate]]:
        """
        Attempts to resolve a target from ranked candidates.
        Returns: (resolved_element, error_message, winning_candidate)
        """
        pass

    @abstractmethod
    async def act(
        self,
        step: Step,
        parameters: Dict[str, Any]
    ) -> Tuple[bool, Optional[str], Dict[str, Any]]:
        """
        Executes a step action on this driver's surface.
        Returns: (passed, error_message, observed_state)
        """
        pass

    @abstractmethod
    async def observe(self, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Observes and returns current surface state (e.g. current_url, active_window)."""
        pass

    @abstractmethod
    async def verify(
        self,
        conditions: List[Postcondition],
        parameters: Dict[str, Any]
    ) -> Tuple[VerificationState, Dict[str, Any]]:
        """Verifies postconditions against the current surface state."""
        pass

    @abstractmethod
    async def capture_state(self) -> Dict[str, Any]:
        """Captures a snapshot/telemetry of the surface."""
        pass

    async def start(self) -> None:
        """Initializes runtime resources (e.g., browser or OS session)."""
        pass

    async def teardown(self) -> None:
        """Releases all runtime resources."""
        pass

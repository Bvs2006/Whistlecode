from __future__ import annotations
import shutil
import uuid
import datetime
import re
import hashlib
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

SANDBOX_ROOT = Path(__file__).parent.parent / "sandbox_papers"
DOWNLOADS_DIR = SANDBOX_ROOT / "downloaded"


class PaperItem(BaseModel):
    filename: str
    relative_path: str
    suggested_category: str
    confidence: float
    needs_clarification: bool = False
    clarification_options: List[str] = []


class OrganizationPlanItem(BaseModel):
    filename: str
    source_path: str
    destination_path: str
    category: str
    risk: str = "medium"
    status: str = "proposed"


class PaperOrganizerManager:
    """
    Manages the Research Paper Organizer lifecycle:
    Scoped exclusively to the test folder sandbox.
    Reversible file operations with cryptographic undo tokens.
    """

    def __init__(self):
        self.undo_registry: Dict[str, Dict[str, Any]] = {}
        self.ensure_sandbox_structure()

    def ensure_sandbox_structure(self):
        DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
        # Ensure default papers exist
        defaults = {
            "attention_is_all_you_need_transformers.pdf": "Transformer, Self-Attention, Seq2Seq",
            "lora_low_rank_adaptation.pdf": "LoRA, Parameter-Efficient, Adapter",
            "alphago_reinforcement_learning.pdf": "AlphaGo, MCTS, Policy Gradient",
            "multimodal_vision_language_agents.pdf": "GUI, Vision-Language, VLM",
        }
        for name, content in defaults.items():
            fpath = DOWNLOADS_DIR / name
            if not fpath.exists():
                fpath.write_text(f"Title: {name}\nContent: {content}", encoding="utf-8")

    def list_papers(self) -> List[PaperItem]:
        self.ensure_sandbox_structure()
        papers: List[PaperItem] = []
        for p in DOWNLOADS_DIR.glob("*.pdf"):
            try:
                p.resolve().relative_to(DOWNLOADS_DIR.resolve())
            except ValueError:
                continue
            fname = p.name.lower()
            if "transformer" in fname or "attention" in fname:
                cat = "Architectures & Transformers"
                conf = 0.95
                needs_clar = False
                opts = []
            elif "lora" in fname or "adaptation" in fname:
                cat = "Efficient Fine-Tuning"
                conf = 0.92
                needs_clar = False
                opts = []
            elif "alphago" in fname or "reinforcement" in fname:
                cat = "Reinforcement Learning"
                conf = 0.94
                needs_clar = False
                opts = []
            elif "multimodal" in fname or "agents" in fname:
                cat = "Multimodal Models"
                conf = 0.55
                needs_clar = True
                opts = ["Multimodal Models", "Autonomous Agents", "Computer Vision"]
            else:
                cat = "General AI"
                conf = 0.60
                needs_clar = True
                opts = ["General AI", "Machine Learning", "System Optimization"]

            papers.append(PaperItem(
                filename=p.name,
                relative_path=str(p.relative_to(SANDBOX_ROOT)),
                suggested_category=cat,
                confidence=conf,
                needs_clarification=needs_clar,
                clarification_options=opts
            ))
        return papers

    def generate_plan(self, category_overrides: Optional[Dict[str, str]] = None) -> List[OrganizationPlanItem]:
        overrides = category_overrides or {}
        papers = self.list_papers()
        plan: List[OrganizationPlanItem] = []

        for p in papers:
            cat = overrides.get(p.filename, p.suggested_category)
            dest_folder = cat.replace(" & ", "_").replace(" ", "_").lower()
            plan.append(OrganizationPlanItem(
                filename=p.filename,
                source_path=f"downloaded/{p.filename}",
                destination_path=f"organized/{dest_folder}/{p.filename}",
                category=cat,
                risk="medium",
                status="proposed"
            ))
        return plan

    def validate_plan(self, plan: List[OrganizationPlanItem]) -> List[OrganizationPlanItem]:
        available = {paper.filename for paper in self.list_papers()}
        seen_sources: set[str] = set()
        seen_destinations: set[str] = set()
        validated: List[OrganizationPlanItem] = []
        for item in plan:
            filename = item.filename
            if filename not in available or Path(filename).name != filename or not filename.lower().endswith(".pdf"):
                raise ValueError(f"Security policy violation: file is outside the approved paper sandbox: {filename}")
            expected_source = f"downloaded/{filename}"
            category = item.category.strip()
            if not category or len(category) > 100:
                raise ValueError("Category must contain between 1 and 100 characters")
            folder = re.sub(r"[^a-zA-Z0-9_-]+", "_", category).strip("_-").lower()
            if not folder:
                raise ValueError("Category does not produce a safe destination folder")
            expected_destination = f"organized/{folder}/{filename}"
            if item.source_path != expected_source or item.destination_path.replace("\\", "/") != expected_destination:
                raise ValueError(f"Paths for '{filename}' do not match the approved sandbox plan")
            if filename in seen_sources or expected_destination in seen_destinations:
                raise ValueError("Duplicate source or destination in organization plan")
            source = (SANDBOX_ROOT / expected_source).resolve()
            destination = (SANDBOX_ROOT / expected_destination).resolve()
            try:
                source.relative_to(DOWNLOADS_DIR.resolve())
                destination.relative_to((SANDBOX_ROOT / "organized").resolve())
            except ValueError as exc:
                raise ValueError("Organization path escapes the permitted sandbox folders") from exc
            if not source.is_file():
                raise ValueError(f"Source paper is no longer available: {filename}")
            if destination.exists():
                raise ValueError(f"Destination already exists: {expected_destination}")
            seen_sources.add(filename)
            seen_destinations.add(expected_destination)
            validated.append(OrganizationPlanItem(filename=filename, source_path=expected_source,
                destination_path=expected_destination, category=category, risk="medium", status="approved"))
        if not validated:
            raise ValueError("Organization plan is empty")
        return validated

    @staticmethod
    def plan_hash(plan: List[OrganizationPlanItem]) -> str:
        canonical = json.dumps([item.model_dump() for item in plan], sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def execute_organization(
        self,
        plan: List[OrganizationPlanItem],
        approved_by: str = "local_user"
    ) -> Dict[str, Any]:
        """
        Executes file movement strictly within SANDBOX_ROOT.
        Verifies outcomes and registers an undo token.
        """
        plan = self.validate_plan(plan)
        undo_token = f"undo_{uuid.uuid4().hex[:12]}"
        moves_record = []
        verified_results = []

        try:
            for item in plan:
                src = (SANDBOX_ROOT / item.source_path).resolve()
                dst = (SANDBOX_ROOT / item.destination_path).resolve()
                src.relative_to(DOWNLOADS_DIR.resolve())
                dst.relative_to((SANDBOX_ROOT / "organized").resolve())
                dst.parent.mkdir(parents=True, exist_ok=True)
                # Recheck after directory creation in case a symlink appeared.
                dst = (dst.parent.resolve() / dst.name).resolve()
                dst.relative_to((SANDBOX_ROOT / "organized").resolve())
                if not src.is_file() or dst.exists():
                    raise ValueError(f"Source or destination changed before moving '{item.filename}'")
                shutil.move(str(src), str(dst))
                moves_record.append({"src": str(src), "dst": str(dst)})
                exists = dst.is_file()
                verified_results.append({"filename": item.filename, "destination": item.destination_path,
                    "verified": exists, "verification_state": "VERIFIED_SUCCESS" if exists else "FAILED"})
        except Exception:
            for move in reversed(moves_record):
                source, destination = Path(move["src"]), Path(move["dst"])
                if destination.is_file() and not source.exists():
                    source.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(destination), str(source))
            raise

        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = (now + datetime.timedelta(minutes=5)).isoformat()

        self.undo_registry[undo_token] = {
            "token": undo_token,
            "created_at": now.isoformat(),
            "expires_at": expires_at,
            "moves": moves_record,
            "approved_by": approved_by
        }

        return {
            "status": "completed",
            "undo_token": undo_token,
            "expires_at": expires_at,
            "results": verified_results
        }

    def revert_organization(self, undo_token: str) -> Dict[str, Any]:
        record = self.undo_registry.get(undo_token)
        if not record:
            return {"success": False, "error": "Invalid or expired undo token"}

        if datetime.datetime.now(datetime.timezone.utc) > datetime.datetime.fromisoformat(record["expires_at"]):
            del self.undo_registry[undo_token]
            return {"success": False, "error": "Undo token has expired"}

        prepared = []
        for move in record["moves"]:
            dst = Path(move["dst"]).resolve()
            src = Path(move["src"]).resolve()
            dst.relative_to((SANDBOX_ROOT / "organized").resolve())
            src.relative_to(DOWNLOADS_DIR.resolve())
            if not dst.is_file() or src.exists():
                return {"success": False, "error": f"Cannot safely restore {src.name}; source or destination changed"}
            prepared.append((dst, src))

        reverted_count = 0
        for dst, src in prepared:
            src.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(dst), str(src))
            reverted_count += 1

        del self.undo_registry[undo_token]
        return {"success": True, "reverted_files": reverted_count}


paper_organizer_instance = PaperOrganizerManager()

from __future__ import annotations
import shutil
import uuid
import datetime
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

    def execute_organization(
        self,
        plan: List[OrganizationPlanItem],
        approved_by: str = "local_user"
    ) -> Dict[str, Any]:
        """
        Executes file movement strictly within SANDBOX_ROOT.
        Verifies outcomes and registers an undo token.
        """
        undo_token = f"undo_{uuid.uuid4().hex[:12]}"
        moves_record = []
        verified_results = []

        for item in plan:
            src = SANDBOX_ROOT / item.source_path
            dst = SANDBOX_ROOT / item.destination_path

            # Strict policy enforcement: reject any path escape
            if not str(src.resolve()).startswith(str(SANDBOX_ROOT.resolve())) or \
               not str(dst.resolve()).startswith(str(SANDBOX_ROOT.resolve())):
                raise ValueError(f"Security policy violation: Path '{src}' escapes sandbox folder")

            if src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dst))
                moves_record.append({"src": str(src), "dst": str(dst)})

                # Deterministic postcondition verification: File exists at destination
                exists = dst.exists()
                verified_results.append({
                    "filename": item.filename,
                    "destination": item.destination_path,
                    "verified": exists,
                    "verification_state": "VERIFIED_SUCCESS" if exists else "FAILED"
                })

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

        reverted_count = 0
        for move in record["moves"]:
            dst = Path(move["dst"])
            src = Path(move["src"])
            if dst.exists():
                src.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(dst), str(src))
                reverted_count += 1

        del self.undo_registry[undo_token]
        return {"success": True, "reverted_files": reverted_count}


paper_organizer_instance = PaperOrganizerManager()

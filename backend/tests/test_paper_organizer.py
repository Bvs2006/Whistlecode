import pytest
from backend.app.sandbox.paper_organizer import paper_organizer_instance, OrganizationPlanItem


def test_paper_organizer_listing_and_clarification_flag():
    """AI understands filenames and flags ambiguous papers for clarification."""
    papers = paper_organizer_instance.list_papers()
    assert len(papers) >= 4

    # Transformer paper should be confidently classified
    trans = next((p for p in papers if "attention" in p.filename), None)
    assert trans is not None
    assert trans.suggested_category == "Architectures & Transformers"
    assert trans.confidence >= 0.90
    assert trans.needs_clarification is False

    # Multimodal agents paper is ambiguous -> must ask user
    multi = next((p for p in papers if "multimodal" in p.filename), None)
    assert multi is not None
    assert multi.needs_clarification is True
    assert len(multi.clarification_options) >= 3


def test_paper_organizer_scoped_execution_and_reversible_undo():
    """Safe execution: moves files within scoped sandbox, verifies, and provides undo."""
    plan = paper_organizer_instance.generate_plan()
    assert len(plan) >= 4

    # Execute plan
    res = paper_organizer_instance.execute_organization(plan, approved_by="test_user")
    assert res["status"] == "completed"
    assert "undo_token" in res
    assert res["undo_token"].startswith("undo_")

    # Postcondition verification: all files verified at destination
    for r in res["results"]:
        assert r["verified"] is True
        assert r["verification_state"] == "VERIFIED_SUCCESS"

    # Reversible undo
    undo_res = paper_organizer_instance.revert_organization(res["undo_token"])
    assert undo_res["success"] is True
    assert undo_res["reverted_files"] >= 4


def test_paper_organizer_rejects_out_of_scope_path_escape():
    """Policy engine: Rejects directory traversal / out-of-scope escape."""
    malicious_plan = [
        OrganizationPlanItem(
            filename="malicious.pdf",
            source_path="../../Windows/System32/calc.exe",
            destination_path="organized/escaped/calc.exe",
            category="System",
            risk="critical",
            status="proposed"
        )
    ]

    with pytest.raises(ValueError) as excinfo:
        paper_organizer_instance.execute_organization(malicious_plan)
    assert "Security policy violation" in str(excinfo.value)

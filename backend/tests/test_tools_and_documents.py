import zipfile
from pathlib import Path

import pytest

from app.credentials.store import delete_secret, has_secret, put_secret
from app.documents.service import generate_document, get_artifact
from app.integrations.hub import IntegrationConfigError, IntegrationHubService
from app.models.integration import IntegrationStatus
from app.tools.filesystem import FilesystemScopeError, write_text
from app.tools.registry import ToolPermissionError, execute_tool


def test_google_connector_cannot_be_marked_connected():
    IntegrationHubService.seed_default_integrations()
    with pytest.raises(IntegrationConfigError):
        IntegrationHubService.connect_integration("integ_gmail", {})
    gmail = IntegrationHubService.get_integration("integ_gmail")
    assert gmail is not None
    assert gmail.status == IntegrationStatus.DISCONNECTED
    assert "not connected" in gmail.status_detail.lower() or gmail.availability == "not_configured"


def test_secret_is_stored_without_marking_provider_connected():
    IntegrationHubService.seed_default_integrations()
    updated = IntegrationHubService.connect_integration("integ_gemini", {"api_key": "test-key-not-live"})
    assert updated is not None
    assert updated.status == IntegrationStatus.CONFIGURING
    assert has_secret("integ_gemini") is True
    IntegrationHubService.disconnect_integration("integ_gemini")
    assert has_secret("integ_gemini") is False


def test_sqlite_credential_round_trip(monkeypatch):
    try:
        import keyring
        monkeypatch.setattr(keyring, "set_password", lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("keyring unavailable")))
    except ImportError:
        pass
    storage = put_secret("integ_groq", "local-test-token")
    assert storage == "sqlite"
    assert has_secret("integ_groq") is True
    delete_secret("integ_groq")
    assert has_secret("integ_groq") is False


def test_filesystem_rejects_paths_outside_the_sandbox():
    with pytest.raises(FilesystemScopeError):
        write_text("../outside.txt", "no")


@pytest.mark.asyncio
async def test_document_tools_require_permission_and_write_real_files():
    with pytest.raises(ToolPermissionError):
        await execute_tool("doc.generate_docx", {"topic": "Lab notes"}, [])

    created = await execute_tool(
        "doc.generate_pptx",
        {"topic": "Weekly briefing", "bullets": ["Revenue held steady", "Two invoices need review"], "slide_count": 2},
        ["write_file"],
    )
    assert created["status"] == "success"
    artifact_id = created["result"]["id"]
    stored = get_artifact(artifact_id)
    assert stored is not None
    payload = Path(stored["path"]).read_bytes()
    assert payload[:2] == b"PK"
    with zipfile.ZipFile(Path(stored["path"])) as archive:
        assert "ppt/presentation.xml" in archive.namelist()

    pdf = generate_document("pdf", {"topic": "Study notes", "bullets": ["Definition: scope"]})
    assert Path(get_artifact(pdf["id"])["path"]).read_bytes().startswith(b"%PDF")

    workbook = await execute_tool(
        "doc.analyze_xlsx",
        {"topic": "Spend", "rows": [["Item", "Amount"], ["Paper", "12"], ["Ink", "4"]]},
        ["write_file"],
    )
    assert workbook["status"] == "success"
    assert workbook["result"]["analysis"]["row_count"] == 2

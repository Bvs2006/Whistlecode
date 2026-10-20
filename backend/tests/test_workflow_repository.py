import pytest
import uuid
from backend.app.db.repository import SQLiteWorkflowRepository
from backend.app.models.workflow import WorkflowDefinition, Step, ParameterDefinition, ActionType


@pytest.fixture
def repo():
    return SQLiteWorkflowRepository()


def test_workflow_persistence_and_versioning(repo):
    wf_id = f"test_wf_{uuid.uuid4().hex[:6]}"
    wf = WorkflowDefinition(
        workflow_id=wf_id,
        title="Automated Test Workflow",
        intent="Test persistence across version changes",
        allowed_origins=["http://localhost:8000"],
        parameters=[
            ParameterDefinition(name="item_name", type="string", default_value="Book", required=True)
        ],
        steps=[
            Step(id="s1", name="Navigate", action=ActionType.NAVIGATE, args={"url": "http://localhost:8000"})
        ],
        final_postconditions=[],
        version=1,
        content_hash="sha256:dummy",
    )

    # 1. Save v1
    saved_v1 = repo.save_workflow(wf, "First save")
    assert saved_v1.version == 1
    assert saved_v1.content_hash.startswith("sha256:")

    # 2. Retrieve
    retrieved = repo.get_workflow(wf_id)
    assert retrieved is not None
    assert retrieved.title == "Automated Test Workflow"
    assert retrieved.version == 1

    # 3. Save v2 (Version increment)
    wf.title = "Updated Title"
    saved_v2 = repo.save_workflow(wf, "Second save with title change")
    assert saved_v2.version == 2
    assert saved_v2.title == "Updated Title"

    # Both versions exist in history
    assert repo.get_workflow(wf_id, version=1).title == "Automated Test Workflow"
    assert repo.get_workflow(wf_id, version=2).title == "Updated Title"


def test_duplicate_workflow(repo):
    wf_id = f"test_dup_{uuid.uuid4().hex[:6]}"
    wf = WorkflowDefinition(
        workflow_id=wf_id,
        title="Source Workflow",
        intent="Clone me",
        allowed_origins=["http://localhost:8000"],
        parameters=[],
        steps=[],
        final_postconditions=[],
        version=1,
        content_hash="sha256:source",
    )
    repo.save_workflow(wf)

    # Duplicate
    duplicated = repo.duplicate_workflow(wf_id, "Cloned Workflow")
    assert duplicated.workflow_id != wf_id
    assert duplicated.title == "Cloned Workflow"
    assert duplicated.version == 1

    # Verify original is still intact
    assert repo.get_workflow(wf_id).title == "Source Workflow"


def test_enable_disable_and_archiving(repo):
    wf_id = f"test_state_{uuid.uuid4().hex[:6]}"
    wf = WorkflowDefinition(
        workflow_id=wf_id,
        title="State Workflow",
        intent="Toggle states",
        allowed_origins=["http://localhost:8000"],
        parameters=[],
        steps=[],
        final_postconditions=[],
        version=1,
        content_hash="sha256:state",
    )
    repo.save_workflow(wf)

    # Disable
    assert repo.set_enabled(wf_id, False) is True
    meta = [m for m in repo.list_workflows(search=wf_id) if m.id == wf_id][0]
    assert meta.is_enabled is False

    # Archive
    assert repo.set_archived(wf_id, True) is True
    # By default, archived is excluded from active list
    active_list = repo.list_workflows(search=wf_id, include_archived=False)
    assert len(active_list) == 0

    # Included when include_archived=True
    all_list = repo.list_workflows(search=wf_id, include_archived=True)
    assert len(all_list) == 1
    assert all_list[0].is_archived is True


def test_delete_workflow_retains_history(repo):
    wf_id = f"test_del_{uuid.uuid4().hex[:6]}"
    wf = WorkflowDefinition(
        workflow_id=wf_id,
        title="Delete Me",
        intent="Verify delete behavior",
        allowed_origins=["http://localhost:8000"],
        parameters=[],
        steps=[],
        final_postconditions=[],
        version=1,
        content_hash="sha256:del",
    )
    repo.save_workflow(wf)

    # Delete with history retention
    deleted = repo.delete_workflow(wf_id, retain_history=True)
    assert deleted is True

    # Workflow is gone from repository
    assert repo.get_workflow(wf_id) is None


def test_credential_sanitization_in_workflow_definitions(repo):
    wf_id = f"test_cred_{uuid.uuid4().hex[:6]}"
    wf = WorkflowDefinition(
        workflow_id=wf_id,
        title="Leaky Workflow",
        intent="Must be scrubbed",
        allowed_origins=["http://localhost:8000"],
        parameters=[
            ParameterDefinition(name="user_password", type="string", default_value="MyP@ssword!", required=True)
        ],
        steps=[
            Step(
                id="s1",
                name="Type Secret",
                action=ActionType.TYPE,
                args={"auth_token": "bearer-secret-token-xyz"}
            )
        ],
        final_postconditions=[],
        version=1,
        content_hash="sha256:cred",
    )

    saved = repo.save_workflow(wf)
    # Password default value must be replaced
    assert saved.parameters[0].default_value == "[SECURE_INPUT_REQUIRED]"
    # Step auth_token argument must be redacted
    assert saved.steps[0].args["auth_token"] == "[REDACTED]"

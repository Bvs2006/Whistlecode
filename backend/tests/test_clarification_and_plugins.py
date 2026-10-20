import pytest
from backend.app.models.events import RecordingSession, RecordedEvent, EventType
from backend.app.models.workflow import TargetDescriptor, WorkflowDefinition, Step, ActionType, RiskLevel, ParameterDefinition
from backend.app.generation.synthesizer import WorkflowSynthesizer
from backend.app.plugins.plugin_manager import plugin_manager_instance, PluginManifest, ToolDefinition
from backend.app.recording.desktop_observer import desktop_observer_instance


def test_clarification_dialogue_identifies_restaurant_ambiguity():
    """SUGILITE concept: Ambiguous GUI choice triggers clarifying question."""
    synthesizer = WorkflowSynthesizer()
    session = RecordingSession(
        id="rec_test_restaurant",
        created_at="2026-10-20T12:00:00Z",
        task_description="Choose top restaurant",
        target_url="http://localhost:8000/testsite#restaurants",
        events=[
            RecordedEvent(
                id="e1",
                recording_id="rec_test_restaurant",
                timestamp=1.0,
                type=EventType.NAVIGATE,
                url="http://localhost:8000/testsite#restaurants",
                value="http://localhost:8000/testsite#restaurants"
            ),
            RecordedEvent(
                id="e2",
                recording_id="rec_test_restaurant",
                timestamp=2.0,
                type=EventType.CLICK,
                url="http://localhost:8000/testsite#restaurants",
                target=TargetDescriptor(name="Select Restaurant Bistro Roma", test_id="btn-select-bistro-roma")
            )
        ]
    )

    clarifications = synthesizer.generate_clarifications(session)
    assert len(clarifications) >= 1
    q = clarifications[0]
    assert "price, distance or rating" in q.question
    assert any("Rating" in opt for opt in q.options)
    assert any("Price" in opt for opt in q.options)
    assert any("Distance" in opt for opt in q.options)


def test_reusable_workflow_synthesis_incorporates_clarification_answer():
    """User answer 'Rating' converts choice into dynamic parameter condition."""
    synthesizer = WorkflowSynthesizer()
    session = RecordingSession(
        id="rec_test_synthesis",
        created_at="2026-10-20T12:00:00Z",
        task_description="Find best restaurant",
        target_url="http://localhost:8000/testsite#restaurants",
        events=[
            RecordedEvent(
                id="e1",
                recording_id="rec_test_synthesis",
                timestamp=1.0,
                type=EventType.CLICK,
                url="http://localhost:8000/testsite#restaurants",
                target=TargetDescriptor(name="Select Restaurant Bistro Roma", test_id="btn-select-bistro-roma")
            )
        ]
    )

    wf = synthesizer.synthesize_from_session(
        session,
        user_clarifications={"clarify_s1_intent": "Rating (Highest rated >= 4.5)"}
    )

    assert any(p.name == "min_rating" for p in wf.parameters)
    step = wf.steps[0]
    assert step.condition == "rating >= {{min_rating}}"
    assert "Learned rule" in (step.notes or "")


def test_natural_language_workflow_search():
    """Find reusable workflows using natural language queries."""
    workflows = [
        {
            "id": "wf_1",
            "title": "Register New Customer Profile",
            "intent": "Submit customer form on test site",
            "parameters": [{"name": "customer_name"}, {"name": "customer_email"}],
            "steps": [{"name": "Enter customer name"}, {"name": "Submit form"}]
        },
        {
            "id": "wf_2",
            "title": "Restaurant Finder and Reservation",
            "intent": "Filter restaurants by price and highest rating",
            "parameters": [{"name": "min_rating"}, {"name": "preferred_price"}],
            "steps": [{"name": "Filter rating"}, {"name": "Book table"}]
        }
    ]

    # Search for customer signup
    res1 = WorkflowSynthesizer.search_workflows_nl("how to register a user client profile", workflows)
    assert len(res1) > 0
    assert res1[0]["id"] == "wf_1"

    # Search for restaurant
    res2 = WorkflowSynthesizer.search_workflows_nl("find food dining with good reviews", workflows)
    assert len(res2) > 0
    assert res2[0]["id"] == "wf_2"


def test_plugin_manager_registration_and_dry_run():
    """Extensible plugin architecture registers and executes tools."""
    manifest = PluginManifest(
        id="plugin_custom_test",
        name="Custom Analytics Tool",
        version="0.5.0",
        description="Logs metrics",
        tools=[
            ToolDefinition(
                name="log_metric",
                display_name="Log Metric",
                description="Logs a custom telemetry metric",
                parameters_schema={"metric": {"type": "string"}},
                risk_level=RiskLevel.LOW
            )
        ]
    )

    plugin_manager_instance.register_plugin(manifest)
    assert "plugin_custom_test" in plugin_manager_instance.plugins

    dry_res = plugin_manager_instance.execute_tool(
        "plugin_custom_test",
        "log_metric",
        {"metric": "workflow_run_count"},
        dry_run=True
    )
    assert dry_res["success"] is True
    assert dry_res.get("dry_run") is True


def test_desktop_observer_active_window():
    """Desktop observer captures active window metadata."""
    info = desktop_observer_instance.get_active_window_info()
    assert "window_title" in info
    assert "process_name" in info

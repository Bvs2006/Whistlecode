import pytest
from unittest.mock import MagicMock
from backend.app.ag_ui.daily_logger import DailyLogRecorder
from backend.app.ag_ui.engine import AgUiExecutionEngine


def test_daily_log_recorder_creation_and_retrieval():
    """Verify Automated Post-Task Text Recorder creates structured logs."""
    step_results = [
        {"action": "navigate", "target": "https://example.com", "passed": True, "output": "Loaded"},
        {"action": "click", "target": "Submit Button", "passed": True, "output": "Clicked"},
    ]

    res = DailyLogRecorder.record_completed_run(
        run_id="run_test_agui_1",
        workflow_id="wf_test_1",
        workflow_title="Test Daily Task",
        step_results=step_results,
        status="completed"
    )

    assert res["status"] == "completed"
    assert res["run_id"] == "run_test_agui_1"
    assert "Run 'Test Daily Task' (COMPLETED)" in res["summary_text"]
    assert "✓ [NAVIGATE]" in res["summary_text"]

    # Verify retrieval by date
    log_data = DailyLogRecorder.get_log_by_date(res["date"])
    assert log_data["has_log"] is True
    assert "Test Daily Task" in log_data["raw_text"]
    assert "###" in log_data["markdown"]

    # Verify memory context
    memory = DailyLogRecorder.get_recent_history_context(days=1)
    assert "Test Daily Task" in memory


def test_interrupt_resolution():
    """Verify Human-in-the-Loop interrupt resolution mechanism."""
    engine = AgUiExecutionEngine()
    mock_future = MagicMock()
    mock_future.done.return_value = False

    engine._active_interrupts["intr_test_123"] = mock_future

    # Resolve with approval
    resolved = engine.resolve_interrupt("intr_test_123", grant=True)
    assert resolved is True
    mock_future.set_result.assert_called_once_with(True)

    # Resolving non-existent interrupt returns False
    assert engine.resolve_interrupt("non_existent", grant=True) is False

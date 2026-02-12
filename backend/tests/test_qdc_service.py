import pytest

from app.services.qdc_service import QDCService


@pytest.mark.asyncio
async def test_qdc_upload_and_job_lifecycle(tmp_path):
    service = QDCService()
    service.mock_step_s = 0.05

    artifact_file = tmp_path / "artifact.txt"
    artifact_file.write_text("hello qdc")

    artifact = await service.upload_artifact(str(artifact_file))
    assert artifact["id"].startswith("qdc-artifact-")

    job = await service.create_job(
        prompt="Run this remotely",
        artifact_id=artifact["id"],
        target="auto",
        priority="normal",
    )
    assert job["id"].startswith("qdc-job-")
    assert job["status"] == "queued"

    final = await service.wait_for_job(job["id"], timeout_s=10)
    assert final["status"] == "succeeded"
    assert "summary" in final["result"]


@pytest.mark.asyncio
async def test_qdc_rerun_reuses_prompt(tmp_path):
    service = QDCService()
    service.mock_step_s = 0.05

    artifact_file = tmp_path / "payload.bin"
    artifact_file.write_bytes(b"abc")
    artifact = await service.upload_artifact(str(artifact_file))

    first = await service.create_job(prompt="First prompt", artifact_id=artifact["id"])
    await service.wait_for_job(first["id"], timeout_s=10)

    second = await service.rerun_job(first["id"])
    assert second["id"] != first["id"]
    assert second["prompt"] == first["prompt"]

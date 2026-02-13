import pytest
import zipfile

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
    assert isinstance(final["result"].get("assistant_reply"), str)
    assert final["result"].get("model") == "qdc:micro-brain"


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


@pytest.mark.asyncio
async def test_qdc_create_package_includes_manifest_and_runner(tmp_path, monkeypatch):
    monkeypatch.setenv("LOOM_QDC_PACKAGE_DIR", str(tmp_path / "packages"))
    service = QDCService()

    app_dir = tmp_path / "app_bundle"
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / "main.py").write_text("print('hello')\n")
    (app_dir / "README.txt").write_text("bundle\n")

    package = await service.create_package(
        str(app_dir),
        package_name="demo-bundle",
        startup_command="python main.py",
        package_kind="application",
    )

    package_path = package["path"]
    assert package["name"].endswith(".zip")
    assert package["file_count"] == 2
    assert package["recommended_upload_type"] == "Application"

    with zipfile.ZipFile(package_path, "r") as archive:
        names = set(archive.namelist())
        assert "app_bundle/main.py" in names
        assert "app_bundle/README.txt" in names
        assert "loom_qdc_manifest.json" in names
        assert "loom_qdc_run.bat" in names
        assert "loom_qdc_run.sh" in names
        manifest_text = archive.read("loom_qdc_manifest.json").decode("utf-8")
        assert "qdc-package-" in manifest_text
        assert "python main.py" in manifest_text

    model_package = await service.create_package(
        str(app_dir),
        package_name="demo-model",
        package_kind="model",
    )
    assert model_package["recommended_upload_type"] == "AI Model"


@pytest.mark.asyncio
async def test_qdc_package_and_run_creates_job(tmp_path, monkeypatch):
    monkeypatch.setenv("LOOM_QDC_PACKAGE_DIR", str(tmp_path / "packages"))
    service = QDCService()
    service.mock_step_s = 0.05

    payload_dir = tmp_path / "payload"
    payload_dir.mkdir(parents=True, exist_ok=True)
    (payload_dir / "run.txt").write_text("ready")

    result = await service.package_and_run(
        path_value=str(payload_dir),
        prompt="Smoke test package flow",
        target="auto",
        priority="normal",
    )

    package = result["package"]
    artifact = result["artifact"]
    job = result["job"]

    assert package["id"].startswith("qdc-package-")
    assert artifact["id"].startswith("qdc-artifact-")
    assert artifact["path"].endswith(".zip")
    assert job["id"].startswith("qdc-job-")
    assert job["artifact_id"] == artifact["id"]

    final = await service.wait_for_job(job["id"], timeout_s=10)
    assert final["status"] == "succeeded"

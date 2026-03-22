from celery import Celery
from celery.signals import worker_ready

from app.core.config import settings

celery_app = Celery(
    "water_dp_worker",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks.import_tasks",
        "app.tasks.computation_tasks",
        "app.tasks.simulation_tasks",
        "app.tasks.monitoring_tasks",
    ],
)

celery_app.conf.task_routes = {
    "app.tasks.import_tasks.*": {"queue": "imports"},
    "app.tasks.computation_tasks.*": {"queue": "computations"},
    "app.tasks.simulation_tasks.*": {"queue": "celery"},
    "app.tasks.monitoring_tasks.*": {"queue": "celery"},
}

celery_app.conf.beat_schedule = {
    "run-simulation-step-every-10s": {
        "task": "app.tasks.simulation_tasks.run_simulation_step",
        "schedule": 10.0,
    },
    "check-inactive-sensors": {
        "task": "app.tasks.monitoring_tasks.run_inactive_check",
        "schedule": 1800.0,  # 30 minutes — fast DB query, no FROST polling
    },
    # QA/QC alert evaluation is now event-driven via MQTT (qaqc_done topic).
    # The periodic-alert-evaluation task has been removed in favour of
    # evaluate_qaqc_alerts_for_thing triggered by mqtt_handler.
}


@worker_ready.connect
def start_mqtt_subscriber(**kwargs):
    """Start persistent MQTT subscriber thread when the Celery worker is ready.
    Subscribes to qaqc_done and data_parsed topics to drive event-based alerts."""
    from app.worker.mqtt_handler import start_subscriber

    start_subscriber()

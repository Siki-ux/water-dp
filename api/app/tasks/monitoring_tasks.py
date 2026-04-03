from app.core.celery_app import celery_app
from app.services.monitoring_service import MonitoringService


@celery_app.task
def run_inactive_check():
    """
    Celery task to check all tracked sensors for inactivity.
    Uses last_seen_at timestamps recorded via MQTT data_parsed events.
    """
    service = MonitoringService()
    return service.check_inactive_sensors()


@celery_app.task
def run_periodic_alert_evaluation():
    """
    Celery task to run the periodic alert evaluation for all active sensor rules.
    """
    from app.core.database import SessionLocal
    from app.services.alert_evaluator import AlertEvaluator

    db = SessionLocal()
    try:
        evaluator = AlertEvaluator(db)
        evaluator.evaluate_all_active_sensor_rules()
    finally:
        db.close()


@celery_app.task
def run_qaqc_alert_evaluation():
    """
    Celery task to evaluate QA/QC-based alert rules against flagged observation ratios.
    """
    from app.core.database import SessionLocal
    from app.services.alert_evaluator import AlertEvaluator

    db = SessionLocal()
    try:
        evaluator = AlertEvaluator(db)
        evaluator.evaluate_all_active_qaqc_rules()
    finally:
        db.close()


@celery_app.task
def evaluate_qaqc_alerts_for_thing(project_uuid: str, thing_uuid: str):
    """
    Evaluate QA/QC alert rules scoped to a specific project+thing.
    Triggered by MQTT qaqc_done message via mqtt_handler.
    """
    from app.core.database import SessionLocal
    from app.services.alert_evaluator import AlertEvaluator

    db = SessionLocal()
    try:
        AlertEvaluator(db).evaluate_qaqc_rules_for_thing(project_uuid, thing_uuid)
    finally:
        db.close()


@celery_app.task
def record_sensor_activity(thing_uuid: str):
    """
    Record that a sensor sent data (update last_seen_at) and resolve any open
    inactivity alert for it.
    Triggered by MQTT data_parsed message via mqtt_handler.
    """
    MonitoringService().record_activity_for_thing(thing_uuid)

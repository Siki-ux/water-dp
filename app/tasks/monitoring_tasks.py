from app.core.celery_app import celery_app
from app.services.monitoring_service import MonitoringService


@celery_app.task
def run_inactive_check():
    """
    Celery task to run the inactive check for all MQTT things.
    """
    service = MonitoringService()
    return service.check_inactive_mqtt_things()


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

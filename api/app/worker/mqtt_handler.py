import json
import logging
import threading

import paho.mqtt.client as mqtt

from app.core.config import settings

logger = logging.getLogger(__name__)


def on_message(client, userdata, message):
    try:
        payload = json.loads(message.payload)
        topic = message.topic

        if topic == settings.mqtt_topic_qaqc_done:
            from app.tasks.monitoring_tasks import evaluate_qaqc_alerts_for_thing

            evaluate_qaqc_alerts_for_thing.delay(
                project_uuid=payload.get("project_uuid"),
                thing_uuid=payload.get("thing_uuid"),
            )

        elif topic == settings.mqtt_topic_data_parsed:
            from app.tasks.monitoring_tasks import record_sensor_activity

            record_sensor_activity.delay(
                thing_uuid=payload.get("thing_uuid"),
            )

    except Exception:
        logger.exception("mqtt_handler: failed to process message on %s", message.topic)


def start_subscriber() -> threading.Thread:
    """Start MQTT subscriber in a daemon thread. Called from worker startup via worker_ready signal."""
    client = mqtt.Client()
    client.username_pw_set(settings.mqtt_username, settings.mqtt_password)
    client.on_message = on_message

    def run():
        topics = [
            (settings.mqtt_topic_qaqc_done, 1),
            (settings.mqtt_topic_data_parsed, 1),
        ]

        # Re-subscribe after reconnect
        def on_connect(c, userdata, flags, rc):
            if rc == 0:
                c.subscribe(topics)
                logger.info(
                    "mqtt_handler: connected to %s, subscribed to [%s, %s]",
                    settings.mqtt_broker_host,
                    settings.mqtt_topic_qaqc_done,
                    settings.mqtt_topic_data_parsed,
                )
            else:
                logger.error("mqtt_handler: connection failed with rc=%s", rc)

        client.on_connect = on_connect
        # loop_forever handles reconnect automatically when reconnect_delay_set is used
        client.reconnect_delay_set(min_delay=1, max_delay=30)

        try:
            client.connect(settings.mqtt_broker_host, 1883)
            client.loop_forever()
        except Exception:
            logger.exception("mqtt_handler: subscriber thread failed")

    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t

"""
Example External API Syncer: Open-Meteo Weather API
====================================================
Fetches hourly weather data for a station defined by latitude/longitude.

Required sensor settings (JSON) when configuring a sensor with this API type:
    {
        "latitude": 51.3397,
        "longitude": 12.3731,
        "parameters": "temperature_2m,relative_humidity_2m,wind_speed_10m"
    }
"""

import json
import requests
from datetime import datetime


class OpenMeteoSyncer(ExtApiSyncer):
    """Fetches hourly weather observations from the Open-Meteo API."""

    BASE_URL = "https://api.open-meteo.com/v1/forecast"

    def fetch_api_data(self, thing, content):
        """
        Fetch weather data from Open-Meteo.

        Args:
            thing: Thing object with thing.ext_api.settings containing
                   latitude, longitude, and optionally parameters.
            content: Dict with 'datetime_from' and 'datetime_to' keys
                     in format "YYYY-MM-DD HH:MM:SS".

        Returns:
            Dict with the API response JSON and station metadata.
        """
        settings = thing.ext_api.settings

        # Parse date range from the sync content
        dt_from = datetime.strptime(content["datetime_from"], "%Y-%m-%d %H:%M:%S")
        dt_to = datetime.strptime(content["datetime_to"], "%Y-%m-%d %H:%M:%S")

        # Weather parameters to fetch (configurable via settings)
        hourly_params = settings.get(
            "parameters",
            "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation"
        )

        params = {
            "latitude": settings["latitude"],
            "longitude": settings["longitude"],
            "hourly": hourly_params,
            "start_date": dt_from.strftime("%Y-%m-%d"),
            "end_date": dt_to.strftime("%Y-%m-%d"),
            "timezone": "UTC",
        }

        response = requests.get(self.BASE_URL, params=params, timeout=(10, 60))
        response.raise_for_status()

        return {
            "data": response.json(),
            "latitude": settings["latitude"],
            "longitude": settings["longitude"],
        }

    def do_parse(self, api_response):
        """
        Parse Open-Meteo response into timeIO observation format.

        Each observation must be a dict with:
            - result_time: ISO timestamp string
            - result_type: 0=number, 1=string, 2=json, 3=boolean
            - datastream_pos: parameter name (becomes the datastream)
            - result_number/result_string: the actual value
            - parameters: JSON string with origin metadata

        Returns:
            Dict with key "observations" containing list of observation dicts.
        """
        data = api_response["data"]
        hourly = data.get("hourly", {})
        timestamps = hourly.get("time", [])

        source_meta = {
            "latitude": api_response["latitude"],
            "longitude": api_response["longitude"],
            "model": data.get("generationtime_ms"),
        }

        bodies = []
        # Get all parameter names (everything except "time")
        param_names = [k for k in hourly.keys() if k != "time"]

        for i, timestamp in enumerate(timestamps):
            for param in param_names:
                values = hourly[param]
                if i < len(values) and values[i] is not None:
                    body = {
                        "result_time": timestamp,
                        "result_type": 0,  # numeric
                        "result_number": float(values[i]),
                        "datastream_pos": param,
                        "parameters": json.dumps({
                            "origin": "open_meteo",
                            "column_header": source_meta,
                        }),
                    }
                    bodies.append(body)

        return {"observations": bodies}

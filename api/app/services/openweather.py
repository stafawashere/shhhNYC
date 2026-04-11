import httpx
from app.config import settings

_BASE = "https://api.openweathermap.org/data/2.5/weather"
_NYC_LAT = 40.7128
_NYC_LON = -74.0060


def _rain_modifier(mm: float) -> float:
    if mm <= 0:    return 0.0
    if mm >= 10:   return 4.0
    if mm >= 2:    return 2.5 + (mm - 2) / 8.0 * 1.5
    if mm >= 0.1:  return 1.0 + (mm - 0.1) / 1.9 * 1.5
    return mm / 0.1


def _snow_modifier(mm: float) -> float:
    if mm <= 0:   return 0.0
    if mm >= 5:   return 4.0
    if mm >= 1:   return 3.0 + (mm - 1) / 4.0
    return 2.0 + mm


def get_current_weather() -> dict | None:
    if not settings.openweather_api_key:
        return None

    params = {
        "lat": _NYC_LAT,
        "lon": _NYC_LON,
        "appid": settings.openweather_api_key,
        "units": "imperial",
    }
    try:
        resp = httpx.get(_BASE, params=params, timeout=10)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPError:
        return None


def weather_to_modifier(weather: dict) -> float:
    temp_f   = weather.get("main", {}).get("temp", 60.0)
    wind_mph = weather.get("wind", {}).get("speed", 0.0)
    rain_mm  = weather.get("rain", {}).get("1h", 0.0)
    snow_mm  = weather.get("snow", {}).get("1h", 0.0)

    modifier = 0.0

    if rain_mm > 0:
        modifier += _rain_modifier(rain_mm)
    elif snow_mm > 0:
        modifier += _snow_modifier(snow_mm)
    else:
        main = weather.get("weather", [{}])[0].get("main", "")
        discrete = {
            "Thunderstorm": 4.0,
            "Mist": 1.0,
            "Fog": 1.0,
            "Clear": -1.0,
            "Clouds": 0.0,
        }
        modifier += discrete.get(main, 0.0)

    if temp_f < 30:
        modifier += 2.0
    elif 65 < temp_f < 80 and rain_mm == 0 and snow_mm == 0:
        modifier -= 2.0

    if wind_mph > 25:
        modifier -= 0.5

    return max(-5.0, min(5.0, modifier))

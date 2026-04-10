import httpx
from app.config import settings

_BASE = "https://api.openweathermap.org/data/2.5/weather"
_NYC_LAT = 40.7128
_NYC_LON = -74.0060


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
    main = weather.get("weather", [{}])[0].get("main", "")
    temp_f = weather.get("main", {}).get("temp", 60.0)

    weather_map = {
        "Thunderstorm": 4.0,
        "Snow": 4.0,
        "Rain": 3.0,
        "Drizzle": 1.5,
        "Mist": 1.0,
        "Fog": 1.0,
        "Clear": -1.0,
        "Clouds": 0.0,
    }

    modifier = weather_map.get(main, 0.0)

    if temp_f < 30:
        modifier += 2.0                  # very cold ppl tend to stay inside
    elif 65 < temp_f < 80 and main == "Clear":
        modifier -= 2.0                  # perfect day

    return max(-5.0, min(5.0, modifier))

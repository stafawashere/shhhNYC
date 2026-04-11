import os
from pydantic_settings import BaseSettings

_ENV_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    google_places_api_key: str = ""
    openweather_api_key: str = ""
    yelp_api_key: str = ""
    besttime_api_key_private: str = ""
    besttime_api_key_public: str = ""
    tomtom_api_key: str = ""

    class Config:
        env_file = _ENV_FILE


settings = Settings()

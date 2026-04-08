from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    google_places_api_key: str = ""
    openweather_api_key: str = ""
    yelp_api_key: str = ""

    class Config:
        env_file = ".env"


settings = Settings()

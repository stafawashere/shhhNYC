from fastapi import FastAPI
from app.routes import venues, admin, meta

app = FastAPI(title="ShhhNYC API")

app.include_router(venues.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(meta.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}

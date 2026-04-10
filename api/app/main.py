from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import venues, admin, meta, incidents

app = FastAPI(title="ShhhNYC API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(venues.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(meta.router, prefix="/api")
app.include_router(incidents.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}

from fastapi import APIRouter

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/neighborhoods")
def get_neighborhoods():
    pass

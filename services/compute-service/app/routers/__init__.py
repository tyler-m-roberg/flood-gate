from fastapi import APIRouter

from app.routers import compute

api_router = APIRouter()
api_router.include_router(compute.router)

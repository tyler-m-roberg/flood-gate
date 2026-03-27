from fastapi import APIRouter

from app.routers import channels, events, tests

# Single include point used by main.py
api_router = APIRouter()
api_router.include_router(tests.router)
api_router.include_router(events.router)
api_router.include_router(channels.router)

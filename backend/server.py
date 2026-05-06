"""FastAPI entrypoint for BEG Estates / EstateFlow."""
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import os

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import close_db, get_db
from routes import auth_routes, projects, reservations, dashboard, audit, profile, imports, exports, clients, quotes, sales, deals
from seed import seed_all
from migrations.migrate_buyers_to_clients import migrate_buyers_to_clients
from migrations.cleanup_old_financial import cleanup_old_financial

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

app = FastAPI(title="BEG Estates / EstateFlow API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"service": "BEG Estates / EstateFlow API", "version": "0.1.0"}


api_router.include_router(auth_routes.router)
api_router.include_router(projects.router)
api_router.include_router(reservations.router)
api_router.include_router(dashboard.router)
api_router.include_router(audit.router)
api_router.include_router(profile.router)
api_router.include_router(imports.router)
api_router.include_router(exports.router)
api_router.include_router(clients.router)
api_router.include_router(quotes.router)
api_router.include_router(sales.router)
api_router.include_router(deals.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup():
    db = get_db()
    # Email index: sparse so users without email (buyer-only clients) don't conflict.
    try:
        await db.users.drop_index("email_1")
    except Exception:
        pass
    await db.users.create_index("email", unique=True, sparse=True)
    await db.properties.create_index("project_id")
    await db.reservations.create_index("client_id")
    await db.reservations.create_index("property_id")
    await db.audit_logs.create_index("at")
    await db.messages.create_index("client_id")
    await db.messages.create_index("created_at")
    # Migrate legacy db.buyers → db.users(role=client) BEFORE seed (idempotent).
    await migrate_buyers_to_clients()
    await seed_all()
    # G.1 cleanup: drop legacy financial collections (sales, quotes, payments, etc.)
    # Idempotent — only runs once via marker doc in `_migrations`.
    await cleanup_old_financial()
    logger.info("BEG Estates API ready (seed complete)")


@app.on_event("shutdown")
async def on_shutdown():
    close_db()

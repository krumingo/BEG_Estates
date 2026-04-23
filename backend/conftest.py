"""Pytest conftest — зарежда .env за локалните тестове."""
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

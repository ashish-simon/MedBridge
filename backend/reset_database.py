"""
MediKiosk Database Reset Utility
Purges all tables in medikiosk.db / PostgreSQL and re-initializes clean empty schema.
"""
import os
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(backend_dir))

from common.db import execute_db, init_db, DB_ENGINE_TYPE

def reset_all_tables():
    print("[Reset DB] Clearing MediKiosk Database...")
    tables = [
        "module_a_transcript",
        "module_a_history",
        "module_b_documents",
        "module_c_summaries",
        "module_d_consent",
        "clinical_intakes",
        "documents",
        "referrals",
        "high_risk_registry",
        "encounters",
        "sessions",
        "patients",
        "users"
    ]
    
    for table in tables:
        # Plain DROP TABLE IF EXISTS works on both PostgreSQL and SQLite
        success = execute_db(f"DROP TABLE IF EXISTS {table};")
        if success:
            print(f"  - Dropped table {table}")
        else:
            print(f"  ! Failed to drop table {table}")

    # Re-initialize clean schema
    init_db()
    print("[Reset DB] Database reset complete! All tables are fresh and empty.\n")

if __name__ == "__main__":
    reset_all_tables()

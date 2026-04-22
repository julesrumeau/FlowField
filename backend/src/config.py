import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://flowfield:flowfield@db:5432/flowfield")

import os
import json

file_path = os.path.join("supabase", "seed_sla_testing.sql")
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# print JSON-escaped string (pure ASCII)
print(json.dumps(content))

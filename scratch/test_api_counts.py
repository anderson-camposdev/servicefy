import urllib.request
import urllib.parse
import json

supabase_url = "https://enxtvrvsfwvcnpyspyfl.supabase.co"
# We read the anon key from .env.local
with open(".env.local", "r") as f:
    env_lines = f.readlines()

anon_key = ""
for line in env_lines:
    if line.startswith("VITE_SUPABASE_ANON_KEY="):
        anon_key = line.split("=")[1].strip()

if not anon_key:
    print("Error: VITE_SUPABASE_ANON_KEY not found in .env.local")
    exit(1)

def check_for_user(email, password, company_id, company_name):
    # Step 1: Sign in
    login_url = f"{supabase_url}/auth/v1/token?grant_type=password"
    login_data = json.dumps({
        "email": email,
        "password": password
    }).encode("utf-8")

    req = urllib.request.Request(
        login_url,
        data=login_data,
        headers={
            "apikey": anon_key,
            "Content-Type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            access_token = res_data["access_token"]
            print(f"Logged in as {email} successfully!")
    except Exception as e:
        print(f"Error logging in as {email}: {e}")
        return

    # Step 2: Query tables
    headers = {
        "apikey": anon_key,
        "Authorization": f"Bearer {access_token}"
    }

    tables = [
        "catalog_categories",
        "catalog_services",
        "catalog_service_symptoms",
        "request_categories",
        "request_items"
    ]

    print(f"--- {company_name} ---")
    for table in tables:
        url = f"{supabase_url}/rest/v1/{table}?select=id&company_id=eq.{company_id}"
        req = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                print(f"Table '{table}' for {company_name}: {len(res_data)} records")
        except Exception as e:
            print(f"Error querying table {table}: {e}")

check_for_user("alice@alpha-sla.tech", "Flowfy@2026", "5e1a0001-1111-1111-1111-111111111111", "Alpha Tech")
print()
check_for_user("bia@beta-sla.hospital", "Flowfy@2026", "5e1a0002-2222-2222-2222-222222222222", "Beta Hospital")

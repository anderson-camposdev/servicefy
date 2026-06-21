import zipfile
import os

zip_path = "flowfy_design.zip"
extract_dir = os.path.join("scratch", "stitch_extract")

os.makedirs(extract_dir, exist_ok=True)
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)
print(f"Extraction completed to: {extract_dir}")

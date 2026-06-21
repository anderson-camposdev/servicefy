import zipfile
import os

zip_path = "flowfy_design.zip"
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    files = zip_ref.namelist()
    print(f"Total files: {len(files)}")
    print("Files in ZIP:")
    for f in files[:50]:  # print first 50 files
        print(f"  {f}")

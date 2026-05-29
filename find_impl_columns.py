import gzip
import json
import os

workspace = r"c:\Users\sebas\OneDrive\Escritorio\prueba indicadores"
gzip_path = os.path.join(workspace, "indicadores_wompi.json.gz")

with gzip.open(gzip_path, 'rb') as f:
    data = json.load(f)

impl_rows = data['implementacion']['bd'] + data['implementacion']['abiertos']

# Print fields that have non-trivial unique values (not just N/A, 0, or Empty)
print("Implementation columns analysis:")
for col in sorted(impl_rows[0].keys()):
    vals = set(str(r.get(col, '')).strip() for r in impl_rows)
    non_trivial = [v for v in vals if v.upper() not in ('', '0', 'N/A', 'NULL', 'NONE')]
    if len(non_trivial) > 1 and len(non_trivial) < 50:
        print(f"Column '{col}' has {len(non_trivial)} non-trivial unique values (sample: {non_trivial[:5]})")

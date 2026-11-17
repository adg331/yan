"""Generate code-native SVG geometry from a downloaded DataV province GeoJSON.

Usage: python3 scripts/generate-map.py /path/to/100000_full.json
"""
import json
import math
import sys
from pathlib import Path

source = json.loads(Path(sys.argv[1]).read_text())
r = math.pi / 180
n = (math.sin(25 * r) + math.sin(47 * r)) / 2
c = math.cos(25 * r) ** 2 + 2 * n * math.sin(25 * r)


def project(point):
    lon, lat = point
    rho = math.sqrt(c - 2 * n * math.sin(lat * r)) / n
    theta = n * (lon - 105) * r
    # SVG y increases downwards, so use +rho*cos(theta).
    return rho * math.sin(theta), rho * math.cos(theta)


def rings(feature):
    coords = feature['geometry']['coordinates']
    return [ring for polygon in coords for ring in polygon] if feature['geometry']['type'] == 'MultiPolygon' else coords


mainland = [project(p) for f in source['features'] for ring in rings(f) for p in ring if p[1] >= 18]
x0 = min(x for x, y in mainland)
x1 = max(x for x, y in mainland)
y0 = min(y for x, y in mainland)
y1 = max(y for x, y in mainland)
scale = min(825 / (x1 - x0), 560 / (y1 - y0))
offset_x = (900 - (x1 - x0) * scale) / 2


def xy(point):
    x, y = project(point)
    return [round((x - x0) * scale + offset_x, 2), round((y - y0) * scale + 24, 2)]


data = []
sea = []
for f in source['features']:
    props = f['properties']
    rs = rings(f)
    path = ''.join('M' + 'L'.join(','.join(map(str, xy(p))) for p in ring) + 'Z' for ring in rs)
    item = {'id': str(props['adcode']), 'path': path}
    if props.get('center'):
        item['label'] = xy(props.get('centroid', props['center']))
    # Insets use the largest ring's box to avoid remote islands shrinking the target.
    points = [xy(p) for p in max(rs, key=len)]
    xs, ys = zip(*points)
    item['bounds'] = [min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys)]
    data.append(item)
    if item['id'] in ('460000', '100000_JD'):
        sea.extend(xy(p) for ring in rs for p in ring)

xs, ys = zip(*sea)
sea_view = [round(min(xs) - 7, 2), round(min(ys) - 10, 2), round(max(xs) - min(xs) + 14, 2), round(max(ys) - min(ys) + 20, 2)]
target = Path(__file__).resolve().parents[1] / 'geo/data/map.js'
target.write_text('export const MAP = ' + json.dumps(data, separators=(',', ':')) + ';\n'
                  + 'export const SOUTH_SEA_VIEW = ' + json.dumps(sea_view) + ';\n')
print(f'Generated {len(data)} features; southern inset: {sea_view}')

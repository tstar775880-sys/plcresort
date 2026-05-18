from PIL import Image
import os

src = "official_map.jpg"
dest = "official_map_rotated.png"

if not os.path.exists(src):
    print(f"Source image {src} not found!")
    exit(1)

print("Loading image...")
img = Image.open(src)

# Check if image has alpha, convert to RGBA for transparent padding
img = img.convert("RGBA")

print("Rotating image by 45 degrees counter-clockwise...")
# Rotate counter-clockwise by 45 deg. expand=True extends the canvas to prevent cropping.
# Fill transparent background.
rotated = img.rotate(45, expand=True, resample=Image.Resampling.BICUBIC)

print(f"Saving output to {dest}...")
rotated.save(dest, "PNG")
print("Done! Rotated image generated successfully.")

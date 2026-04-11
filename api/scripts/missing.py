import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.venue import Venue
from app.services import google_places

def fix():
    db = SessionLocal()
    try:
        venues = db.query(Venue).filter(Venue.photos == None).all()
        print(f"Found {len(venues)} venues missing photos")

        for v in venues:
            print(f"Processing: {v.name} ({v.address})")
            print(f"Current Google ID: {v.google_place_id}")
            
            new_id = google_places.find_place_id(v.name, v.address)
            if not new_id:
                print(f"Could not find a new Place ID for {v.name}")
                continue
                
            if new_id == v.google_place_id:
                print(f"New ID is same as old ID. Checking photos anyway")
            else:
                print(f"Found NEW Place ID: {new_id}")
            
            refs = google_places.get_photo_references(new_id, max_photos=3)
            if refs:
                print(f"Found {len(refs)} photos!")
                v.google_place_id = new_id
                v.photos = refs
                db.commit()
                print(f"Updated {v.name} in database")
            else:
                print(f"Still no photos found for {new_id}")

        print("Finished")
    finally:
        db.close()

if __name__ == "__main__":
    fix()

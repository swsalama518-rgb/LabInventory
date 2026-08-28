from app import app, DEFAULT_CATEGORIES
from models import db, Lab, Category

with app.app_context():
    db.create_all()
    for lab in Lab.query.all():
        for name in DEFAULT_CATEGORIES:
            if not Category.query.filter_by(name=name, lab_id=lab.id).first():
                db.session.add(Category(name=name, lab_id=lab.id))
                print(f"Added category '{name}' to lab '{lab.name}'")
    db.session.commit()
    print("Seeding complete.")

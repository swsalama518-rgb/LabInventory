from app import app, DEFAULT_CATEGORIES
from models import db, Category

with app.app_context():
    db.create_all()
    for name in DEFAULT_CATEGORIES:
        if not Category.query.filter_by(name=name).first():
            db.session.add(Category(name=name))
            print(f"Added category: {name}")
    db.session.commit()
    print("Seeding complete.")

from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Lab(db.Model):
    __tablename__ = "labs"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {"id": self.id, "name": self.name}


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    lab_id = db.Column(db.Integer, db.ForeignKey("labs.id"), nullable=True)
    role = db.Column(db.String(20), nullable=False, default="tech")
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    lab = db.relationship("Lab", backref="users")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "lab_id": self.lab_id,
            "lab_name": self.lab.name if self.lab else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), unique=True, nullable=False)

    supplies = db.relationship("Supply", backref="category", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name}


class Supply(db.Model):
    __tablename__ = "supplies"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=0)
    unit = db.Column(db.String(50), nullable=True)
    location = db.Column(db.String(200), nullable=True)
    expiration_date = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    min_quantity = db.Column(db.Float, nullable=False, default=5)

    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=True)
    lab_id = db.Column(db.Integer, db.ForeignKey("labs.id"), nullable=True)
    # DB column stays "user_id" (pre-existing); Python side is renamed since it now
    # means "who added this," not "who owns this" — ownership is the whole lab.
    created_by_id = db.Column("user_id", db.Integer, db.ForeignKey("users.id"), nullable=False)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    creator = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "quantity": self.quantity,
            "unit": self.unit,
            "location": self.location,
            "expiration_date": self.expiration_date.isoformat() if self.expiration_date else None,
            "notes": self.notes,
            "min_quantity": self.min_quantity,
            "is_low_stock": self.quantity <= self.min_quantity,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "lab_id": self.lab_id,
            "created_by_email": self.creator.email if self.creator else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class SupplyRequest(db.Model):
    __tablename__ = "supply_requests"

    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey("labs.id"), nullable=False)
    supply_id = db.Column(db.Integer, db.ForeignKey("supplies.id"), nullable=True)
    item_name = db.Column(db.String(200), nullable=False)
    quantity_requested = db.Column(db.Float, nullable=False, default=1)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), nullable=False, default="pending")

    requested_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    reviewed_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)

    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    reviewed_at = db.Column(db.DateTime, nullable=True)

    supply = db.relationship("Supply", foreign_keys=[supply_id])
    requested_by = db.relationship("User", foreign_keys=[requested_by_id])
    reviewed_by = db.relationship("User", foreign_keys=[reviewed_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "supply_id": self.supply_id,
            "item_name": self.item_name,
            "quantity_requested": self.quantity_requested,
            "notes": self.notes,
            "status": self.status,
            "requested_by_email": self.requested_by.email if self.requested_by else None,
            "reviewed_by_email": self.reviewed_by.email if self.reviewed_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
        }

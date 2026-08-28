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
    # "pending" members can't log in until a lab admin approves them and sets
    # their role; the user who creates a brand-new lab is auto-approved as
    # admin since there's no one else yet to approve them.
    status = db.Column(db.String(20), nullable=False, default="approved")
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
            "status": self.status,
            "lab_id": self.lab_id,
            "lab_name": self.lab.name if self.lab else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Category(db.Model):
    __tablename__ = "categories"
    __table_args__ = (db.UniqueConstraint("lab_id", "name", name="uq_category_lab_name"),)

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    lab_id = db.Column(db.Integer, db.ForeignKey("labs.id"), nullable=False)

    supplies = db.relationship("Supply", backref="category", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "lab_id": self.lab_id}


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


class Equipment(db.Model):
    __tablename__ = "equipment"
    __table_args__ = (db.UniqueConstraint("lab_id", "name", name="uq_equipment_lab_name"),)

    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey("labs.id"), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    equipment_type = db.Column(db.String(50), nullable=False)

    logs = db.relationship("IncubationLog", backref="equipment", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "equipment_type": self.equipment_type,
            "lab_id": self.lab_id,
        }


class IncubationLog(db.Model):
    __tablename__ = "incubation_logs"

    id = db.Column(db.Integer, primary_key=True)
    lab_id = db.Column(db.Integer, db.ForeignKey("labs.id"), nullable=False)
    equipment_id = db.Column(db.Integer, db.ForeignKey("equipment.id"), nullable=True)
    sample_name = db.Column(db.String(200), nullable=False)
    sample_count = db.Column(db.Integer, nullable=False, default=1)
    # Free text, not a User FK: whoever the samples belong to may not be the
    # person logging them (e.g. a coordinator logging on a grad student's
    # behalf), and may not have an account in the system at all.
    researcher_name = db.Column(db.String(150), nullable=True)
    notes = db.Column(db.Text, nullable=True)

    started_at = db.Column(db.DateTime, nullable=False)
    ends_at = db.Column(db.DateTime, nullable=False)
    picked_up_at = db.Column(db.DateTime, nullable=True)
    reminder_sent_at = db.Column(db.DateTime, nullable=True)

    created_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    created_by = db.relationship("User", foreign_keys=[created_by_id])

    def to_dict(self):
        now = datetime.now(timezone.utc)
        ends_at = self.ends_at.replace(tzinfo=timezone.utc) if self.ends_at else None
        return {
            "id": self.id,
            "equipment_id": self.equipment_id,
            "equipment_name": self.equipment.name if self.equipment else None,
            "equipment_type": self.equipment.equipment_type if self.equipment else None,
            "sample_name": self.sample_name,
            "sample_count": self.sample_count,
            "researcher_name": self.researcher_name,
            "notes": self.notes,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ends_at": self.ends_at.isoformat() if self.ends_at else None,
            "picked_up_at": self.picked_up_at.isoformat() if self.picked_up_at else None,
            "is_overdue": bool(ends_at and not self.picked_up_at and ends_at <= now),
            "created_by_email": self.created_by.email if self.created_by else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

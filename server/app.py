import os
import re
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote

import requests
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
    current_user as _jwt_current_user,
)

from sqlalchemy import inspect

from models import db, Lab, User, Category, Supply, SupplyRequest, Equipment, IncubationLog

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
DEFAULT_CATEGORIES = ["Reagents", "Consumables", "Equipment", "Chemicals"]

# "coordinator" is the only role with admin-level permissions (approve
# requests, approve/manage members). The rest are informational labels with
# equal, full CRUD access to the lab's inventory and equipment log.
COORDINATOR_ROLE = "coordinator"
ROLE_CHOICES = ["coordinator", "faculty", "grad_student", "undergrad", "staff"]
JOINABLE_ROLES = ["faculty", "grad_student", "undergrad", "staff"]

# Optional: outgoing email for incubation-end reminders. Leave unset to skip
# sending (the /api/reminders/check endpoint still runs, just sends nothing).
SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
FROM_EMAIL = os.environ.get("FROM_EMAIL", SMTP_USER)
# Shared secret an external scheduler (e.g. cron-job.org) presents to trigger
# a reminder check, since there's no logged-in user making that request.
REMINDER_SECRET = os.environ.get("REMINDER_SECRET")
PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

SECRET_KEY = os.environ.get("SECRET_KEY")
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
if not SECRET_KEY or not JWT_SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY and JWT_SECRET_KEY must be set. Copy server/.env.example to "
        "server/.env and fill in real values (see README)."
    )

# Optional: restrict signup to one or more email domains (e.g. a
# university's), comma-separated. Leave unset to allow any email domain.
ALLOWED_EMAIL_DOMAINS = [
    d.strip().lower().lstrip("@")
    for d in (os.environ.get("ALLOWED_EMAIL_DOMAINS") or "").split(",")
    if d.strip()
]

# Comma-separated list of allowed frontend origins for CORS, e.g.
# "https://labinventory.onrender.com". Defaults to "*" for local dev.
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
cors_origins = (
    "*" if CORS_ORIGINS == "*" else [o.strip() for o in CORS_ORIGINS.split(",") if o.strip()]
)

app = Flask(__name__)

CORS(app, origins=cors_origins)

database_url = os.environ.get("DATABASE_URL")
if database_url:
    # Some providers (Heroku-style) still hand out "postgres://"; SQLAlchemy's
    # psycopg2 dialect requires "postgresql://".
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
else:
    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"

app.config["SECRET_KEY"] = SECRET_KEY
app.config["JWT_SECRET_KEY"] = JWT_SECRET_KEY

db.init_app(app)
jwt = JWTManager(app)


@jwt.user_identity_loader
def user_identity_lookup(user_id):
    return str(user_id)


@jwt.user_lookup_loader
def user_lookup_callback(_jwt_header, jwt_data):
    user = User.query.get(int(jwt_data["sub"]))
    # Treat a since-revoked or not-yet-approved account like an invalid
    # token, even if it was issued before the account lost access.
    if user and user.status == "approved":
        return user
    return None


@jwt.user_lookup_error_loader
def user_lookup_error(_jwt_header, _jwt_data):
    return jsonify({"error": "Account not found or no longer approved"}), 401


def current_user():
    return _jwt_current_user


def current_user_id():
    return current_user().id


def parse_date(value):
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def pubchem_lookup(name):
    """Look up a chemical by name via PubChem PUG REST. Returns None if no match."""
    prop_url = (
        f"{PUBCHEM_BASE}/compound/name/{quote(name, safe='')}"
        "/property/MolecularFormula,MolecularWeight,IUPACName/JSON"
    )
    prop_resp = requests.get(prop_url, timeout=5)
    if prop_resp.status_code == 404:
        return None
    prop_resp.raise_for_status()
    props = prop_resp.json()["PropertyTable"]["Properties"][0]
    cid = props["CID"]

    cas_number = None
    try:
        syn_resp = requests.get(f"{PUBCHEM_BASE}/compound/cid/{cid}/synonyms/JSON", timeout=5)
        syn_resp.raise_for_status()
        synonyms = syn_resp.json()["InformationList"]["Information"][0].get("Synonym", [])
        cas_number = next((s for s in synonyms if CAS_RE.match(s)), None)
    except requests.RequestException:
        pass

    return {
        "cid": cid,
        "molecular_formula": props.get("MolecularFormula"),
        "molecular_weight": props.get("MolecularWeight"),
        "iupac_name": props.get("IUPACName"),
        "cas_number": cas_number,
        "pubchem_url": f"https://pubchem.ncbi.nlm.nih.gov/compound/{cid}",
    }


def send_email(to_email, subject, body):
    """Send a plain-text email over SMTP. No-ops (returns False) if SMTP isn't
    configured, so the reminder-check endpoint still works without email set up."""
    if not (SMTP_HOST and SMTP_USER and SMTP_PASSWORD and FROM_EMAIL):
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.send_message(msg)
    return True


@app.route("/")
def home():
    return {"message": "Lab Manager API running"}


# ---------- Auth ----------

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    lab_name = (data.get("lab_name") or "").strip()

    if not email or not EMAIL_RE.match(email):
        return jsonify({"error": "A valid email is required"}), 400
    if ALLOWED_EMAIL_DOMAINS and not any(email.endswith(f"@{d}") for d in ALLOWED_EMAIL_DOMAINS):
        allowed = ", ".join(f"@{d}" for d in ALLOWED_EMAIL_DOMAINS)
        return jsonify({"error": f"Email must be one of: {allowed}"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if not lab_name:
        return jsonify({"error": "Lab name is required"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists"}), 409

    requested_role = data.get("role") or "staff"
    if requested_role not in JOINABLE_ROLES:
        return jsonify({"error": f"Role must be one of: {', '.join(JOINABLE_ROLES)}"}), 400

    lab = Lab.query.filter(Lab.name.ilike(lab_name)).first()
    creating_new_lab = lab is None
    if creating_new_lab:
        lab = Lab(name=lab_name)
        db.session.add(lab)
        db.session.flush()
        for name in DEFAULT_CATEGORIES:
            db.session.add(Category(name=name, lab_id=lab.id))

    # The first person into a lab has no one to approve them, so they become
    # its Lab Coordinator immediately. Everyone joining an existing lab starts
    # pending, with their chosen (non-coordinator) role, until that lab's
    # coordinator approves them — self-declaring "coordinator" to join
    # someone else's lab is not possible.
    user = User(
        email=email,
        lab_id=lab.id,
        role=COORDINATOR_ROLE if creating_new_lab else requested_role,
        status="approved" if creating_new_lab else "pending",
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    if not creating_new_lab:
        return jsonify({
            "message": "Account created. A lab coordinator needs to approve your access before you can log in.",
            "pending": True,
        }), 201

    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token, "user": user.to_dict()}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "Invalid email or password"}), 401
    if user.status != "approved":
        return jsonify({"error": "Your account is pending approval from a lab coordinator"}), 403

    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token, "user": user.to_dict()}), 200


# ---------- Categories ----------

@app.route("/api/categories", methods=["GET"])
@jwt_required()
def list_categories():
    categories = (
        Category.query.filter_by(lab_id=current_user().lab_id).order_by(Category.name.asc()).all()
    )
    return jsonify([c.to_dict() for c in categories]), 200


@app.route("/api/categories", methods=["POST"])
@jwt_required()
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400

    lab_id = current_user().lab_id
    existing = Category.query.filter(Category.name.ilike(name), Category.lab_id == lab_id).first()
    if existing:
        return jsonify({"error": "Category already exists"}), 409

    category = Category(name=name, lab_id=lab_id)
    db.session.add(category)
    db.session.commit()
    return jsonify(category.to_dict()), 201


@app.route("/api/categories/<int:category_id>", methods=["PATCH"])
@jwt_required()
def update_category(category_id):
    category = Category.query.filter_by(id=category_id, lab_id=current_user().lab_id).first()
    if not category:
        return jsonify({"error": "Category not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400

    existing = Category.query.filter(
        Category.name.ilike(name), Category.lab_id == category.lab_id, Category.id != category_id
    ).first()
    if existing:
        return jsonify({"error": "Category already exists"}), 409

    category.name = name
    db.session.commit()
    return jsonify(category.to_dict()), 200


@app.route("/api/categories/<int:category_id>", methods=["DELETE"])
@jwt_required()
def delete_category(category_id):
    category = Category.query.filter_by(id=category_id, lab_id=current_user().lab_id).first()
    if not category:
        return jsonify({"error": "Category not found"}), 404

    Supply.query.filter_by(category_id=category_id).update({"category_id": None})
    db.session.delete(category)
    db.session.commit()
    return jsonify({"message": "Category deleted"}), 200


# ---------- Supplies ----------

@app.route("/api/supplies", methods=["GET"])
@jwt_required()
def list_supplies():
    query = Supply.query.filter_by(lab_id=current_user().lab_id)

    category_id = request.args.get("category_id")
    if category_id:
        query = query.filter(Supply.category_id == category_id)

    search = request.args.get("search")
    if search:
        query = query.filter(Supply.name.ilike(f"%{search}%"))

    if request.args.get("low_stock") == "true":
        query = query.filter(Supply.quantity <= Supply.min_quantity)

    sort = request.args.get("sort", "name")
    if sort == "category":
        query = query.outerjoin(Category).order_by(Category.name.asc(), Supply.name.asc())
    elif sort == "quantity":
        query = query.order_by(Supply.quantity.asc(), Supply.name.asc())
    else:
        query = query.order_by(Supply.name.asc())

    supplies = query.all()
    return jsonify([s.to_dict() for s in supplies]), 200


@app.route("/api/supplies/<int:supply_id>", methods=["GET"])
@jwt_required()
def get_supply(supply_id):
    supply = Supply.query.filter_by(id=supply_id, lab_id=current_user().lab_id).first()
    if not supply:
        return jsonify({"error": "Supply not found"}), 404
    return jsonify(supply.to_dict()), 200


@app.route("/api/supplies/<int:supply_id>/lookup", methods=["GET"])
@jwt_required()
def lookup_supply(supply_id):
    supply = Supply.query.filter_by(id=supply_id, lab_id=current_user().lab_id).first()
    if not supply:
        return jsonify({"error": "Supply not found"}), 404

    try:
        result = pubchem_lookup(supply.name)
    except requests.RequestException:
        return jsonify({"error": "PubChem lookup failed. Try again later."}), 502

    if result is None:
        return jsonify({"error": f'No PubChem match found for "{supply.name}"'}), 404

    return jsonify(result), 200


@app.route("/api/supplies", methods=["POST"])
@jwt_required()
def create_supply():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Supply name is required"}), 400

    category_id = data.get("category_id")
    if category_id and not Category.query.filter_by(
        id=category_id, lab_id=current_user().lab_id
    ).first():
        return jsonify({"error": "Category not found"}), 400

    try:
        supply = Supply(
            name=name,
            quantity=float(data.get("quantity", 0) or 0),
            unit=data.get("unit"),
            location=data.get("location"),
            expiration_date=parse_date(data.get("expiration_date")),
            notes=data.get("notes"),
            min_quantity=float(data.get("min_quantity", 5) or 5),
            category_id=category_id,
            lab_id=current_user().lab_id,
            created_by_id=current_user_id(),
        )
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid quantity, min_quantity, or expiration_date"}), 400

    db.session.add(supply)
    db.session.commit()
    return jsonify(supply.to_dict()), 201


@app.route("/api/supplies/<int:supply_id>", methods=["PATCH"])
@jwt_required()
def update_supply(supply_id):
    supply = Supply.query.filter_by(id=supply_id, lab_id=current_user().lab_id).first()
    if not supply:
        return jsonify({"error": "Supply not found"}), 404

    data = request.get_json(silent=True) or {}

    if "category_id" in data and data["category_id"] and not Category.query.filter_by(
        id=data["category_id"], lab_id=current_user().lab_id
    ).first():
        return jsonify({"error": "Category not found"}), 400

    try:
        if "name" in data:
            name = (data["name"] or "").strip()
            if not name:
                return jsonify({"error": "Supply name cannot be empty"}), 400
            supply.name = name
        if "quantity" in data:
            supply.quantity = float(data["quantity"])
        if "unit" in data:
            supply.unit = data["unit"]
        if "location" in data:
            supply.location = data["location"]
        if "expiration_date" in data:
            supply.expiration_date = parse_date(data["expiration_date"])
        if "notes" in data:
            supply.notes = data["notes"]
        if "min_quantity" in data:
            supply.min_quantity = float(data["min_quantity"])
        if "category_id" in data:
            supply.category_id = data["category_id"]
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid quantity, min_quantity, or expiration_date"}), 400

    db.session.commit()
    return jsonify(supply.to_dict()), 200


@app.route("/api/supplies/<int:supply_id>", methods=["DELETE"])
@jwt_required()
def delete_supply(supply_id):
    supply = Supply.query.filter_by(id=supply_id, lab_id=current_user().lab_id).first()
    if not supply:
        return jsonify({"error": "Supply not found"}), 404

    db.session.delete(supply)
    db.session.commit()
    return jsonify({"message": "Supply deleted"}), 200


# ---------- Supply requests ----------

@app.route("/api/requests", methods=["GET"])
@jwt_required()
def list_requests():
    user = current_user()
    query = SupplyRequest.query.filter_by(lab_id=user.lab_id)

    status = request.args.get("status")
    if status:
        query = query.filter_by(status=status)

    reqs = query.order_by(SupplyRequest.created_at.desc()).all()
    return jsonify([r.to_dict() for r in reqs]), 200


@app.route("/api/requests", methods=["POST"])
@jwt_required()
def create_request():
    user = current_user()
    data = request.get_json(silent=True) or {}

    supply = None
    supply_id = data.get("supply_id")
    if supply_id:
        supply = Supply.query.filter_by(id=supply_id, lab_id=user.lab_id).first()
        if not supply:
            return jsonify({"error": "Supply not found"}), 404

    item_name = (data.get("item_name") or "").strip()
    if not item_name and supply:
        item_name = supply.name
    if not item_name:
        return jsonify({"error": "Item name is required"}), 400

    try:
        quantity_requested = float(data.get("quantity_requested", 1) or 1)
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid quantity"}), 400

    req = SupplyRequest(
        lab_id=user.lab_id,
        supply_id=supply.id if supply else None,
        item_name=item_name,
        quantity_requested=quantity_requested,
        notes=data.get("notes"),
        requested_by_id=user.id,
    )
    db.session.add(req)
    db.session.commit()
    return jsonify(req.to_dict()), 201


@app.route("/api/requests/<int:request_id>", methods=["PATCH"])
@jwt_required()
def update_request(request_id):
    user = current_user()
    req = SupplyRequest.query.filter_by(id=request_id, lab_id=user.lab_id).first()
    if not req:
        return jsonify({"error": "Request not found"}), 404

    if user.role != COORDINATOR_ROLE:
        return jsonify({"error": "Only the lab coordinator can approve or reject requests"}), 403

    data = request.get_json(silent=True) or {}
    new_status = data.get("status")
    if new_status not in ("approved", "rejected"):
        return jsonify({"error": "Status must be 'approved' or 'rejected'"}), 400

    req.status = new_status
    req.reviewed_by_id = user.id
    req.reviewed_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(req.to_dict()), 200


@app.route("/api/requests/<int:request_id>", methods=["DELETE"])
@jwt_required()
def delete_request(request_id):
    user = current_user()
    req = SupplyRequest.query.filter_by(id=request_id, lab_id=user.lab_id).first()
    if not req:
        return jsonify({"error": "Request not found"}), 404

    if req.status != "pending":
        return jsonify({"error": "Only pending requests can be cancelled"}), 400
    if req.requested_by_id != user.id and user.role != COORDINATOR_ROLE:
        return jsonify({"error": "You can only cancel your own requests"}), 403

    db.session.delete(req)
    db.session.commit()
    return jsonify({"message": "Request cancelled"}), 200


# ---------- Lab settings ----------

@app.route("/api/lab", methods=["PATCH"])
@jwt_required()
def update_lab():
    user = current_user()
    if user.role != COORDINATOR_ROLE:
        return jsonify({"error": "Only the lab coordinator can rename the lab"}), 403

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Lab name is required"}), 400

    existing = Lab.query.filter(Lab.name.ilike(name), Lab.id != user.lab_id).first()
    if existing:
        return jsonify({"error": "A lab with that name already exists"}), 409

    lab = Lab.query.get(user.lab_id)
    lab.name = name
    db.session.commit()
    return jsonify(lab.to_dict()), 200


# ---------- Lab members ----------

@app.route("/api/lab/members", methods=["GET"])
@jwt_required()
def list_members():
    user = current_user()
    if user.role != COORDINATOR_ROLE:
        return jsonify({"error": "Only the lab coordinator can view members"}), 403

    members = User.query.filter_by(lab_id=user.lab_id).order_by(User.created_at.asc()).all()
    return jsonify([m.to_dict() for m in members]), 200


@app.route("/api/lab/members/<int:member_id>", methods=["PATCH"])
@jwt_required()
def update_member(member_id):
    user = current_user()
    if user.role != COORDINATOR_ROLE:
        return jsonify({"error": "Only the lab coordinator can approve or update members"}), 403

    member = User.query.filter_by(id=member_id, lab_id=user.lab_id).first()
    if not member:
        return jsonify({"error": "Member not found"}), 404

    data = request.get_json(silent=True) or {}
    new_role = data.get("role")
    new_status = data.get("status")

    if new_role is not None and new_role not in ROLE_CHOICES:
        return jsonify({"error": f"Role must be one of: {', '.join(ROLE_CHOICES)}"}), 400
    if new_status is not None and new_status not in ("approved", "pending"):
        return jsonify({"error": "Status must be 'approved' or 'pending'"}), 400

    would_demote = (
        new_role is not None and new_role != COORDINATOR_ROLE and member.role == COORDINATOR_ROLE
    ) or (new_status == "pending" and member.status == "approved")
    if would_demote:
        other_coordinators = User.query.filter(
            User.lab_id == user.lab_id,
            User.role == COORDINATOR_ROLE,
            User.status == "approved",
            User.id != member.id,
        ).count()
        if other_coordinators == 0:
            return jsonify({"error": "A lab needs at least one approved coordinator"}), 400

    if new_role is not None:
        member.role = new_role
    if new_status is not None:
        member.status = new_status

    db.session.commit()
    return jsonify(member.to_dict()), 200


@app.route("/api/lab/members/<int:member_id>", methods=["DELETE"])
@jwt_required()
def delete_member(member_id):
    user = current_user()
    if user.role != COORDINATOR_ROLE:
        return jsonify({"error": "Only the lab coordinator can remove members"}), 403

    member = User.query.filter_by(id=member_id, lab_id=user.lab_id).first()
    if not member:
        return jsonify({"error": "Member not found"}), 404

    if member.id == user.id:
        return jsonify({"error": "You can't remove yourself"}), 400

    if member.role == COORDINATOR_ROLE and member.status == "approved":
        other_coordinators = User.query.filter(
            User.lab_id == user.lab_id,
            User.role == COORDINATOR_ROLE,
            User.status == "approved",
            User.id != member.id,
        ).count()
        if other_coordinators == 0:
            return jsonify({"error": "A lab needs at least one approved coordinator"}), 400

    db.session.delete(member)
    db.session.commit()
    return jsonify({"message": "Member removed"}), 200


# ---------- Equipment ----------

@app.route("/api/equipment", methods=["GET"])
@jwt_required()
def list_equipment():
    equipment = (
        Equipment.query.filter_by(lab_id=current_user().lab_id).order_by(Equipment.name.asc()).all()
    )
    return jsonify([e.to_dict() for e in equipment]), 200


@app.route("/api/equipment", methods=["POST"])
@jwt_required()
def create_equipment():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    equipment_type = (data.get("equipment_type") or "").strip()
    if not name:
        return jsonify({"error": "Equipment name is required"}), 400
    if not equipment_type:
        return jsonify({"error": "Equipment type is required"}), 400

    lab_id = current_user().lab_id
    if Equipment.query.filter(Equipment.name.ilike(name), Equipment.lab_id == lab_id).first():
        return jsonify({"error": "Equipment with that name already exists"}), 409

    equipment = Equipment(name=name, equipment_type=equipment_type, lab_id=lab_id)
    db.session.add(equipment)
    db.session.commit()
    return jsonify(equipment.to_dict()), 201


@app.route("/api/equipment/<int:equipment_id>", methods=["PATCH"])
@jwt_required()
def update_equipment(equipment_id):
    equipment = Equipment.query.filter_by(id=equipment_id, lab_id=current_user().lab_id).first()
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 404

    data = request.get_json(silent=True) or {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "Equipment name cannot be empty"}), 400
        equipment.name = name
    if "equipment_type" in data:
        equipment_type = (data["equipment_type"] or "").strip()
        if not equipment_type:
            return jsonify({"error": "Equipment type cannot be empty"}), 400
        equipment.equipment_type = equipment_type

    db.session.commit()
    return jsonify(equipment.to_dict()), 200


@app.route("/api/equipment/<int:equipment_id>", methods=["DELETE"])
@jwt_required()
def delete_equipment(equipment_id):
    equipment = Equipment.query.filter_by(id=equipment_id, lab_id=current_user().lab_id).first()
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 404

    active_logs = IncubationLog.query.filter_by(
        equipment_id=equipment_id, picked_up_at=None
    ).count()
    if active_logs > 0:
        return jsonify({
            "error": "This equipment has active incubation logs. Pick those up or cancel them first."
        }), 400

    # Completed logs keep their history but lose the equipment reference,
    # same as how deleting a Category un-categorizes its Supplies.
    IncubationLog.query.filter_by(equipment_id=equipment_id).update({"equipment_id": None})
    db.session.delete(equipment)
    db.session.commit()
    return jsonify({"message": "Equipment deleted"}), 200


# ---------- Incubation logs ----------

@app.route("/api/incubations", methods=["GET"])
@jwt_required()
def list_incubations():
    query = IncubationLog.query.filter_by(lab_id=current_user().lab_id)

    equipment_id = request.args.get("equipment_id")
    if equipment_id:
        query = query.filter(IncubationLog.equipment_id == equipment_id)

    status = request.args.get("status")
    if status == "active":
        query = query.filter(IncubationLog.picked_up_at.is_(None))
    elif status == "completed":
        query = query.filter(IncubationLog.picked_up_at.isnot(None))

    logs = query.order_by(IncubationLog.ends_at.asc()).all()
    return jsonify([log.to_dict() for log in logs]), 200


@app.route("/api/incubations", methods=["POST"])
@jwt_required()
def create_incubation():
    user = current_user()
    data = request.get_json(silent=True) or {}

    equipment_id = data.get("equipment_id")
    equipment = Equipment.query.filter_by(id=equipment_id, lab_id=user.lab_id).first()
    if not equipment:
        return jsonify({"error": "Equipment not found"}), 400

    sample_name = (data.get("sample_name") or "").strip()
    if not sample_name:
        return jsonify({"error": "Sample name is required"}), 400

    try:
        sample_count = int(data.get("sample_count", 1) or 1)
        if sample_count < 1:
            raise ValueError
    except (ValueError, TypeError):
        return jsonify({"error": "Sample count must be a positive whole number"}), 400

    try:
        started_at = (
            datetime.fromisoformat(data["started_at"])
            if data.get("started_at")
            else datetime.now(timezone.utc)
        )
        if data.get("ends_at"):
            ends_at = datetime.fromisoformat(data["ends_at"])
        elif data.get("duration_hours") is not None:
            ends_at = started_at + timedelta(hours=float(data["duration_hours"]))
        else:
            return jsonify({"error": "Provide either ends_at or duration_hours"}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "Invalid started_at, ends_at, or duration_hours"}), 400

    if ends_at <= started_at:
        return jsonify({"error": "End time must be after the start time"}), 400

    log = IncubationLog(
        lab_id=user.lab_id,
        equipment_id=equipment.id,
        sample_name=sample_name,
        sample_count=sample_count,
        researcher_name=(data.get("researcher_name") or "").strip() or None,
        notes=data.get("notes"),
        started_at=started_at,
        ends_at=ends_at,
        created_by_id=user.id,
    )
    db.session.add(log)
    db.session.commit()
    return jsonify(log.to_dict()), 201


@app.route("/api/incubations/<int:log_id>", methods=["PATCH"])
@jwt_required()
def update_incubation(log_id):
    log = IncubationLog.query.filter_by(id=log_id, lab_id=current_user().lab_id).first()
    if not log:
        return jsonify({"error": "Incubation log not found"}), 404

    data = request.get_json(silent=True) or {}
    if data.get("picked_up") is True:
        log.picked_up_at = datetime.now(timezone.utc)
    if "notes" in data:
        log.notes = data["notes"]
    if "researcher_name" in data:
        log.researcher_name = (data["researcher_name"] or "").strip() or None
    if "sample_count" in data:
        try:
            sample_count = int(data["sample_count"])
            if sample_count < 1:
                raise ValueError
            log.sample_count = sample_count
        except (ValueError, TypeError):
            return jsonify({"error": "Sample count must be a positive whole number"}), 400

    db.session.commit()
    return jsonify(log.to_dict()), 200


@app.route("/api/incubations/<int:log_id>", methods=["DELETE"])
@jwt_required()
def delete_incubation(log_id):
    log = IncubationLog.query.filter_by(id=log_id, lab_id=current_user().lab_id).first()
    if not log:
        return jsonify({"error": "Incubation log not found"}), 404

    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Incubation log deleted"}), 200


@app.route("/api/reminders/check", methods=["POST"])
def check_reminders():
    """Machine-to-machine endpoint for an external scheduler (e.g. cron-job.org)
    to trigger incubation-end reminder emails, since Render's free tier can't
    run its own background scheduler while sleeping. Protected by a shared
    secret instead of a user JWT."""
    if not REMINDER_SECRET or request.headers.get("X-Reminder-Key") != REMINDER_SECRET:
        return jsonify({"error": "Unauthorized"}), 401

    now = datetime.now(timezone.utc)
    due = IncubationLog.query.filter(
        IncubationLog.ends_at <= now,
        IncubationLog.picked_up_at.is_(None),
        IncubationLog.reminder_sent_at.is_(None),
    ).all()

    sent = 0
    failed = 0
    for log in due:
        recipient = log.created_by.email if log.created_by else None
        email_ok = True
        if recipient:
            body = (
                f"Incubation done: \"{log.sample_name}\" in {log.equipment.name} "
                f"finished at {log.ends_at.isoformat()}. Please pick up the sample."
            )
            try:
                if send_email(recipient, f"Pick up: {log.sample_name} ({log.equipment.name})", body):
                    sent += 1
            except Exception:
                # Don't let a transient SMTP failure crash the whole check or
                # silently mark this reminder as sent — leave it for retry on
                # the next scheduled call.
                app.logger.exception("Failed to send reminder email for log %s", log.id)
                email_ok = False
                failed += 1
        if email_ok:
            log.reminder_sent_at = now

    db.session.commit()
    return jsonify({"checked": len(due), "emails_sent": sent, "emails_failed": failed}), 200


# ---------- Dashboard ----------

@app.route("/api/dashboard", methods=["GET"])
@jwt_required()
def dashboard():
    user = current_user()
    supplies = Supply.query.filter_by(lab_id=user.lab_id).all()

    low_stock = [s for s in supplies if s.quantity <= s.min_quantity]
    recent = sorted(supplies, key=lambda s: s.updated_at, reverse=True)[:5]
    pending_requests_count = SupplyRequest.query.filter_by(
        lab_id=user.lab_id, status="pending"
    ).count()

    now = datetime.now(timezone.utc)
    active_incubations = IncubationLog.query.filter_by(
        lab_id=user.lab_id, picked_up_at=None
    ).order_by(IncubationLog.ends_at.asc()).all()
    overdue_incubations = [log for log in active_incubations if log.ends_at.replace(tzinfo=timezone.utc) <= now]

    incubators = Equipment.query.filter_by(lab_id=user.lab_id, equipment_type="Incubator").all()
    occupied_incubator_ids = {
        log.equipment_id for log in active_incubations if log.equipment_id in {e.id for e in incubators}
    }

    return jsonify({
        "total_supplies": len(supplies),
        "low_stock_count": len(low_stock),
        "low_stock_items": [s.to_dict() for s in low_stock[:10]],
        "recent_updates": [s.to_dict() for s in recent],
        "pending_requests_count": pending_requests_count,
        "active_incubations_count": len(active_incubations),
        "overdue_incubations": [log.to_dict() for log in overdue_incubations[:10]],
        "total_incubators": len(incubators),
        "available_incubators": len(incubators) - len(occupied_incubator_ids),
    }), 200


# ---------- JWT error handlers ----------

@jwt.unauthorized_loader
def unauthorized(reason):
    return jsonify({"error": "Missing or invalid token", "detail": reason}), 401


@jwt.invalid_token_loader
def invalid_token(reason):
    return jsonify({"error": "Invalid token", "detail": reason}), 422


@jwt.expired_token_loader
def expired_token(_header, _payload):
    return jsonify({"error": "Token has expired"}), 401


def _column_exists(conn, table, column):
    # Dialect-agnostic (works on both SQLite and Postgres), unlike raw
    # "PRAGMA table_info" which only SQLite understands.
    columns = [col["name"] for col in inspect(conn).get_columns(table)]
    return column in columns


with app.app_context():
    db.create_all()

    # Lightweight migration: add columns introduced after initial table
    # creation to databases that may already exist without them (no Alembic
    # in this project — these are idempotent no-ops once the columns exist).
    with db.engine.begin() as conn:
        if not _column_exists(conn, "users", "lab_id"):
            conn.execute(db.text("ALTER TABLE users ADD COLUMN lab_id INTEGER"))
        if not _column_exists(conn, "users", "role"):
            conn.execute(db.text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'tech'"))
        if not _column_exists(conn, "users", "status"):
            conn.execute(
                db.text("ALTER TABLE users ADD COLUMN status VARCHAR(20) DEFAULT 'approved'")
            )
        if not _column_exists(conn, "supplies", "lab_id"):
            conn.execute(db.text("ALTER TABLE supplies ADD COLUMN lab_id INTEGER"))

    # Backfill: any pre-existing user without a lab gets their own personal lab
    # (as admin), and their existing supplies move into that lab. Preserves data
    # created before labs existed instead of discarding it.
    for user in User.query.filter(User.lab_id.is_(None)).all():
        base_name = f"{user.email.split('@')[0]}'s Lab"
        lab_name = base_name
        suffix = 1
        while Lab.query.filter_by(name=lab_name).first():
            suffix += 1
            lab_name = f"{base_name} {suffix}"

        lab = Lab(name=lab_name)
        db.session.add(lab)
        db.session.flush()

        user.lab_id = lab.id
        user.role = COORDINATOR_ROLE
        user.status = "approved"
        Supply.query.filter_by(created_by_id=user.id).filter(Supply.lab_id.is_(None)).update(
            {"lab_id": lab.id}
        )
    db.session.commit()

    # Every lab should have the default categories, whether it was just
    # created above or already existed (idempotent: skips ones already present).
    for lab in Lab.query.all():
        for name in DEFAULT_CATEGORIES:
            if not Category.query.filter_by(name=name, lab_id=lab.id).first():
                db.session.add(Category(name=name, lab_id=lab.id))
    db.session.commit()


if __name__ == "__main__":
    app.run(port=5050, debug=True)

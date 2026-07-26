import os
import re
from datetime import datetime, timezone
from urllib.parse import quote

import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
)

from models import db, Lab, User, Category, Supply, SupplyRequest

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CAS_RE = re.compile(r"^\d{2,7}-\d{2}-\d$")
DEFAULT_CATEGORIES = ["Reagents", "Consumables", "Equipment", "Chemicals"]
PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug"

app = Flask(__name__)

CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(BASE_DIR, 'database.db')}"
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key-change-later")
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "secret-key-change-later")

db.init_app(app)
jwt = JWTManager(app)


def current_user_id():
    return int(get_jwt_identity())


def current_user():
    return User.query.get(current_user_id())


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


@app.route("/")
def home():
    return {"message": "LabInventory API running"}


# ---------- Auth ----------

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    lab_name = (data.get("lab_name") or "").strip()
    role = data.get("role") or "tech"

    if not email or not EMAIL_RE.match(email):
        return jsonify({"error": "A valid email is required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if not lab_name:
        return jsonify({"error": "Lab name is required"}), 400
    if role not in ("admin", "tech"):
        return jsonify({"error": "Role must be 'admin' or 'tech'"}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "An account with this email already exists"}), 409

    lab = Lab.query.filter(Lab.name.ilike(lab_name)).first()
    if not lab:
        lab = Lab(name=lab_name)
        db.session.add(lab)
        db.session.flush()

    user = User(email=email, lab_id=lab.id, role=role)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

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

    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token, "user": user.to_dict()}), 200


# ---------- Categories ----------

@app.route("/api/categories", methods=["GET"])
@jwt_required()
def list_categories():
    categories = Category.query.order_by(Category.name.asc()).all()
    return jsonify([c.to_dict() for c in categories]), 200


@app.route("/api/categories", methods=["POST"])
@jwt_required()
def create_category():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400

    existing = Category.query.filter(Category.name.ilike(name)).first()
    if existing:
        return jsonify({"error": "Category already exists"}), 409

    category = Category(name=name)
    db.session.add(category)
    db.session.commit()
    return jsonify(category.to_dict()), 201


@app.route("/api/categories/<int:category_id>", methods=["PATCH"])
@jwt_required()
def update_category(category_id):
    category = Category.query.get(category_id)
    if not category:
        return jsonify({"error": "Category not found"}), 404

    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400

    existing = Category.query.filter(Category.name.ilike(name), Category.id != category_id).first()
    if existing:
        return jsonify({"error": "Category already exists"}), 409

    category.name = name
    db.session.commit()
    return jsonify(category.to_dict()), 200


@app.route("/api/categories/<int:category_id>", methods=["DELETE"])
@jwt_required()
def delete_category(category_id):
    category = Category.query.get(category_id)
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
    if category_id and not Category.query.get(category_id):
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

    if "category_id" in data and data["category_id"] and not Category.query.get(data["category_id"]):
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

    if user.role != "admin":
        return jsonify({"error": "Only a lab admin can approve or reject requests"}), 403

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
    if req.requested_by_id != user.id and user.role != "admin":
        return jsonify({"error": "You can only cancel your own requests"}), 403

    db.session.delete(req)
    db.session.commit()
    return jsonify({"message": "Request cancelled"}), 200


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

    return jsonify({
        "total_supplies": len(supplies),
        "low_stock_count": len(low_stock),
        "low_stock_items": [s.to_dict() for s in low_stock[:10]],
        "recent_updates": [s.to_dict() for s in recent],
        "pending_requests_count": pending_requests_count,
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
    rows = conn.execute(db.text(f"PRAGMA table_info({table})")).fetchall()
    return any(row[1] == column for row in rows)


with app.app_context():
    db.create_all()

    # Lightweight migration: add columns introduced by the lab/role feature to
    # tables that may already exist from before it (no Alembic in this project).
    with db.engine.begin() as conn:
        if not _column_exists(conn, "users", "lab_id"):
            conn.execute(db.text("ALTER TABLE users ADD COLUMN lab_id INTEGER"))
        if not _column_exists(conn, "users", "role"):
            conn.execute(db.text("ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'tech'"))
        if not _column_exists(conn, "supplies", "lab_id"):
            conn.execute(db.text("ALTER TABLE supplies ADD COLUMN lab_id INTEGER"))

    for name in DEFAULT_CATEGORIES:
        if not Category.query.filter_by(name=name).first():
            db.session.add(Category(name=name))
    db.session.commit()

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
        user.role = "admin"
        Supply.query.filter_by(created_by_id=user.id).filter(Supply.lab_id.is_(None)).update(
            {"lab_id": lab.id}
        )
    db.session.commit()


if __name__ == "__main__":
    app.run(port=5050, debug=True)

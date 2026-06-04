from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from models import db, User, History
import json
from datetime import datetime

auth_bp = Blueprint('auth', __name__)
bcrypt = Bcrypt()

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not name or not email or not password:
        return jsonify({'error': 'All fields are required'}), 400

    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters'}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already registered'}), 400

    hashed = bcrypt.generate_password_hash(password).decode('utf-8')
    user = User(name=name, email=email, password=hashed)
    db.session.add(user)
    db.session.commit()

    token = create_access_token(identity=str(user.id))
    return jsonify({
        'token': token,
        'user': {'id': user.id, 'name': user.name, 'email': user.email}
    }), 201

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({'error': 'Email and password are required'}), 400

    user = User.query.filter_by(email=email).first()
    if not user or not bcrypt.check_password_hash(user.password, password):
        return jsonify({'error': 'Invalid email or password'}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({
        'token': token,
        'user': {'id': user.id, 'name': user.name, 'email': user.email}
    })

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'id': user.id, 'name': user.name, 'email': user.email})

@auth_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    user_id = get_jwt_identity()
    history = History.query.filter_by(user_id=user_id).order_by(History.created_at.desc()).limit(20).all()
    return jsonify([h.to_dict() for h in history])

@auth_bp.route('/history', methods=['POST'])
@jwt_required()
def save_history():
    user_id = get_jwt_identity()
    data = request.get_json()

    history = History(
        user_id=user_id,
        code=data.get('code', ''),
        language=data.get('language', ''),
        preview=data.get('preview', ''),
        result=json.dumps(data.get('result', {})),
        pinned=data.get('pinned', False)
    )
    db.session.add(history)
    db.session.commit()
    return jsonify(history.to_dict()), 201

@auth_bp.route('/history/<int:history_id>', methods=['DELETE'])
@jwt_required()
def delete_history(history_id):
    user_id = get_jwt_identity()
    history = History.query.filter_by(id=history_id, user_id=user_id).first()
    if not history:
        return jsonify({'error': 'History not found'}), 404
    db.session.delete(history)
    db.session.commit()
    return jsonify({'message': 'Deleted successfully'})

@auth_bp.route('/history/<int:history_id>/pin', methods=['PUT'])
@jwt_required()
def pin_history(history_id):
    user_id = get_jwt_identity()
    history = History.query.filter_by(id=history_id, user_id=user_id).first()
    if not history:
        return jsonify({'error': 'History not found'}), 404
    history.pinned = not history.pinned
    db.session.commit()
    return jsonify(history.to_dict())

@auth_bp.route('/history/clear', methods=['DELETE'])
@jwt_required()
def clear_history():
    user_id = get_jwt_identity()
    History.query.filter_by(user_id=user_id).delete()
    db.session.commit()
    return jsonify({'message': 'History cleared'})
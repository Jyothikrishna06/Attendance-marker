import 'dart:convert';

class Device {
  final String id;
  final String deviceIdentifier;
  final String deviceModel;
  final String? osName;
  final String? osVersion;
  final String status;

  Device({
    required this.id,
    required this.deviceIdentifier,
    required this.deviceModel,
    this.osName,
    this.osVersion,
    required this.status,
  });

  bool get isActive => status == 'ACTIVE';

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      id: json['id'] ?? '',
      deviceIdentifier: json['deviceIdentifier'] ?? '',
      deviceModel: json['deviceModel'] ?? '',
      osName: json['osName'],
      osVersion: json['osVersion'],
      status: json['status'] ?? 'PENDING_APPROVAL',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'deviceIdentifier': deviceIdentifier,
      'deviceModel': deviceModel,
      'osName': osName,
      'osVersion': osVersion,
      'status': status,
    };
  }
}

class ResidentProfile {
  final String id;
  final String rollNumber;
  final String hostelId;
  final String roomId;
  final String? emergencyContactName;
  final String? emergencyContactPhone;

  ResidentProfile({
    required this.id,
    required this.rollNumber,
    required this.hostelId,
    required this.roomId,
    this.emergencyContactName,
    this.emergencyContactPhone,
  });

  factory ResidentProfile.fromJson(Map<String, dynamic> json) {
    return ResidentProfile(
      id: json['id'] ?? '',
      rollNumber: json['rollNumber'] ?? '',
      hostelId: json['hostelId'] ?? '',
      roomId: json['roomId'] ?? '',
      emergencyContactName: json['emergencyContactName'],
      emergencyContactPhone: json['emergencyContactPhone'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'rollNumber': rollNumber,
      'hostelId': hostelId,
      'roomId': roomId,
      'emergencyContactName': emergencyContactName,
      'emergencyContactPhone': emergencyContactPhone,
    };
  }
}

class User {
  final String id;
  final String name;
  final String email;
  final String role;
  final String status;
  final ResidentProfile? residentProfile;
  final Device? activeDevice;

  User({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.status,
    this.residentProfile,
    this.activeDevice,
  });

  bool get isResident => role == 'RESIDENT';
  bool get isActive => status == 'ACTIVE';
  bool get hasActiveDevice => activeDevice != null && activeDevice!.isActive;

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      role: json['role'] ?? 'RESIDENT',
      status: json['status'] ?? 'PENDING_ACTIVATION',
      residentProfile: json['residentProfile'] != null
          ? ResidentProfile.fromJson(json['residentProfile'])
          : null,
      activeDevice: json['activeDevice'] != null
          ? Device.fromJson(json['activeDevice'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'role': role,
      'status': status,
      'residentProfile': residentProfile?.toJson(),
      'activeDevice': activeDevice?.toJson(),
    };
  }

  String toJsonString() => jsonEncode(toJson());

  factory User.fromJsonString(String str) => User.fromJson(jsonDecode(str));
}

class AuthSession {
  final String accessToken;
  final String refreshToken;
  final String expiresIn;
  final User user;

  AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.user,
  });

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: json['accessToken'] ?? '',
      refreshToken: json['refreshToken'] ?? '',
      expiresIn: json['expiresIn'] ?? '15m',
      user: User.fromJson(json['user']),
    );
  }
}

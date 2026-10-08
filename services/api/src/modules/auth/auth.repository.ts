import crypto from 'crypto';
import { User, ResidentProfile, Device, RefreshTokenRecord, UserStatus } from '../../common/types.js';
import { ConflictError } from '../../common/errors.js';

export interface IAuthRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  findResidentByUserId(userId: string): Promise<ResidentProfile | null>;
  findActiveDeviceByResidentId(residentId: string): Promise<Device | null>;
  findDeviceByIdentifier(identifier: string): Promise<Device | null>;
  updateUserPasswordAndStatus(userId: string, passwordHash: string, status: UserStatus): Promise<void>;
  saveRefreshToken(record: RefreshTokenRecord): Promise<void>;
  findRefreshToken(tokenId: string): Promise<RefreshTokenRecord | null>;
  revokeRefreshToken(tokenId: string): Promise<void>;
  registerDevice(data: {
    residentId: string;
    deviceIdentifier: string;
    deviceModel: string;
    osName: 'ANDROID' | 'IOS' | 'TEST_OS';
    osVersion: string;
  }): Promise<Device>;
  findResidentById(id: string): Promise<ResidentProfile | null>;
  getAllResidents(): Promise<ResidentProfile[]>;
  getAllUsers(): Promise<User[]>;
  getAllDevices(): Promise<Device[]>;
  findDeviceById(id: string): Promise<Device | null>;
  revokeDevice(deviceId: string): Promise<Device>;
  updateUserStatus(userId: string, status: UserStatus): Promise<User>;
}

/**
 * In-memory repository implementation initialized with data consistent with 001_development_seed.sql.
 * Used for development, CI unit testing, and isolated mock verification.
 */
export class InMemoryAuthRepository implements IAuthRepository {
  private users: Map<string, User> = new Map();
  private residents: Map<string, ResidentProfile> = new Map();
  private devices: Map<string, Device> = new Map();
  private refreshTokens: Map<string, RefreshTokenRecord> = new Map();

  constructor() {
    this.seedInitialData();
  }

  public seedInitialData(): void {
    const isTestRunner =
      process.env.NODE_ENV === 'test' ||
      process.argv.some((arg) => arg.toLowerCase().includes('test')) ||
      Boolean(process.execArgv && process.execArgv.some((arg) => arg.toLowerCase().includes('test')));

    // 1. Super Admin: Jyothikrishna S (Password: 'Jyothi@2006')
    this.users.set('c0000000-0000-0000-0000-000000000010', {
      id: 'c0000000-0000-0000-0000-000000000010',
      name: 'Jyothikrishna S',
      email: 'jyothi.jojo6@gmail.com',
      role: 'SUPER_ADMIN',
      passwordHash: '$2a$10$vDOutQOcUitzhJtxjThigeCv.bH4THBBl3GgqVIjpSlTA0J089xy6',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Warden (Password: 'WardenSecurePass!2026')
    this.users.set('c0000000-0000-0000-0000-000000000002', {
      id: 'c0000000-0000-0000-0000-000000000002',
      name: 'Rajesh Sharma',
      email: 'warden.sharma@hostel.edu',
      role: 'WARDEN',
      passwordHash: '$2a$10$ZxtyLsBwLy0/8AAh.QRV6uNolgUZ.jipw3FNVKvlL93BmnymQBYpS',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Real Resident Student: Jyothi (Password: 'CusatPass!2026')
    this.users.set('c0000000-0000-0000-0000-000000000006', {
      id: 'c0000000-0000-0000-0000-000000000006',
      name: 'Jyothi',
      email: '24cs471jyot@ug.cusat.ac.in',
      role: 'RESIDENT',
      passwordHash: '$2a$10$OiPXc9b/5LwHhC4D6Q2Up.vXJdPdlBTnzGAg0a14ZgJ7yMXcXyK7i',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.residents.set('d0000000-0000-0000-0000-000000000006', {
      id: 'd0000000-0000-0000-0000-000000000006',
      userId: 'c0000000-0000-0000-0000-000000000006',
      rollNumber: '24CS471',
      hostelId: 'a0000000-0000-0000-0000-000000000001',
      roomId: 'b0000000-0000-0000-0000-000000000101',
      emergencyContactName: 'CUSAT Student Admin',
      emergencyContactPhone: '+919876543219',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.devices.set('e0000000-0000-0000-0000-000000000006', {
      id: 'e0000000-0000-0000-0000-000000000006',
      residentId: 'd0000000-0000-0000-0000-000000000006',
      deviceIdentifier: 'DEV-FINGERPRINT-CUSAT-24CS471',
      deviceModel: 'CUSAT Resident Station',
      osName: 'ANDROID',
      osVersion: '14.0',
      status: 'ACTIVE',
      registeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Real Resident Student: Blessy Binu (Password: 'blessybinu@123')
    this.users.set('c0000000-0000-0000-0000-000000000021', {
      id: 'c0000000-0000-0000-0000-000000000021',
      name: 'Blessy Binu',
      email: 'blessybinu4287@gmail.com',
      role: 'RESIDENT',
      passwordHash: '$2a$10$6viLZdzJYpl9ug3v7oY.pO4bZpNkKp0cMORZM0TT4CLEToHwpZ/Le',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.residents.set('d0000000-0000-0000-0000-000000000021', {
      id: 'd0000000-0000-0000-0000-000000000021',
      userId: 'c0000000-0000-0000-0000-000000000021',
      rollNumber: '25021976',
      hostelId: 'a0000000-0000-0000-0000-000000000003',
      roomId: 'b0000000-0000-0000-0000-000000000051',
      emergencyContactName: 'Parent / Guardian',
      emergencyContactPhone: '+917907931425',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.devices.set('e0000000-0000-0000-0000-000000000021', {
      id: 'e0000000-0000-0000-0000-000000000021',
      residentId: 'd0000000-0000-0000-0000-000000000021',
      deviceIdentifier: 'DEV-FINGERPRINT-BLESSY-25021976',
      deviceModel: 'Android Resident Device',
      osName: 'ANDROID',
      osVersion: '14.0',
      status: 'ACTIVE',
      registeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Real Resident Student: Ahanya M R (Password: 'ahanya@123')
    this.users.set('c0000000-0000-0000-0000-000000000022', {
      id: 'c0000000-0000-0000-0000-000000000022',
      name: 'Ahanya M R',
      email: 'ahanya_ec24@ug.cusat.ac.in',
      role: 'RESIDENT',
      passwordHash: '$2a$10$ipkhwAXfyqusg2Uw.Fdhw.Qy14B3oFGh/303kf7ECK5mUR2CnvJg6',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.residents.set('d0000000-0000-0000-0000-000000000022', {
      id: 'd0000000-0000-0000-0000-000000000022',
      userId: 'c0000000-0000-0000-0000-000000000022',
      rollNumber: '24100471',
      hostelId: 'a0000000-0000-0000-0000-000000000003',
      roomId: 'b0000000-0000-0000-0000-000000000020',
      emergencyContactName: 'Parent / Guardian',
      emergencyContactPhone: 'Not provided',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    this.devices.set('e0000000-0000-0000-0000-000000000022', {
      id: 'e0000000-0000-0000-0000-000000000022',
      residentId: 'd0000000-0000-0000-0000-000000000022',
      deviceIdentifier: 'DEV-FINGERPRINT-AHANYA-24100471',
      deviceModel: 'Android Resident Device',
      osName: 'ANDROID',
      osVersion: '14.0',
      status: 'ACTIVE',
      registeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Test Fixtures: Only seeded during automated test runs
    if (isTestRunner) {
      // Test Super Admin Dr. Alok Verma (Password: 'AdminSecurePass!2026')
      this.users.set('c0000000-0000-0000-0000-000000000001', {
        id: 'c0000000-0000-0000-0000-000000000001',
        name: 'Dr. Alok Verma',
        email: 'admin@campus.edu',
        role: 'SUPER_ADMIN',
        passwordHash: '$2a$10$Z9AxsTjHxw6SnddWwUxwv.RGxgPI71jeEfe5mim5oOsu4fukhrHZO',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Resident Aarav (Password: 'ResidentAaravPass!2026')
      this.users.set('c0000000-0000-0000-0000-000000000003', {
        id: 'c0000000-0000-0000-0000-000000000003',
        name: 'Aarav Patel',
        email: 'aarav.patel@student.edu',
        role: 'RESIDENT',
        passwordHash: '$2a$10$D9FhgfkANAKu4LLNwqyZoettvARLyWWg7QmEc5SUoNEOfaAbu4k7.',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 4. Resident Diya (Password: 'ResidentDiyaPass!2026')
      this.users.set('c0000000-0000-0000-0000-000000000004', {
        id: 'c0000000-0000-0000-0000-000000000004',
        name: 'Diya Sharma',
        email: 'diya.sharma@student.edu',
        role: 'RESIDENT',
        passwordHash: '$2a$10$qnfTXTVSA0SRE6tvWPSOoeV/p.9T315WXdNE5sGGcW6Fmiq0ZZVu2',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 5. Resident Rohan (Pending Activation, Activation Token: 'ACTIVATE_ROHAN_2026_TOKEN')
      this.users.set('c0000000-0000-0000-0000-000000000005', {
        id: 'c0000000-0000-0000-0000-000000000005',
        name: 'Rohan Verma',
        email: 'rohan.verma@student.edu',
        role: 'RESIDENT',
        passwordHash: 'UNINITIALIZED_HASH',
        status: 'PENDING_ACTIVATION',
        activationToken: 'ACTIVATE_ROHAN_2026_TOKEN',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Resident Profiles
      this.residents.set('d0000000-0000-0000-0000-000000000001', {
        id: 'd0000000-0000-0000-0000-000000000001',
        userId: 'c0000000-0000-0000-0000-000000000003',
        rollNumber: 'CS2026-001',
        hostelId: 'a0000000-0000-0000-0000-000000000001',
        roomId: 'b0000000-0000-0000-0000-000000000101',
        emergencyContactName: 'Suresh Patel',
        emergencyContactPhone: '+919876543210',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.residents.set('d0000000-0000-0000-0000-000000000002', {
        id: 'd0000000-0000-0000-0000-000000000002',
        userId: 'c0000000-0000-0000-0000-000000000004',
        rollNumber: 'CS2026-002',
        hostelId: 'a0000000-0000-0000-0000-000000000001',
        roomId: 'b0000000-0000-0000-0000-000000000101',
        emergencyContactName: 'Sunita Sharma',
        emergencyContactPhone: '+919876543211',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.residents.set('d0000000-0000-0000-0000-000000000003', {
        id: 'd0000000-0000-0000-0000-000000000003',
        userId: 'c0000000-0000-0000-0000-000000000005',
        rollNumber: 'CS2026-003',
        hostelId: 'a0000000-0000-0000-0000-000000000001',
        roomId: 'b0000000-0000-0000-0000-000000000102',
        emergencyContactName: 'Manoj Verma',
        emergencyContactPhone: '+919876543212',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Devices
      this.devices.set('e0000000-0000-0000-0000-000000000001', {
        id: 'e0000000-0000-0000-0000-000000000001',
        residentId: 'd0000000-0000-0000-0000-000000000001',
        deviceIdentifier: 'DEV-FINGERPRINT-AARAV-PIXEL8',
        deviceModel: 'Google Pixel 8',
        osName: 'ANDROID',
        osVersion: '14.0',
        status: 'ACTIVE',
        registeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      this.devices.set('e0000000-0000-0000-0000-000000000003', {
        id: 'e0000000-0000-0000-0000-000000000003',
        residentId: 'd0000000-0000-0000-0000-000000000002',
        deviceIdentifier: 'DEV-FINGERPRINT-DIYA-IPHONE15',
        deviceModel: 'Apple iPhone 15',
        osName: 'IOS',
        osVersion: '17.5',
        status: 'ACTIVE',
        registeredAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase().replace(/\s+/g, '');
    for (const user of this.users.values()) {
      if (user.email.toLowerCase().replace(/\s+/g, '') === normalized) {
        return user;
      }
    }
    return null;
  }

  async findUserById(id: string): Promise<User | null> {
    return this.users.get(id) || null;
  }

  async findResidentByUserId(userId: string): Promise<ResidentProfile | null> {
    for (const resident of this.residents.values()) {
      if (resident.userId === userId) {
        return resident;
      }
    }
    return null;
  }

  async findActiveDeviceByResidentId(residentId: string): Promise<Device | null> {
    for (const device of this.devices.values()) {
      if (device.residentId === residentId && device.status === 'ACTIVE') {
        return device;
      }
    }
    return null;
  }

  async findDeviceByIdentifier(identifier: string): Promise<Device | null> {
    for (const device of this.devices.values()) {
      if (device.deviceIdentifier === identifier) {
        return device;
      }
    }
    return null;
  }

  async updateUserPasswordAndStatus(userId: string, passwordHash: string, status: UserStatus): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.passwordHash = passwordHash;
      user.status = status;
      user.activationToken = null;
      user.updatedAt = new Date();
    }
  }

  async saveRefreshToken(record: RefreshTokenRecord): Promise<void> {
    this.refreshTokens.set(record.id, record);
  }

  async findRefreshToken(tokenId: string): Promise<RefreshTokenRecord | null> {
    return this.refreshTokens.get(tokenId) || null;
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    const record = this.refreshTokens.get(tokenId);
    if (record) {
      record.revoked = true;
    }
  }

  async registerDevice(data: {
    residentId: string;
    deviceIdentifier: string;
    deviceModel: string;
    osName: 'ANDROID' | 'IOS' | 'TEST_OS';
    osVersion: string;
  }): Promise<Device> {
    // Check if deviceIdentifier is already bound to any account
    const existing = await this.findDeviceByIdentifier(data.deviceIdentifier);
    if (existing) {
      throw new ConflictError('This hardware device is already registered in the system.');
    }

    // Check if resident already has an ACTIVE device
    const activeDevice = await this.findActiveDeviceByResidentId(data.residentId);
    if (activeDevice) {
      throw new ConflictError(
        'Resident already possesses an active registered device. Contact administrator to revoke previous device before registering a new one.'
      );
    }

    const newDevice: Device = {
      id: crypto.randomUUID(),
      residentId: data.residentId,
      deviceIdentifier: data.deviceIdentifier,
      deviceModel: data.deviceModel,
      osName: data.osName,
      osVersion: data.osVersion,
      status: 'ACTIVE', // Automatically active or pending approval
      registeredAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.devices.set(newDevice.id, newDevice);
    return newDevice;
  }

  async findResidentById(id: string): Promise<ResidentProfile | null> {
    return this.residents.get(id) || null;
  }

  async getAllResidents(): Promise<ResidentProfile[]> {
    return Array.from(this.residents.values());
  }

  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async getAllDevices(): Promise<Device[]> {
    return Array.from(this.devices.values());
  }

  async findDeviceById(id: string): Promise<Device | null> {
    return this.devices.get(id) || null;
  }

  async revokeDevice(deviceId: string): Promise<Device> {
    const dev = this.devices.get(deviceId);
    if (!dev) {
      throw new Error(`Device ${deviceId} not found`);
    }
    const updated: Device = {
      ...dev,
      status: 'REVOKED',
      revokedAt: new Date(),
      updatedAt: new Date(),
    };
    this.devices.set(deviceId, updated);
    return updated;
  }

  async updateUserStatus(userId: string, status: UserStatus): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const updated: User = {
      ...user,
      status,
      updatedAt: new Date(),
    };
    this.users.set(userId, updated);
    return updated;
  }
}

import type { User, UserRole, UserStatus } from '@shared/types';
import { generatePassword, generateUsername } from '@utils/userGenerator';

export interface MockUserRecord extends User {
  password: string;
}

const INITIAL_MOCK_USERS: Record<string, MockUserRecord> = {
  admin: {
    id: '1',
    username: 'admin',
    password: 'admin@123',
    fullName: 'Nguyễn Văn An',
    email: 'an.nv@evn.com.vn',
    phone: '0901234567',
    role: 'Admin',
    status: 'Active',
    mustChangePassword: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  manager: {
    id: '2',
    username: 'manager',
    password: 'manager@123',
    fullName: 'Trần Thị Bích',
    email: 'bich.tt@evn.com.vn',
    phone: '0901234568',
    role: 'Inspector',
    status: 'Active',
    mustChangePassword: false,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  technician: {
    id: '3',
    username: 'technician',
    password: 'tech@123',
    fullName: 'Lê Văn Cường',
    email: 'cuong.lv@evn.com.vn',
    phone: '0901234569',
    role: 'Technician',
    status: 'Locked',
    mustChangePassword: false,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  },
  locked: {
    id: '4',
    username: 'locked',
    password: 'locked@123',
    fullName: 'Phạm Minh Đức',
    email: 'duc.pm@evn.com.vn',
    phone: '0901234570',
    role: 'Manager',
    status: 'Active',
    mustChangePassword: false,
    createdAt: '2026-01-04T00:00:00Z',
    updatedAt: '2026-01-04T00:00:00Z',
  },
  analyst: {
    id: '5',
    username: 'analyst',
    password: 'analyst@123',
    fullName: 'Hoàng Thu Hà',
    email: 'ha.ht@evn.com.vn',
    phone: '0901234571',
    role: 'Analyst',
    status: 'Active',
    mustChangePassword: false,
    createdAt: '2026-01-05T00:00:00Z',
    updatedAt: '2026-01-05T00:00:00Z',
  },
  viewer: {
    id: '6',
    username: 'viewer',
    password: 'viewer@123',
    fullName: 'Võ Minh Quân',
    email: 'quan.vm@evn.com.vn',
    phone: '0901234572',
    role: 'Technician',
    status: 'Active',
    mustChangePassword: false,
    createdAt: '2026-01-06T00:00:00Z',
    updatedAt: '2026-01-06T00:00:00Z',
  },
};

let mockUsers: Record<string, MockUserRecord> = structuredClone(INITIAL_MOCK_USERS);
let nextId = 7;

const toPublicUser = (record: MockUserRecord): User => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pwd, ...user } = record;
  return user;
};

export const mockUserStore = {
  getAll: (): User[] => Object.values(mockUsers).map(toPublicUser),

  findByEmail: (email: string): MockUserRecord | undefined =>
    Object.values(mockUsers).find((u) => u.email.toLowerCase() === email.trim().toLowerCase()),

  findById: (id: string): MockUserRecord | undefined =>
    Object.values(mockUsers).find((u) => u.id === id),

  create: (
    fullName: string,
    role: UserRole,
    email: string,
    phone?: string,
    password?: string,
  ): { user: User; temporaryPassword: string } => {
    const usernames = Object.values(mockUsers).map((u) => u.username);
    const username = generateUsername(fullName, usernames);
    const temporaryPassword = password || generatePassword();
    const now = new Date().toISOString();

    const record: MockUserRecord = {
      id: String(nextId++),
      username,
      password: temporaryPassword,
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone?.trim(),
      role,
      status: 'Active',
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    };

    mockUsers[username] = record;
    return { user: toPublicUser(record), temporaryPassword };
  },

  update: (
    id: string,
    data: { role?: UserRole; status?: UserStatus },
  ): User | null => {
    const record = mockUserStore.findById(id);
    if (!record) return null;

    if (data.role) record.role = data.role;
    if (data.status) record.status = data.status;
    record.updatedAt = new Date().toISOString();

    return toPublicUser(record);
  },

  resetPassword: (id: string): { username: string; temporaryPassword: string } | null => {
    const record = mockUserStore.findById(id);
    if (!record) return null;

    const temporaryPassword = generatePassword();
    record.password = temporaryPassword;
    record.mustChangePassword = true;
    record.updatedAt = new Date().toISOString();

    return { username: record.username, temporaryPassword };
  },

  delete: (id: string): boolean => {
    const record = mockUserStore.findById(id);
    if (!record) return false;
    delete mockUsers[record.username];
    return true;
  },

  changePassword: (
    username: string,
    currentPassword: string,
    newPassword: string,
  ): User | null => {
    const record = mockUsers[username];
    if (!record || record.password !== currentPassword) return null;

    record.password = newPassword;
    record.mustChangePassword = false;
    record.updatedAt = new Date().toISOString();

    return toPublicUser(record);
  },

  reset: () => {
    mockUsers = structuredClone(INITIAL_MOCK_USERS);
    nextId = 7;
  },
};

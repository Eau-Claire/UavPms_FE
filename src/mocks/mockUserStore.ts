import type { User, UserRole, UserStatus } from '@types';
import { generatePassword, generateUsername } from '@utils/userGenerator';

export interface MockUserRecord extends User {
  password: string;
}

const INITIAL_MOCK_USERS: Record<string, MockUserRecord> = {
  admin: {
    id: '1',
    username: 'admin',
    password: 'admin@123',
    fullName: 'Nguyễn Văn Admin',
    email: 'admin@evn.com',
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
    fullName: 'Trần Thị Manager',
    email: 'manager@evn.com',
    role: 'Manager',
    status: 'Active',
    mustChangePassword: false,
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  },
  technician: {
    id: '3',
    username: 'technician',
    password: 'tech@123',
    fullName: 'Lê Văn Technician',
    email: 'tech@evn.com',
    role: 'Technician',
    status: 'Active',
    mustChangePassword: false,
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
  },
  locked: {
    id: '4',
    username: 'locked',
    password: 'locked@123',
    fullName: 'Phạm Văn Locked',
    email: 'locked@evn.com',
    role: 'Viewer',
    status: 'Locked',
    mustChangePassword: false,
    createdAt: '2026-01-04T00:00:00Z',
    updatedAt: '2026-01-04T00:00:00Z',
  },
};

let mockUsers: Record<string, MockUserRecord> = structuredClone(INITIAL_MOCK_USERS);
let nextId = 5;

const toPublicUser = (record: MockUserRecord): User => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pwd, ...user } = record;
  return user;
};

export const mockUserStore = {
  getAll: (): User[] => Object.values(mockUsers).map(toPublicUser),

  findByUsername: (username: string): MockUserRecord | undefined => mockUsers[username],

  findById: (id: string): MockUserRecord | undefined =>
    Object.values(mockUsers).find((u) => u.id === id),

  create: (fullName: string, role: UserRole): { user: User; temporaryPassword: string } => {
    const usernames = Object.values(mockUsers).map((u) => u.username);
    const username = generateUsername(fullName, usernames);
    const temporaryPassword = generatePassword();
    const now = new Date().toISOString();

    const record: MockUserRecord = {
      id: String(nextId++),
      username,
      password: temporaryPassword,
      fullName: fullName.trim(),
      email: `${username.toLowerCase()}@evn.com`,
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
    nextId = 5;
  },
};

export const USER_PAGE_SIZE = 20;
export const INTERNAL_AUTH_DOMAIN = "krc.com";

export type UserStatus = "active" | "inactive";

export type UserFormInput = {
  approverUserId: string | null;
  departmentId: number;
  firstName: string;
  lastName: string;
  password: string;
  positionName: string;
  roleId: number;
  username: string;
};

export type UserProfileInput = Omit<UserFormInput, "password" | "username">;

const USERNAME_PATTERN = /^[a-z][a-z0-9._-]{7,29}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function getInternalAuthEmail(username: string) {
  return `${normalizeUsername(username)}@${INTERNAL_AUTH_DOMAIN}`;
}

export function validateUsername(username: string): string | null {
  const normalized = normalizeUsername(username);

  if (!USERNAME_PATTERN.test(normalized)) {
    return "Username ต้องมี 8-30 ตัว เริ่มด้วยตัวอักษรอังกฤษ และใช้ได้เฉพาะ a-z, 0-9, จุด, ขีดกลาง หรือขีดล่าง";
  }

  return null;
}

export function validateManagedPassword(password: string): string | null {
  if (password.length < 8 || password.length > 72) {
    return "รหัสผ่านต้องมีความยาว 8-72 ตัวอักษร";
  }
  if (!/[a-z]/.test(password)) {
    return "รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์เล็กอย่างน้อย 1 ตัว";
  }
  if (!/[A-Z]/.test(password)) {
    return "รหัสผ่านต้องมีตัวอักษรภาษาอังกฤษพิมพ์ใหญ่อย่างน้อย 1 ตัว";
  }
  if (!/[0-9]/.test(password)) {
    return "รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว";
  }

  return null;
}

export function validateUserProfileInput(input: UserProfileInput) {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const positionName = input.positionName.trim();

  if (!firstName || firstName.length > 100) {
    return "กรุณากรอกชื่อไม่เกิน 100 ตัวอักษร";
  }
  if (!lastName || lastName.length > 100) {
    return "กรุณากรอกนามสกุลไม่เกิน 100 ตัวอักษร";
  }
  if (positionName.length > 120) {
    return "ตำแหน่งต้องไม่เกิน 120 ตัวอักษร";
  }
  if (!Number.isSafeInteger(input.departmentId) || input.departmentId <= 0) {
    return "กรุณาเลือกแผนก";
  }
  if (!Number.isSafeInteger(input.roleId) || input.roleId <= 0) {
    return "กรุณาเลือก Role";
  }
  if (input.approverUserId && !UUID_PATTERN.test(input.approverUserId)) {
    return "ผู้อนุมัติประจำไม่ถูกต้อง";
  }

  return null;
}

export function validateCreateUserInput(input: UserFormInput) {
  return (
    validateUsername(input.username) ??
    validateManagedPassword(input.password) ??
    validateUserProfileInput(input)
  );
}

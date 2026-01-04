import mongoose from 'mongoose';
import User from '@/models/User';
import bcrypt from 'bcryptjs';

/**
 * Check if a PIN is already in use by another user in the same tenant
 * This function compares the candidate PIN with all existing hashed PINs
 * @param tenantId - The tenant ID to check within
 * @param candidatePin - The plain text PIN to check
 * @param excludeUserId - User ID to exclude from the check (the user being updated)
 * @returns Promise<boolean> - true if PIN is already in use, false otherwise
 */
export async function isPinDuplicate(
  tenantId: string | mongoose.Types.ObjectId,
  candidatePin: string,
  excludeUserId?: string
): Promise<boolean> {
  // Get all users in the tenant with PINs (excluding the current user if specified)
  const query: Record<string, unknown> = { tenantId, pin: { $exists: true, $ne: null } };
  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }
  
  const users = await User.find(query).select('+pin').lean();
  
  // Compare candidate PIN with each hashed PIN
  for (const user of users) {
    if (user.pin) {
      const isMatch = await bcrypt.compare(candidatePin, user.pin);
      if (isMatch) {
        return true; // PIN is already in use
      }
    }
  }
  
  return false; // PIN is not in use
}

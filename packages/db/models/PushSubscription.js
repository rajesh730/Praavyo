import mongoose from "mongoose";

// Accounts that can receive phone/laptop push. Parents keep using the `parent`
// field (every subscription saved before 2026-11-22 is a parent one, with no
// accountRole); every other account is `account` + `accountRole`.
export const PUSH_ACCOUNT_ROLES = ["PARENT", "STUDENT", "TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"];

const PushSubscriptionSchema = new mongoose.Schema(
  {
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      default: null,
      index: true,
    },
    // Student, Teacher or User (school / super admin) id, by accountRole.
    account: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    accountRole: {
      type: String,
      enum: [...PUSH_ACCOUNT_ROLES, null],
      default: null,
      index: true,
    },
    // The school the account was working in when the device was registered
    // (students: their school). Lets a school notice reach its own students
    // without scanning every subscription on the platform.
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    endpoint: { type: String, required: true, unique: true, maxlength: 2048 },
    keys: {
      p256dh: { type: String, required: true, maxlength: 512 },
      auth: { type: String, required: true, maxlength: 256 },
    },
    // Ties a device to the credential generation that registered it. Issuing a
    // replacement Parent Access Card (or a school password reset) increments
    // authVersion, which immediately stops the old device receiving alerts.
    authVersion: { type: Number, required: true, default: 0, min: 0 },
    expirationTime: { type: Date, default: null },
    userAgent: { type: String, default: "", maxlength: 500 },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

PushSubscriptionSchema.pre("validate", function requireOwner() {
  if (!this.parent && !this.account) {
    this.invalidate("account", "A push subscription needs an owner");
  }
});

PushSubscriptionSchema.index({ parent: 1, updatedAt: -1 });
PushSubscriptionSchema.index({ parent: 1, authVersion: 1 });
PushSubscriptionSchema.index({ accountRole: 1, account: 1 });
PushSubscriptionSchema.index({ accountRole: 1, school: 1 });

export default mongoose.models.PushSubscription ||
  mongoose.model("PushSubscription", PushSubscriptionSchema);

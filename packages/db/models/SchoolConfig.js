import mongoose from 'mongoose';

const SchoolConfigSchema = new mongoose.Schema({
    school: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true,
    },
    schoolCode: {
        type: String,
        default: "",
        trim: true,
    },
    iemisNumber: {
        type: String,
        default: "",
        trim: true,
        uppercase: true,
        maxlength: 50,
    },
    city: {
        type: String,
        default: "",
        trim: true,
    },
    state: {
        type: String,
        default: "",
        trim: true,
    },
    pincode: {
        type: String,
        default: "",
        trim: true,
    },
    teacherRoles: {
        type: [String],
        default: [],
    },
    teacherRolesCustomized: {
        type: Boolean,
        default: false,
    },
    // The school's grades. Until `gradesCustomized`, this is a copy of the
    // signup range (Grade min–max) that the app keeps in sync; once the
    // school edits its grades (Settings → Academic Setup → Grades) this list
    // is the source of truth and is never overwritten. See
    // packages/core/gradeLevels.js resolveSchoolGrades.
    grades: {
        type: [String],
        default: [],
    },
    gradesCustomized: {
        type: Boolean,
        default: false,
    },
    gradeSections: {
        type: [{ _id: false, grade: { type: String, required: true }, sections: { type: [String], default: [] } }],
        default: [],
    },
    // Optional image printed on the right of the report card header (the
    // school's logo is on the left). Empty means the right side is left blank.
    reportCardImageUrl: {
        type: String,
        default: "",
        trim: true,
    },
    // Which calendar this school's academic years are displayed in (AD or BS).
    academicCalendar: {
        type: String,
        enum: ["AD", "BS"],
        default: "AD",
    },
    // Progress marker for the automatic guardian backfill.
    //
    // Students registered before Parent Access existed have parent details on
    // their record but no guardian account. Rather than making a school find
    // and press an "Import" button, the roster links them automatically, in
    // batches, and records progress here so the work happens once and then
    // stops. See app/api/school/guardians/roster/route.js.
    guardianBackfill: {
        completedAt: {
            type: Date,
            default: null,
        },
        lastRunAt: {
            type: Date,
            default: null,
        },
        linkedCount: {
            type: Number,
            default: 0,
        },
    },
    // Whether a child's photo may be shown to their authorised guardians in
    // the Parent App and on the activation confirmation screen (§54).
    //
    // Defaults to true because this is NOT public exposure: the photo is only
    // ever shown to a guardian holding a valid Parent Access Card for that
    // specific child, or already authorised through ParentStudentLink. A school
    // with a stricter photo policy can switch it off, and every surface falls
    // back to initials.
    allowStudentPhotoInParentApp: {
        type: Boolean,
        default: true,
    },
    // --- Parent messaging routing (§14) ---------------------------------
    // Maps each parent-facing topic to the staff who should receive it. A
    // parent picks a TOPIC, never a person, which is what stops every parent
    // in the school from messaging every teacher directly.
    //
    // An empty/absent array for a topic means "not offered by this school" —
    // the topic is hidden from the parent's chooser rather than silently
    // routed somewhere unattended. lib/parentMessaging.js falls back to the
    // school admin only when NO routes are configured at all, so a school that
    // has not set this up still receives parent messages.
    parentMessaging: {
        enabled: {
            type: Boolean,
            default: true,
        },
        routes: [
            {
                topic: {
                    type: String,
                    trim: true,
                },
                // Shown to the parent, e.g. "Class Teacher", "School Office".
                label: {
                    type: String,
                    default: "",
                    trim: true,
                },
                // Staff recipients. Teachers and school admins live in
                // different collections, so each entry records which.
                recipients: [
                    {
                        staff: {
                            type: mongoose.Schema.Types.ObjectId,
                            refPath: "parentMessaging.routes.recipients.staffModel",
                        },
                        staffModel: {
                            type: String,
                            enum: ["User", "Teacher"],
                            default: "User",
                        },
                    },
                ],
            },
        ],
    },
}, { timestamps: true });

SchoolConfigSchema.pre("validate", function () {
    if (Array.isArray(this.teacherRoles)) {
        this.teacherRoles = this.teacherRoles.map((role) =>
            role === "Club Lead" ? "Program Lead" : role
        );
    }
});

// A long-running server (the dev server above all) keeps the first compiled
// model for the whole process. If that model predates a field added here, it
// silently drops the field on every save — that is how `gradesCustomized`
// was lost on 2026-11-28 and a school's edited grades reverted to the signup
// range. Rebuild the model when the cached one is missing any field.
const cachedSchoolConfig = mongoose.models.SchoolConfig;
if (cachedSchoolConfig && Object.keys(SchoolConfigSchema.paths).some((path) => !cachedSchoolConfig.schema.path(path))) {
    mongoose.deleteModel('SchoolConfig');
}

export default mongoose.models.SchoolConfig || mongoose.model('SchoolConfig', SchoolConfigSchema);

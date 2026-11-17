import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import Student from '@/models/Student';
import SchoolConfig from '@/models/SchoolConfig';
import User from '@/models/User';
import bcrypt from 'bcryptjs';
import { DEFAULT_STUDENT_PASSWORD } from '@/lib/passwordGenerator';
import { generateUniqueStudentUsername } from '@/lib/studentIdentity';
import { normalizeGradeValue } from '@/lib/schoolGrades';
import { getSessionSchoolId, requireApiSession } from '@/lib/authz';
import { syncGuardianFromStudentRecord } from '@/lib/guardianLinking';
import { resolveStudentSection } from '@/lib/gradeSections';
import { checkStudentIemis } from '@/lib/iemisRegistry';
import { syncStudentIemisOnLinks } from '@pravyo/db/iemis';

export async function PUT(req, { params }) {
    try {
        const { session, error } = await requireApiSession(['SCHOOL_ADMIN']);
        if (error) return error;
        const schoolId = getSessionSchoolId(session);

        const { id } = await params;
        const body = await req.json();
        
        // Destructure all possible fields
        const { 
            name, email, grade, section, rollNumber, registrationNumber, iemisNumber,
            phone, address, gender, dob, bloodGroup,
            parentName, parentEmail, parentPhone, emergencyContact,
            status // Added status
        } = body;

        await connectDB();

        // 1. Find the student first to ensure they exist and belong to this school
        const existingStudent = await Student.findOne({
            _id: id,
            school: schoolId,
            isDeleted: { $ne: true },
        });
        if (!existingStudent) {
            return NextResponse.json({ message: 'Student not found' }, { status: 404 });
        }

        const normalizedGrade =
            grade !== undefined ? normalizeGradeValue(grade) : existingStudent.grade;
        const normalizedRollNumber =
            rollNumber !== undefined ? String(rollNumber).trim() : existingStudent.rollNumber;
        const requestedSection = section !== undefined ? section : existingStudent.section;
        const schoolConfig = await SchoolConfig.findOne({ school: schoolId }).select('gradeSections').lean();
        const placement = resolveStudentSection(normalizedGrade, requestedSection, schoolConfig?.gradeSections || []);
        if (placement.error) {
            return NextResponse.json({ message: placement.error }, { status: 400 });
        }
        const normalizedSection = placement.section;

        // 2. Check for Roll Number Uniqueness (if changed)
        if (
            normalizedRollNumber &&
            (normalizedRollNumber !== existingStudent.rollNumber ||
                normalizedGrade !== existingStudent.grade)
        ) {
            const rollCheck = await Student.findOne({
                school: schoolId,
                grade: normalizedGrade,
                rollNumber: normalizedRollNumber,
                isDeleted: { $ne: true },
                status: { $nin: ["ALUMNI", "GRADUATED", "INACTIVE"] },
                _id: { $ne: id } // Exclude current student
            });

            if (rollCheck) {
                return NextResponse.json({ 
                    message: `Roll number ${normalizedRollNumber} is already assigned in ${normalizedGrade}` 
                }, { status: 400 });
            }
        }

        // Registration numbers identify one student within the school.
        const normalizedRegistrationNumber =
            registrationNumber !== undefined
                ? String(registrationNumber || '').trim()
                : existingStudent.registrationNumber || '';
        if (
            normalizedRegistrationNumber &&
            normalizedRegistrationNumber !== (existingStudent.registrationNumber || '')
        ) {
            const registrationCheck = await Student.findOne({
                school: schoolId,
                registrationNumber: normalizedRegistrationNumber,
                isDeleted: { $ne: true },
                _id: { $ne: id },
            }).select('name').lean();
            if (registrationCheck) {
                return NextResponse.json({
                    message: `Registration number ${normalizedRegistrationNumber} already belongs to ${registrationCheck.name}`,
                }, { status: 400 });
            }
        }

        // Compulsory and unique: a student saved without one must get it now.
        const { iemisNumber: normalizedIemisNumber, error: iemisError } = await checkStudentIemis(
            iemisNumber !== undefined ? iemisNumber : existingStudent.iemisNumber,
            { exceptStudent: existingStudent._id },
        );
        if (iemisError) {
            return NextResponse.json({ message: iemisError }, { status: iemisError.includes('already') ? 409 : 400 });
        }

        // 3. Check for Email Uniqueness (if changed and provided)
        if (email && email !== existingStudent.email) {
            const emailCheck = await Student.findOne({
                email: email,
                isDeleted: { $ne: true },
                _id: { $ne: id }
            });

            if (emailCheck) {
                return NextResponse.json({ message: 'Email already in use' }, { status: 400 });
            }
        }

        // 4. Prepare Update Object
        const updateData = {
            name,
            grade: normalizedGrade,
            section: normalizedSection,
            rollNumber: normalizedRollNumber,
            registrationNumber: normalizedRegistrationNumber,
            iemisNumber: normalizedIemisNumber,
            phone,
            address,
            gender,
            dateOfBirth: dob,
            bloodGroup,
            parentName,
            parentEmail,
            parentContactNumber: parentPhone,
            parentAlternativeContact: emergencyContact,
            status // Added status
        };

        if (Array.isArray(existingStudent.enrollments)) {
            const enrollments = existingStudent.enrollments.map((entry) => entry.toObject ? entry.toObject() : { ...entry });
            const currentIndex = enrollments.findIndex((entry) => String(entry.school) === String(schoolId) && entry.status === 'CURRENT');
            if (currentIndex >= 0 && enrollments[currentIndex].grade === normalizedGrade) {
                enrollments[currentIndex] = { ...enrollments[currentIndex], section: normalizedSection, rollNumber: normalizedRollNumber };
                updateData.enrollments = enrollments;
            }
        }

        // Name Parsing for Update
        const nameChanged = Boolean(name) && String(name).trim() !== String(existingStudent.name || '').trim();
        if (
            nameChanged ||
            normalizedRollNumber !== existingStudent.rollNumber ||
            normalizedGrade !== existingStudent.grade
        ) {
            const effectiveName = name || existingStudent.name;
            const nameParts = effectiveName.trim().split(/\s+/);
            let firstName = nameParts[0];
            let middleName = "";
            let lastName = "";

            if (nameParts.length === 1) {
                lastName = ""; 
            } else if (nameParts.length === 2) {
                lastName = nameParts[1];
            } else {
                lastName = nameParts[nameParts.length - 1];
                middleName = nameParts.slice(1, -1).join(" ");
            }
            
            updateData.firstName = firstName;
            updateData.middleName = middleName;
            updateData.lastName = lastName;

            // Keep the username in step with the name. The password is left
            // alone: it may be one the student chose, and students sign in
            // with their IEMIS number, not the username.
            updateData.username = await generateUniqueStudentUsername(Student, {
                firstName,
                grade: normalizedGrade,
                rollNumber: normalizedRollNumber,
                school: schoolId,
                excludeId: id,
            });
        }

        Object.keys(updateData).forEach((key) => {
            if (updateData[key] === undefined) {
                delete updateData[key];
            }
        });

        // Student email is optional and separate from guardian email.
        if (email !== undefined && String(email).trim()) {
            updateData.email = String(email).trim();
        }

        // 5. Perform Update
        const updatedStudent = await Student.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        // Parent links carry the child's IEMIS number; keep them in step when
        // the school corrects it.
        if (updatedStudent && (existingStudent.iemisNumber || '') !== (updatedStudent.iemisNumber || '')) {
            await syncStudentIemisOnLinks(updatedStudent._id);
        }

        // Keep the guardian record in step with the student's parent details.
        // Without this a school that corrects a parent's name or adds a missing
        // phone number would have to remember a second, manual step — and the
        // roster would quietly show stale information until they did.
        const guardian = await syncGuardianFromStudentRecord({
            student: updatedStudent,
            schoolId,
            actorId: session.user.id,
        });

        return NextResponse.json({
            message: 'Student updated successfully',
            student: updatedStudent,
            guardianSynced: guardian.synced,
        }, { status: 200 });

    } catch (error) {
        console.error('Update Student Error:', error);
        return NextResponse.json({ 
            message: error.message || 'Error updating student' 
        }, { status: 500 });
    }
}

export async function DELETE(req, { params }) {
    try {
        const { session, error } = await requireApiSession(['SCHOOL_ADMIN']);
        if (error) return error;
        const schoolId = getSessionSchoolId(session);

        const { id } = await params;

        await connectDB();
        const deletedStudent = await Student.findOneAndUpdate(
            { _id: id, school: schoolId, isDeleted: { $ne: true } },
            {
                isDeleted: true,
                deletedAt: new Date(),
                deletedBy: session.user.id,
                status: 'INACTIVE',
                statusChangedAt: new Date(),
                statusChangedBy: session.user.id,
                statusReason: 'Removed by school admin',
            },
            { new: true }
        );

        if (!deletedStudent) {
            return NextResponse.json({ message: 'Student not found' }, { status: 404 });
        }

        return NextResponse.json({ message: 'Student archived successfully' }, { status: 200 });
    } catch (error) {
        console.error('Delete Student Error:', error);
        return NextResponse.json({ message: 'Error deleting student' }, { status: 500 });
    }
}


export async function PATCH(req, { params }) {
    try {
        const { session, error } = await requireApiSession(['SCHOOL_ADMIN']);
        if (error) return error;
        const schoolId = getSessionSchoolId(session);

        const { id } = await params;

        await connectDB();
        const studentDoc = await Student.findOne({
            _id: id,
            school: schoolId,
            isDeleted: { $ne: true },
        });

        if (!studentDoc) {
            return NextResponse.json({ message: 'Student not found' }, { status: 404 });
        }

        // A reset puts the student back on the default password.
        const newPassword = DEFAULT_STUDENT_PASSWORD;

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await Student.findByIdAndUpdate(
            id,
            { password: hashedPassword },
            { new: true }
        );

        if (studentDoc.email) {
            await User.findOneAndUpdate(
                { email: studentDoc.email },
                { password: hashedPassword }
            );
        }

        return NextResponse.json(
            {
                message: 'Password reset successfully',
                credentials: {
                    name: studentDoc.name,
                    username: studentDoc.username,
                    email: studentDoc.email,
                    password: newPassword,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Reset Student Password Error:', error);
        return NextResponse.json({ message: 'Error resetting password' }, { status: 500 });
    }
}

import mongoose from 'mongoose';
import { NextResponse } from 'next/server';
import { defineRoute } from '@/lib/routeHandler';
import { successResponse, APIError } from '@/lib/apiResponse';
import SchoolConfig from '@/models/SchoolConfig';
import User from '@/models/User';
import Student from '@/models/Student';
import CasSubject from '@pravyo/db/models/cas/CasSubject';
import { getEquivalentGradeValues, resolveSchoolGrades } from '@/lib/schoolGrades';

/**
 * Manage Sections — the single source of truth for which sections each grade
 * has. Every section dropdown and filter in Pravyo and CAS reads this list.
 *
 * Each change saves on its own (no separate Save step):
 *   GET    — sections per grade, with how many current students sit in each
 *   POST   — add a section            { grade, name }
 *   PATCH  — rename a section         { grade, from, to }   (moves its students)
 *   DELETE — delete a section         { grade, name }        (its students become "No section")
 *
 * History is never rewritten: published report cards and past academic-year
 * records keep the section they were issued under, so CAS Published Results
 * can still filter by a section that has since been deleted.
 */

const MAX_NAME = 40;
const same = (a, b) => String(a).toLocaleLowerCase() === String(b).toLocaleLowerCase();

async function loadState(school) {
  const [user, config] = await Promise.all([
    User.findById(school).select('schoolConfig').lean(),
    SchoolConfig.findOne({ school }).select('gradeSections grades gradesCustomized').lean(),
  ]);
  const grades = resolveSchoolGrades(user?.schoolConfig, config);
  const stored = config?.gradeSections || [];
  return {
    grades,
    sectionsFor: (grade) => [...(stored.find((row) => row.grade === grade)?.sections || [])],
    stored,
  };
}

function studentsIn(school, grade, section) {
  return {
    school,
    isDeleted: { $ne: true },
    grade: { $in: getEquivalentGradeValues(grade) },
    // Case-insensitive exact match, so "a" and "A" are the same section.
    section: { $regex: `^${String(section).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
  };
}

// Sections of grades the school no longer offers are kept, so adding the
// grade back brings its sections back.
function withRemovedGrades(next, stored, grades) {
  return [...next, ...stored.filter((row) => !grades.includes(row.grade))];
}

async function saveGrade(school, grades, stored, grade, sections) {
  const next = grades.map((label) => ({
    grade: label,
    sections: label === grade ? sections : stored.find((row) => row.grade === label)?.sections || [],
  }));
  await SchoolConfig.findOneAndUpdate(
    { school },
    { $set: { gradeSections: withRemovedGrades(next, stored, grades) } },
    { upsert: true, runValidators: true },
  );
}

function cleanName(value) {
  const name = String(value || '').trim();
  if (!name) throw new APIError('Enter a section name', 400, 'VALIDATION_ERROR');
  if (name.length > MAX_NAME) throw new APIError(`Section names may not exceed ${MAX_NAME} characters`, 400, 'VALIDATION_ERROR');
  return name;
}

async function requireGrade(school, value) {
  const state = await loadState(school);
  const grade = String(value || '').trim();
  if (!state.grades.includes(grade)) throw new APIError('Choose a grade configured for this school', 400, 'VALIDATION_ERROR');
  return { ...state, grade };
}

export const GET = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ session }) => {
  const school = session.user.id;
  const state = await loadState(school);

  // Sections already on current students but missing from the list (from an
  // older import or before Manage Sections existed) are registered here, so
  // nothing a student carries is ever invisible to the school.
  const placed = await Student.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(school), isDeleted: { $ne: true }, section: { $nin: ['', null] } } },
    { $group: { _id: { grade: '$grade', section: '$section' }, count: { $sum: 1 } } },
  ]);
  let changed = false;
  const lists = new Map(state.grades.map((grade) => [grade, state.sectionsFor(grade)]));
  const counts = new Map();
  for (const row of placed) {
    const grade = state.grades.find((label) => getEquivalentGradeValues(label).includes(String(row._id.grade)));
    if (!grade) continue;
    const list = lists.get(grade);
    let name = list.find((candidate) => same(candidate, row._id.section));
    if (!name) {
      name = String(row._id.section).trim();
      list.push(name);
      changed = true;
    }
    const key = `${grade}|${name.toLocaleLowerCase()}`;
    counts.set(key, (counts.get(key) || 0) + row.count);
  }
  if (changed) {
    await SchoolConfig.findOneAndUpdate(
      { school },
      {
        $set: {
          gradeSections: withRemovedGrades(
            state.grades.map((grade) => ({ grade, sections: lists.get(grade) })),
            state.stored,
            state.grades,
          ),
        },
      },
      { upsert: true, runValidators: true },
    );
  }

  // `sections` stays a plain list of names per grade (the student screens read
  // it that way); `students` adds how many current students sit in each one.
  return NextResponse.json({
    grades: state.grades,
    sections: state.grades.map((grade) => ({ grade, sections: lists.get(grade) })),
    students: state.grades.map((grade) => ({
      grade,
      counts: Object.fromEntries(lists.get(grade).map((name) => [name, counts.get(`${grade}|${name.toLocaleLowerCase()}`) || 0])),
    })),
  });
});

export const POST = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const body = await request.json().catch(() => ({}));
  const { grades, stored, grade, sectionsFor } = await requireGrade(school, body.grade);
  const name = cleanName(body.name);
  const sections = sectionsFor(grade);
  if (sections.some((existing) => same(existing, name))) throw new APIError(`${grade} already has section ${name}`, 409, 'CONFLICT');
  await saveGrade(school, grades, stored, grade, [...sections, name]);
  return successResponse(201, `Section ${name} added to ${grade}`, { grade, name });
});

export const PATCH = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const body = await request.json().catch(() => ({}));
  const { grades, stored, grade, sectionsFor } = await requireGrade(school, body.grade);
  const from = cleanName(body.from);
  const to = cleanName(body.to);
  const sections = sectionsFor(grade);
  const index = sections.findIndex((existing) => same(existing, from));
  if (index < 0) throw new APIError(`${grade} has no section ${from}`, 404, 'NOT_FOUND');
  if (!same(from, to) && sections.some((existing) => same(existing, to))) {
    throw new APIError(`${grade} already has section ${to}`, 409, 'CONFLICT');
  }
  const storedFrom = sections[index];
  sections[index] = to;
  const moved = await Student.updateMany(studentsIn(school, grade, from), { $set: { section: to } });
  // Subjects offered to this section follow the new name.
  await CasSubject.updateMany(
    { school, grade, sections: storedFrom },
    { $set: { 'sections.$[name]': to } },
    { arrayFilters: [{ name: storedFrom }] },
  );
  await saveGrade(school, grades, stored, grade, sections);
  return successResponse(200, `Section ${from} renamed to ${to}`, { students: moved.modifiedCount || 0 });
});

export const DELETE = defineRoute({ roles: ['SCHOOL_ADMIN'] }, async ({ request, session }) => {
  const school = session.user.id;
  const body = await request.json().catch(() => ({}));
  const { grades, stored, grade, sectionsFor } = await requireGrade(school, body.grade);
  const name = cleanName(body.name);
  const sections = sectionsFor(grade);
  if (!sections.some((existing) => same(existing, name))) throw new APIError(`${grade} has no section ${name}`, 404, 'NOT_FOUND');

  // Current students only. Published reports and past-year records keep the
  // section they were issued under.
  const cleared = await Student.updateMany(studentsIn(school, grade, name), { $set: { section: '' } });
  // Subjects limited to this section stop listing it. (A subject left with no
  // sections then applies to every section of the grade.)
  const matched = sections.find((existing) => same(existing, name));
  await CasSubject.updateMany({ school, grade, sections: matched }, { $pull: { sections: matched } });
  await saveGrade(school, grades, stored, grade, sections.filter((existing) => !same(existing, name)));
  const count = cleared.modifiedCount || 0;
  return successResponse(200, count
    ? `Section ${name} deleted. ${count} student${count === 1 ? '' : 's'} moved to No section.`
    : `Section ${name} deleted.`, { students: count });
});

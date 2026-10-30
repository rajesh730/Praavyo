import test from 'node:test';
import assert from 'node:assert/strict';
import { bookThemeMetadata } from '../lib/casBookThemes.js';

test('the referenced Nepali book page displays 15 working hours for theme 1', () => {
  assert.deepEqual(bookThemeMetadata({
    grade: 'Grade 3',
    subjectCode: 'NEP',
    outcomes: [{ code: 'NEP-T1-01', themeNe: 'म र मेरो परिवार' }],
  }), { sequence: 1, workingHours: 15, assessmentProjectHours: null, sourcePage: 11 });
});

test('English teaching and assessment/project hours stay separate', () => {
  const metadata = bookThemeMetadata({
    grade: 'Grade 3',
    subjectCode: 'ENG',
    outcomes: [{ code: 'ENG-T2-01', themeEn: 'My Daily Life' }],
  });
  assert.equal(metadata.workingHours, 15);
  assert.equal(metadata.assessmentProjectHours, 2);
});

test('another grade, custom theme, or mixed theme never inherits book hours', () => {
  const sheet = {
    grade: 'Grade 3', subjectCode: 'NEP',
    outcomes: [{ code: 'NEP-T1-01', themeNe: 'म र मेरो परिवार' }],
  };
  assert.equal(bookThemeMetadata({ ...sheet, grade: 'Grade 4' }), null);
  assert.equal(bookThemeMetadata({ ...sheet, outcomes: [] }), null);
  assert.equal(bookThemeMetadata({ ...sheet, outcomes: [{ code: 'CUSTOM-1', themeNe: 'म र मेरो परिवार' }] }), null);
  assert.equal(bookThemeMetadata({ ...sheet, outcomes: [{ code: 'NEP-T1-01', themeEn: 'New theme' }] }), null);
  assert.equal(bookThemeMetadata({
    ...sheet,
    outcomes: [...sheet.outcomes, { code: 'NEP-T2-01', themeNe: 'मेरो दैनिक जीवन' }],
  }), null);
});

import assert from 'node:assert/strict';
import { it } from 'node:test';
import { assessmentColumns, bilingualText, pickBilingual } from '../lib/casBilingual.js';

it('keeps English and Nepali assessment text in their own languages', () => {
  assert.deepEqual(bilingualText('Listening', 'सुनाइ'), { en: 'Listening', ne: 'सुनाइ' });
  assert.deepEqual(bilingualText('Listening', ''), { en: 'Listening', ne: '' });
});

it('reads Nepali text stored in the old single field as the Nepali version', () => {
  assert.deepEqual(
    assessmentColumns({ assessmentAspect: 'दृश्यबोध', assessmentTool: 'अवलोकन' }),
    { assessmentAspect: '', assessmentAspectNe: 'दृश्यबोध', assessmentTool: '', assessmentToolNe: 'अवलोकन' },
  );
});

it('falls back to the available curriculum language for display', () => {
  assert.equal(pickBilingual('', 'Nepali-only outcome', 'en'), 'Nepali-only outcome');
  assert.equal(pickBilingual('English-only outcome', '', 'ne'), 'English-only outcome');
  assert.equal(pickBilingual('English outcome', 'Nepali outcome', 'en'), 'English outcome');
  assert.equal(pickBilingual('English outcome', 'Nepali outcome', 'ne'), 'Nepali outcome');
});

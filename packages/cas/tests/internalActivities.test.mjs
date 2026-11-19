import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ACTIVITIES, activitiesOf, activityLines, activityProblems, activityValue, parseActivityMark } from '@pravyo/core/internalActivities';

test('a school without its own list uses the default eight, each out of 10', () => {
  assert.equal(activitiesOf(null).length, 8);
  assert.ok(activitiesOf(null).every((field) => field.fullMarks === 10));
  assert.deepEqual(activitiesOf({ fields: [] }), [], 'a saved empty list stays empty');
});

test('marks win; old text values still read back', () => {
  const record = { activityMarks: { discipline: 9 }, extraActivities: { discipline: '5', eca: '8', artCraft: 'A', handwriting: '' } };
  assert.equal(activityValue(record, 'discipline'), 9);
  assert.equal(activityValue(record, 'eca'), 8, 'old "8" reads as a mark');
  assert.equal(activityValue(record, 'artCraft'), 'A', 'an old grade is kept as text');
  assert.equal(activityValue(record, 'handwriting'), null);
  const lines = activityLines([{ id: 'discipline', name: 'Discipline', fullMarks: 10 }], record);
  assert.deepEqual(lines, [{ id: 'discipline', name: 'Discipline', fullMarks: 10, obtained: 9 }]);
});

test('a cell is blank, a mark within full marks, or refused', () => {
  assert.equal(parseActivityMark('', 10), null);
  assert.equal(parseActivityMark('9.5', 10), 9.5);
  assert.equal(parseActivityMark('11', 10), undefined);
  assert.equal(parseActivityMark('A', 10), undefined);
});

test('the list needs names, unique names and full marks from 1 to 100', () => {
  assert.deepEqual(activityProblems(DEFAULT_ACTIVITIES), []);
  assert.match(activityProblems([{ id: 'ameditation1', name: '', fullMarks: 5 }])[0], /needs a name/);
  assert.match(activityProblems([{ id: 'abc1', name: 'ECA', fullMarks: 5 }, { id: 'abc2', name: 'eca', fullMarks: 5 }]).join(' '), /listed twice/);
  assert.match(activityProblems([{ id: 'abc1', name: 'Yoga', fullMarks: 0 }])[0], /between 1 and 100/);
});

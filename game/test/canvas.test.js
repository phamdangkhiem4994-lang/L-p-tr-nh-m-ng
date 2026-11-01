import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DrawingPad } from '../client/canvas.js';

function pad() {
  const value = Object.create(DrawingPad.prototype);
  Object.assign(value, { strokes: [], redoStrokes: [], locked: false, pointer: null,
    color: '#302c38', inkColor: '#302c38', render() {}, onChange() {} });
  return value;
}
const stroke = color => ({ color, size: 5, points: [{ x: .5, y: .5 }] });

test('undo and redo preserve the order and content of strokes', () => {
  const p = pad(), first = stroke('#7149bd'), second = stroke('#468d79');
  p.strokes.push(first, second);
  p.undo(); p.undo();
  assert.deepEqual(p.strokes, []);
  p.redo(); p.redo();
  assert.deepEqual(p.strokes, [first, second]);
  assert.equal(p.hasInk(), true);
});
test('clear can be undone one stroke at a time', () => {
  const p = pad(), first = stroke('#7149bd'), second = stroke('#468d79');
  p.strokes.push(first, second);
  p.clear();
  assert.equal(p.hasInk(), false);
  p.redo(); p.redo();
  assert.deepEqual(p.strokes, [first, second]);
});
test('new drawing discards redo history', () => {
  const p = pad();
  p.strokes.push(stroke('#7149bd')); p.undo();
  p.canvas = { setPointerCapture() {} }; p.point = () => ({ x: .2, y: .3 });
  p.down({ button: 0, pointerId: 1, preventDefault() {} });
  assert.equal(p.redoStrokes.length, 0);
  p.end({ pointerId: 1 }); p.redo();
  assert.equal(p.strokes.length, 1);
});
test('submitted drawing cannot be changed by history commands', () => {
  const p = pad(); p.strokes.push(stroke('#7149bd')); p.undo();
  p.locked = true; p.redo(); assert.equal(p.strokes.length, 0);
  p.locked = false; p.redo(); p.locked = true; p.undo(); p.clear();
  assert.equal(p.strokes.length, 1);
});
test('eraser returns to the chosen ink color', () => {
  const p = pad(); p.selectColor('#7149bd'); p.toggleEraser();
  assert.equal(p.color, '#ffffff'); p.toggleEraser();
  assert.equal(p.color, '#7149bd');
  p.toggleEraser(); p.selectColor('#468d79');
  assert.equal(p.color, '#468d79');
});

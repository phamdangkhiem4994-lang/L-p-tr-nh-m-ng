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

test('eraser returns to the chosen ink color', () => {
  const p = pad(); p.selectColor('#7149bd'); p.toggleEraser();
  assert.equal(p.color, '#ffffff'); p.toggleEraser();
  assert.equal(p.color, '#7149bd');
  p.toggleEraser(); p.selectColor('#468d79');
  assert.equal(p.color, '#468d79');
});

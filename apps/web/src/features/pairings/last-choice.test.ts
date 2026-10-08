import { afterEach, describe, expect, it } from 'vitest';
import { readLastChoice, startChoice, writeLastChoice } from './last-choice';

afterEach(() => {
  localStorage.clear();
});

describe('the planner’s remembered choice', () => {
  it('reopens the last event, team and opponent when the address names none', () => {
    writeLastChoice({ event: 'E1', team: 'T1', opponent: 'T2' });
    expect(startChoice({})).toEqual({ event: 'E1', team: 'T1', opponent: 'T2' });
  });

  it('an address that names an event wins over the remembered one', () => {
    writeLastChoice({ event: 'E1', team: 'T1' });
    expect(startChoice({ event: 'E9' })).toBeNull();
  });

  it('nothing remembered, or something unreadable, starts empty', () => {
    expect(startChoice({})).toBeNull();
    localStorage.setItem('pairings:last-choice', '{oops');
    expect(readLastChoice()).toEqual({});
  });
});

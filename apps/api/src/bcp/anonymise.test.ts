import { describe, expect, it } from 'vitest';
import { Anonymiser } from './anonymise';

describe('Anonymiser', () => {
  it('replaces player names consistently across objects and metaData', () => {
    const anonymiser = new Anonymiser();
    const result = anonymiser.anonymise({
      user: { id: 'U1', firstName: 'Ada', lastName: 'Archer', email: 'ada@example.com' },
      metaData: {
        'p1-firstName': 'Ada',
        'p1-lastName': 'Archer',
        'lbl-player1': 'Ada Archer',
        'p2-firstName': 'Ben',
        'p2-lastName': 'Baker',
        'p1-victoryPoints': 80,
      },
    });

    expect(result).toEqual({
      user: { id: 'U1', firstName: 'Player', lastName: '001' },
      metaData: {
        'p1-firstName': 'Player',
        'p1-lastName': '001',
        'lbl-player1': 'Player 001',
        'p2-firstName': 'Player',
        'p2-lastName': '002',
        'p1-victoryPoints': 80,
      },
    });
  });

  it('renames teams but keeps factions, armies and event names', () => {
    const anonymiser = new Anonymiser();
    const result = anonymiser.anonymise({
      name: 'AdeptiCon Teams',
      teams: [
        { id: 'T1', name: 'Salt Miners', captainId: 'C1', captain: { firstName: 'X' } },
        { id: 'T2', name: 'Tiki Gods', captainId: 'C2' },
      ],
      player: {
        team: { id: 'T1', name: 'Salt Miners' },
        faction: { name: 'Orks' },
        army: { name: 'Orks' },
      },
      pairingPlayer: { team: 'Tiki Gods' },
    });

    expect(result).toEqual({
      name: 'AdeptiCon Teams',
      teams: [
        { id: 'T1', name: 'Team 001', captainId: 'C1' },
        { id: 'T2', name: 'Team 002', captainId: 'C2' },
      ],
      player: {
        team: { id: 'T1', name: 'Team 001' },
        faction: { name: 'Orks' },
        army: { name: 'Orks' },
      },
      pairingPlayer: { team: 'Team 002' },
    });
  });

  it('drops the owner name fields', () => {
    const result = new Anonymiser().anonymise({
      id: 'L1',
      ownerFirstName: 'Ada',
      ownerLastName: 'Lovelace',
      armyListText: 'Gladius',
    });
    expect(result).toEqual({ id: 'L1', armyListText: 'Gladius' });
  });
});
